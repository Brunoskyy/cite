import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  answerMetrics,
  overlaps,
  parseQuestions,
  resolveQuestions,
  retrievalMetrics,
  scoreRetrieval,
  sectionRange,
  type AnswerResult,
  type Question,
} from './evals'
import type { Passage } from './types'

const doc = [
  '---',
  'title: T',
  '---',
  '## A',
  'a',
  '### A.1',
  'x',
  '```',
  '## not',
  '```',
  '## B',
  'b',
].join('\n')

describe('sectionRange', () => {
  it('runs to the next heading of the same or higher level, ignoring code', () => {
    expect(sectionRange(doc, 'A')).toEqual([4, 10])
    expect(sectionRange(doc, 'A.1')).toEqual([6, 10])
    expect(sectionRange(doc, 'B')).toEqual([11, 12])
    expect(() => sectionRange(doc, 'not')).toThrow(/not found/)
  })
})

describe('the committed question set', () => {
  const specs = parseQuestions(readFileSync('evals/questions.yaml', 'utf8'))
  const questions = resolveQuestions(specs, (f) => readFileSync(`corpus/${f}`, 'utf8'))

  it('resolves every expected section in the corpus', () => {
    expect(questions.filter((q) => q.answerable).length).toBeGreaterThanOrEqual(40)
    expect(questions.filter((q) => !q.answerable).length).toBeGreaterThanOrEqual(8)
    for (const q of questions.filter((x) => x.expected)) {
      expect(q.expected!.endLine).toBeGreaterThanOrEqual(q.expected!.startLine)
    }
  })
})

describe('parseQuestions', () => {
  it('rejects an answerable question with nowhere to look, and duplicate ids', () => {
    expect(() => parseQuestions('- {id: a, question: "Where is it?"}')).toThrow()
    expect(() =>
      parseQuestions(
        '- {id: a, question: "Q one?", answerable: false}\n- {id: a, question: "Q two?", answerable: false}',
      ),
    ).toThrow(/duplicate/)
  })
})

const p = (file: string, a: number, b: number): Passage => ({
  id: a,
  file,
  title: '',
  headings: [],
  startLine: a,
  endLine: b,
  text: '',
})

describe('retrieval scoring', () => {
  const q: Question = {
    id: 'q',
    question: '?',
    answerable: true,
    expected: { file: 'x.md', startLine: 10, endLine: 20 },
  }

  it('finds the first overlapping passage', () => {
    expect(overlaps(p('x.md', 20, 30), q.expected!)).toBe(true)
    expect(overlaps(p('x.md', 21, 30), q.expected!)).toBe(false)
    expect(overlaps(p('y.md', 10, 20), q.expected!)).toBe(false)
    expect(scoreRetrieval(q, [p('y.md', 1, 2), p('x.md', 5, 12)]).rank).toBe(2)
    expect(scoreRetrieval(q, [p('y.md', 1, 2)]).rank).toBeNull()
  })

  it('computes recall@k and MRR', () => {
    const m = retrievalMetrics([
      { id: 'a', rank: 1, retrieved: [] },
      { id: 'b', rank: 3, retrieved: [] },
      { id: 'c', rank: null, retrieved: [] },
      { id: 'd', rank: 5, retrieved: [] },
    ])
    expect(m).toEqual({ n: 4, recallAt1: 0.25, recallAt3: 0.5, recallAt5: 0.75, mrr: 0.383 })
  })
})

describe('answer metrics', () => {
  const r = (over: Partial<AnswerResult>): AnswerResult => ({
    id: 'x',
    answerable: true,
    refused: false,
    citationsValid: true,
    citedExpected: true,
    faithful: true,
    answer: '',
    ...over,
  })

  it('separates correct refusals from false ones', () => {
    const m = answerMetrics([
      r({}),
      r({ citedExpected: false, faithful: false }),
      r({ refused: true }),
      r({ answerable: false, refused: true }),
      r({ answerable: false, refused: false }),
    ])
    expect(m).toEqual({
      answered: 2,
      citationValidity: 1,
      citedExpected: 0.5,
      faithfulness: 0.5,
      correctRefusals: 0.5,
      falseRefusals: 0.333,
    })
  })
})
