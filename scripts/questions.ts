import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseQuestions, resolveQuestions, type Question } from '../src/lib/evals'

export function loadQuestions(): Question[] {
  const specs = parseQuestions(readFileSync(join(process.cwd(), 'evals', 'questions.yaml'), 'utf8'))
  return resolveQuestions(specs, (f) => readFileSync(join(process.cwd(), 'corpus', f), 'utf8'))
}

export function argument(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

export function runId(suffix: string): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${suffix}`
}
