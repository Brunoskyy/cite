import { parse } from 'yaml'
import { z } from 'zod'

import { parseFrontMatter } from './chunk'
import type { Passage, RetrievalMode } from './types'

const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    question: z.string().min(5),
    file: z.string().optional(),
    section: z.string().optional(),
    lines: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
    answerable: z.boolean().default(true),
  })
  .refine((q) => !q.answerable || (q.file && (q.section || q.lines)), {
    message: 'an answerable question needs a file and a section or line range',
  })

export type QuestionSpec = z.infer<typeof QuestionSchema>

export interface Question {
  id: string
  question: string
  answerable: boolean
  expected: { file: string; startLine: number; endLine: number } | null
}

export function parseQuestions(source: string): QuestionSpec[] {
  const list = z.array(QuestionSchema).parse(parse(source))
  const ids = new Set<string>()
  for (const q of list) {
    if (ids.has(q.id)) throw new Error(`duplicate question id ${q.id}`)
    ids.add(q.id)
  }
  return list
}

/**
 * The line range of a section: from its heading to the line before the next
 * heading of the same or a higher level. Headings inside code fences do not
 * count. Throws when the heading is not in the file, so a renamed section
 * breaks the eval loudly instead of silently scoring zero.
 */
export function sectionRange(source: string, heading: string): [number, number] {
  const lines = source.split('\n')
  const { bodyStart } = parseFrontMatter(source)
  let inFence = false
  let start = -1
  let level = 0
  for (let i = bodyStart; i < lines.length; i += 1) {
    const text = lines[i] ?? ''
    if (/^\s*(```|~~~)/.test(text)) inFence = !inFence
    if (inFence) continue
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(text)
    if (!m?.[1] || !m[2]) continue
    if (start === -1) {
      if (m[2] === heading) {
        start = i + 1
        level = m[1].length
      }
    } else if (m[1].length <= level) {
      return [start, i]
    }
  }
  if (start === -1) throw new Error(`section "${heading}" not found`)
  return [start, lines.length]
}

export function resolveQuestions(
  specs: QuestionSpec[],
  read: (file: string) => string,
): Question[] {
  return specs.map((q) => {
    if (!q.answerable || !q.file)
      return { id: q.id, question: q.question, answerable: false, expected: null }
    const [startLine, endLine] = q.lines ?? sectionRange(read(q.file), q.section!)
    return {
      id: q.id,
      question: q.question,
      answerable: true,
      expected: { file: q.file, startLine, endLine },
    }
  })
}

export function overlaps(
  p: Pick<Passage, 'file' | 'startLine' | 'endLine'>,
  e: NonNullable<Question['expected']>,
): boolean {
  return p.file === e.file && p.startLine <= e.endLine && p.endLine >= e.startLine
}

export interface RetrievalResult {
  id: string
  /** 1-based rank of the first passage that overlaps the expected lines, or null. */
  rank: number | null
  retrieved: string[]
}

export interface RetrievalMetrics {
  n: number
  recallAt1: number
  recallAt3: number
  recallAt5: number
  mrr: number
}

export function scoreRetrieval(question: Question, passages: Passage[]): RetrievalResult {
  const expected = question.expected
  const index = expected ? passages.findIndex((p) => overlaps(p, expected)) : -1
  return {
    id: question.id,
    rank: index === -1 ? null : index + 1,
    retrieved: passages.map((p) => `${p.file}:${p.startLine}-${p.endLine}`),
  }
}

export function retrievalMetrics(results: RetrievalResult[]): RetrievalMetrics {
  const n = results.length
  const at = (k: number) => results.filter((r) => r.rank !== null && r.rank <= k).length / (n || 1)
  const mrr = results.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / (n || 1)
  return {
    n,
    recallAt1: round(at(1)),
    recallAt3: round(at(3)),
    recallAt5: round(at(5)),
    mrr: round(mrr),
  }
}

export interface AnswerResult {
  id: string
  answerable: boolean
  refused: boolean
  /** Every citation in the answer pointed at a passage that was sent. */
  citationsValid: boolean
  /** At least one cited passage overlaps the expected lines. */
  citedExpected: boolean
  /** Grader verdict: every claim is supported by the cited passages. Null when not graded. */
  faithful: boolean | null
  answer: string
}

export interface AnswerMetrics {
  answered: number
  citationValidity: number
  citedExpected: number
  faithfulness: number | null
  /** Share of unanswerable questions that got the refusal. */
  correctRefusals: number
  /** Share of answerable questions that were wrongly refused. */
  falseRefusals: number
}

export function answerMetrics(results: AnswerResult[]): AnswerMetrics {
  const answerable = results.filter((r) => r.answerable)
  const absent = results.filter((r) => !r.answerable)
  const answered = answerable.filter((r) => !r.refused)
  const graded = answered.filter((r) => r.faithful !== null)
  const share = (xs: unknown[], of: unknown[]) => round(xs.length / (of.length || 1))
  return {
    answered: answered.length,
    citationValidity: share(
      answered.filter((r) => r.citationsValid),
      answered,
    ),
    citedExpected: share(
      answered.filter((r) => r.citedExpected),
      answered,
    ),
    faithfulness: graded.length
      ? share(
          graded.filter((r) => r.faithful),
          graded,
        )
      : null,
    correctRefusals: share(
      absent.filter((r) => r.refused),
      absent,
    ),
    falseRefusals: share(
      answerable.filter((r) => r.refused),
      answerable,
    ),
  }
}

export interface RetrievalRun {
  kind: 'retrieval'
  id: string
  label: string
  mode: RetrievalMode
  k: number
  createdAt: string
  /** Mean wall-clock milliseconds per question, retrieval only. */
  msPerQuestion: number
  metrics: RetrievalMetrics
  results: RetrievalResult[]
}

export interface AnswerRun {
  kind: 'answers'
  id: string
  label: string
  model: string
  mode: RetrievalMode
  createdAt: string
  metrics: AnswerMetrics
  results: AnswerResult[]
}

export type EvalRun = RetrievalRun | AnswerRun

function round(x: number): number {
  return Math.round(x * 1000) / 1000
}
