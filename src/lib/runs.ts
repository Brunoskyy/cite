import 'server-only'

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AnswerRun, EvalRun, RetrievalRun } from './evals'

const RUNS_DIR = join(process.cwd(), 'evals', 'runs')

export async function loadRuns(): Promise<EvalRun[]> {
  const files = (await readdir(RUNS_DIR).catch(() => [])).filter((f) => f.endsWith('.json')).sort()
  const runs = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(RUNS_DIR, f), 'utf8')) as EvalRun),
  )
  return runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const isRetrieval = (r: EvalRun): r is RetrievalRun => r.kind === 'retrieval'
export const isAnswers = (r: EvalRun): r is AnswerRun => r.kind === 'answers'
