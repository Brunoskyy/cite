import 'dotenv/config'

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'
import { z } from 'zod'

import { parseAnswer } from '../src/lib/citations'
import { closeDb } from '../src/lib/db'
import { retrieve } from '../src/lib/retrieve'
import type { Passage } from '../src/lib/types'

/**
 * Builds the no-key demo. For each question in fixtures/answers.yaml it
 * retrieves the passages the app would send (hybrid + rerank, top 6),
 * checks that the hand-written answer cites only those passages and cites
 * at least one, and writes question, passages and answer to
 * src/fixtures/answers.json. With --print it only shows the passages, to
 * write an answer against.
 */
const Entry = z.object({ question: z.string(), answer: z.string().optional() })

/** `{{guides/a.md:12, b.md:3}}` becomes `[2, 5]`, by where those passages landed in this retrieval. */
export function resolveReferences(question: string, text: string, passages: Passage[]): string {
  if (/(?<![\w`)])\[\d/.test(text))
    throw new Error(`"${question}" uses a numbered citation; cite {{file:line}} instead`)
  return text.replace(/\{\{([^}]+)\}\}/g, (_, refs: string) => {
    const numbers = refs.split(',').map((ref) => {
      const [file, line] = ref.trim().split(':')
      const i = passages.findIndex((p) => p.file === file && p.startLine === Number(line))
      if (i === -1) throw new Error(`"${question}" cites ${ref.trim()}, which was not retrieved`)
      return i + 1
    })
    return `[${numbers.join(', ')}]`
  })
}

async function main() {
  const entries = z
    .array(Entry)
    .parse(parse(readFileSync(join(process.cwd(), 'fixtures', 'answers.yaml'), 'utf8')))
  const print = process.argv.includes('--print')
  const out: Array<{ question: string; passages: Passage[]; answer: string }> = []
  for (const e of entries) {
    const passages = (await retrieve(e.question, { mode: 'rerank', k: 6 })).map((s) => s.passage)
    if (print || !e.answer) {
      console.log(`\n## ${e.question}`)
      passages.forEach((p, i) => console.log(`[${i + 1}] ${p.file}:${p.startLine}-${p.endLine}`))
      continue
    }
    const answer = resolveReferences(e.question, e.answer, passages)
    const { stats } = parseAnswer(answer, passages.length)
    const refusal = answer.trim().startsWith("I couldn't find")
    if (!refusal && stats.citations === 0) throw new Error(`"${e.question}" has no citations`)
    out.push({ question: e.question, passages, answer: answer.trim() })
  }
  if (!print) {
    writeFileSync(
      join(process.cwd(), 'src', 'fixtures', 'answers.json'),
      JSON.stringify(out, null, 2) + '\n',
    )
    console.log(`wrote ${out.length} fixtures`)
  }
}

if (!process.env.VITEST) {
  main()
    .catch((e: unknown) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(() => void closeDb())
}
