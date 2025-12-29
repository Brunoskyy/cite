import 'dotenv/config'

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

import { closeDb } from '../src/lib/db'
import { answerMetrics, overlaps, type AnswerResult, type AnswerRun } from '../src/lib/evals'
import { createClient, generateAnswer, MODEL } from '../src/lib/generate'
import { retrieve } from '../src/lib/retrieve'
import type { Passage, RetrievalMode } from '../src/lib/types'
import { argument, loadQuestions, runId } from './questions'

/**
 * Asks every question through the real pipeline and grades the answers.
 * Needs an API key: it makes one answer call and, for answered questions,
 * one grading call each, so a full run is about ninety requests.
 *
 *   npm run eval:answers -- --label "prompt v2"
 */
const Verdict = z.object({
  supported: z
    .boolean()
    .describe('true only if every factual claim is supported by the passage it cites'),
  unsupported_claims: z
    .array(z.string())
    .describe('claims not supported by their cited passages; empty when supported'),
})

const GRADER_SYSTEM = `You check answers for faithfulness to their sources. You get numbered passages and an answer that cites them as [n]. Decide whether every factual claim in the answer is supported by the passages it cites. Style, completeness and helpfulness do not matter; only whether anything is stated that the cited passages do not support.`

async function grade(anthropic: Anthropic, passages: Passage[], answer: string): Promise<boolean> {
  const numbered = passages
    .map((p, i) => `[${i + 1}] ${p.file}:${p.startLine}-${p.endLine}\n${p.text}`)
    .join('\n\n')
  const response = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: GRADER_SYSTEM,
    messages: [{ role: 'user', content: `Passages:\n\n${numbered}\n\nAnswer:\n\n${answer}` }],
    output_config: { effort: 'low', format: betaZodOutputFormat(Verdict) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error('the grader returned no verdict')
  }
  return response.parsed_output.supported
}

async function main() {
  const client = createClient()
  if (!client) {
    console.log(
      'eval:answers needs ANTHROPIC_API_KEY. The retrieval evals (npm run eval:retrieval) run without one.',
    )
    return
  }
  const anthropic = new Anthropic()
  const mode = (argument('mode') ?? 'rerank') as RetrievalMode
  const label = argument('label') ?? `answers, ${mode}`
  const questions = loadQuestions()

  const results: AnswerResult[] = []
  for (const q of questions) {
    const passages = (await retrieve(q.question, { mode, k: 6 })).map((s) => s.passage)
    let answer = ''
    const cited = new Set<number>()
    let refused = false
    let invalid = 0
    for await (const e of generateAnswer(client, q.question, passages)) {
      if (e.type === 'text') answer += e.text
      if (e.type === 'cite') {
        e.indices.forEach((n) => cited.add(n))
        answer += `[${e.indices.join(', ')}]`
      }
      if (e.type === 'done') {
        refused = e.refused
        invalid = e.invalidCitations.length
      }
      if (e.type === 'error') throw new Error(`${q.id}: ${e.message}`)
    }
    const expected = q.expected
    const citedExpected = expected
      ? [...cited].some((n) => passages[n - 1] && overlaps(passages[n - 1]!, expected))
      : false
    const faithful = refused || !q.answerable ? null : await grade(anthropic, passages, answer)
    results.push({
      id: q.id,
      answerable: q.answerable,
      refused,
      citationsValid: invalid === 0,
      citedExpected,
      faithful,
      answer,
    })
    process.stdout.write(refused ? 'r' : faithful === false ? 'x' : '.')
  }
  process.stdout.write('\n')

  const run: AnswerRun = {
    kind: 'answers',
    id: runId('answers'),
    label,
    model: MODEL,
    mode,
    createdAt: new Date().toISOString(),
    metrics: answerMetrics(results),
    results,
  }
  const dir = join(process.cwd(), 'evals', 'runs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${run.id}.json`), JSON.stringify(run, null, 2) + '\n')
  console.log(JSON.stringify(run.metrics, null, 2))
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void closeDb())
