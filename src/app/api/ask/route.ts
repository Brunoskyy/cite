import { z } from 'zod'

import { answer, type StreamEvent } from '@/lib/answer'
import { createClient } from '@/lib/generate'
import { Busy, clientKey, RateLimiter, readLimited, Semaphore } from '@/lib/limits'
import { retrieve } from '@/lib/retrieve'
import { RETRIEVAL_MODES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Ask a question of at least three characters.')
    .max(400, 'Keep the question under 400 characters.'),
  mode: z.enum(RETRIEVAL_MODES).default('rerank'),
})

const perClient = new RateLimiter(20, 60_000)
// Embedding and reranking are CPU work on this machine: two at a time, a few waiting.
const retrievalSlots = new Semaphore(2, 8)

export async function POST(request: Request): Promise<Response> {
  const wait = perClient.take(clientKey(request.headers))
  if (wait > 0) {
    return Response.json(
      { error: 'Too many questions in a minute. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(Math.ceil(wait / 1000)) } },
    )
  }
  const raw = await readLimited(request, 4096)
  if (raw === null) return Response.json({ error: 'Request body too large.' }, { status: 413 })
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Send JSON: { "question": "..." }.' }, { status: 400 })
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    )
  }
  const { question, mode } = parsed.data

  const encoder = new TextEncoder()
  const signal = request.signal
  const events = answer(
    question,
    mode,
    {
      retrieve: (q, m) =>
        retrievalSlots.run(async () =>
          (await retrieve(q, { mode: m, k: 6 })).map((s) => s.passage),
        ),
      client: createClient(),
    },
    signal,
  )

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(JSON.stringify(value satisfies StreamEvent) + '\n'))
      } catch (e) {
        const message =
          e instanceof Busy ? 'The server is busy. Try again in a moment.' : 'Search failed.'
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'error', message, retryable: true }) + '\n'),
        )
        controller.close()
      }
    },
    async cancel() {
      await events.return(undefined)
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
