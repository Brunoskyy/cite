import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'

import { fakeClient } from '../../test/fake-client'
import { generateAnswer, MODEL, requestParams, type AnswerEvent } from './generate'
import { REFUSAL } from './prompt'
import type { Passage } from './types'

const passages: Passage[] = [1, 2, 3].map((id) => ({
  id,
  file: `guides/f${id}.md`,
  title: 'T',
  headings: [],
  startLine: 1,
  endLine: 5,
  text: `passage ${id}`,
}))

async function collect(it: AsyncIterable<AnswerEvent>): Promise<AnswerEvent[]> {
  const out: AnswerEvent[] = []
  for await (const e of it) out.push(e)
  return out
}

describe('requestParams', () => {
  it('uses the current model, the fallback chain and the numbered passages', () => {
    const p = requestParams('How?', passages)
    expect(p.model).toBe(MODEL)
    expect(p).toMatchObject({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    expect(p.output_config).toEqual({ effort: 'medium' })
    expect('thinking' in p).toBe(false)
    expect(JSON.stringify(p.messages)).toContain('index=\\"3\\"')
  })
})

describe('generateAnswer', () => {
  it('streams text and citations, then a summary', async () => {
    const client = fakeClient({ chunks: ['Use cancel', 'Queries [', '1]. Also [2', ', 9].'] })
    const events = await collect(generateAnswer(client, 'q', passages))
    const body = events.filter((e) => e.type !== 'done')
    expect(body).toEqual([
      { type: 'text', text: 'Use cancel' },
      { type: 'text', text: 'Queries ' },
      { type: 'cite', indices: [1] },
      { type: 'text', text: '. Also ' },
      { type: 'cite', indices: [2] },
      { type: 'text', text: '.' },
    ])
    expect(events.at(-1)).toEqual({
      type: 'done',
      stopReason: 'end_turn',
      refused: false,
      declined: false,
      citations: 2,
      invalidCitations: [9],
      model: MODEL,
    })
    expect(client.calls).toHaveLength(1)
  })

  it('marks the not-in-the-docs answer as a refusal', async () => {
    const events = await collect(generateAnswer(fakeClient({ chunks: [REFUSAL] }), 'q', passages))
    expect(events.at(-1)).toMatchObject({ type: 'done', refused: true, declined: false })
  })

  it('reports a policy decline separately from a refusal', async () => {
    const events = await collect(
      generateAnswer(fakeClient({ chunks: [], stopReason: 'refusal' }), 'q', passages),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done', declined: true, stopReason: 'refusal' })
  })

  it('turns API errors into one error event', async () => {
    const error = new Anthropic.RateLimitError(429, { type: 'error' }, 'slow down', new Headers())
    const events = await collect(
      generateAnswer(
        fakeClient({ chunks: ['Partial [1]', ' more'], error, failAfter: 1 }),
        'q',
        passages,
      ),
    )
    expect(events).toEqual([
      { type: 'text', text: 'Partial ' },
      { type: 'cite', indices: [1] },
      {
        type: 'error',
        message: 'Rate limited by the API. Try again in a moment.',
        retryable: true,
      },
    ])
  })

  it('stops quietly when the caller aborts', async () => {
    const controller = new AbortController()
    const out: AnswerEvent[] = []
    for await (const e of generateAnswer(
      fakeClient({ chunks: ['a', 'b', 'c', 'd'] }),
      'q',
      passages,
      controller.signal,
    )) {
      out.push(e)
      if (out.length === 1) controller.abort()
    }
    expect(out).toEqual([{ type: 'text', text: 'a' }])
  })
})
