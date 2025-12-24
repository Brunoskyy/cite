import recorded from '@/fixtures/answers.json'

import type { Passage } from './types'

export interface Fixture {
  question: string
  passages: Passage[]
  answer: string
}

export const FIXTURES: readonly Fixture[] = recorded as Fixture[]

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const byQuestion = new Map(FIXTURES.map((f) => [normalizeQuestion(f.question), f]))

export function findFixture(question: string): Fixture | null {
  return byQuestion.get(normalizeQuestion(question)) ?? null
}

/**
 * Replays a recorded answer the way the API would stream it: a few
 * characters at a time, with a small pause, so the UI exercises the same
 * path as a live answer.
 */
export async function* replay(
  answer: string,
  signal?: AbortSignal,
  delayMs = 12,
): AsyncGenerator<string> {
  let i = 0
  while (i < answer.length) {
    if (signal?.aborted) return
    const size = 3 + ((i * 7) % 6)
    yield answer.slice(i, i + size)
    i += size
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
  }
}
