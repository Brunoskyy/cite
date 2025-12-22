import 'dotenv/config'

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { closeDb } from '../src/lib/db'
import { retrievalMetrics, scoreRetrieval, type RetrievalRun } from '../src/lib/evals'
import { retrieve } from '../src/lib/retrieve'
import { RETRIEVAL_MODES, type RetrievalMode } from '../src/lib/types'
import { argument, loadQuestions, runId } from './questions'

/**
 * Runs every answerable question through one retrieval mode and writes a
 * run file under evals/runs. No API key involved: this measures only
 * whether the right passage comes back, and how high.
 *
 *   npm run eval:retrieval -- --mode hybrid --label "hybrid, k=60"
 */
async function main() {
  const mode = (argument('mode') ?? 'hybrid') as RetrievalMode
  if (!RETRIEVAL_MODES.includes(mode))
    throw new Error(`--mode must be one of ${RETRIEVAL_MODES.join(', ')}`)
  const k = Number(argument('k') ?? 5)
  const label = argument('label') ?? mode
  const questions = loadQuestions().filter((q) => q.answerable)

  // Warm the models so the first question's load time is not counted.
  await retrieve('warm up', { mode, k })

  const results = []
  let ms = 0
  for (const q of questions) {
    const t = performance.now()
    const scored = await retrieve(q.question, { mode, k })
    ms += performance.now() - t
    results.push(
      scoreRetrieval(
        q,
        scored.map((s) => s.passage),
      ),
    )
  }
  const run: RetrievalRun = {
    kind: 'retrieval',
    id: runId(mode),
    label,
    mode,
    k,
    createdAt: new Date().toISOString(),
    msPerQuestion: Math.round(ms / questions.length),
    metrics: retrievalMetrics(results),
    results,
  }
  const dir = join(process.cwd(), 'evals', 'runs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${run.id}.json`), JSON.stringify(run, null, 2) + '\n')
  const m = run.metrics
  console.log(
    `${label}: recall@1 ${m.recallAt1}  recall@3 ${m.recallAt3}  recall@5 ${m.recallAt5}  MRR ${m.mrr}  (${m.n} questions, ${run.msPerQuestion} ms each)`,
  )
  const misses = results.filter((r) => r.rank === null).map((r) => r.id)
  if (misses.length) console.log(`  missed: ${misses.join(', ')}`)
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void closeDb())
