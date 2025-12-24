import { describe, expect, it, vi } from 'vitest'

import { fakeClient } from '../../test/fake-client'
import { answer, type StreamEvent } from './answer'
import { FIXTURES, findFixture, normalizeQuestion } from './fixtures'
import { parseAnswer } from './citations'
import type { Passage } from './types'

const passage: Passage = {
  id: 1,
  file: 'a.md',
  title: 'A',
  headings: [],
  startLine: 1,
  endLine: 2,
  text: 'x',
}

async function collect(it: AsyncIterable<StreamEvent>) {
  const out: StreamEvent[] = []
  for await (const e of it) out.push(e)
  return out
}

describe('fixtures', () => {
  it('match questions loosely', () => {
    expect(normalizeQuestion('  How do I CANCEL a query, manually?! ')).toBe(
      'how do i cancel a query manually',
    )
    expect(findFixture('how do i cancel a query manually')).not.toBeNull()
    expect(findFixture('something else')).toBeNull()
  })

  it('every recorded answer cites only passages it was recorded with', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(6)
    for (const f of FIXTURES) {
      const { stats } = parseAnswer(f.answer, f.passages.length)
      expect(stats.invalid).toEqual([])
      if (!f.answer.startsWith("I couldn't")) expect(stats.citations).toBeGreaterThan(0)
    }
  })
})

describe('answer', () => {
  it('replays a fixture with its own passages when there is no key', async () => {
    const retrieve = vi.fn()
    const events = await collect(
      answer('How do I cancel a query manually?', 'rerank', {
        retrieve,
        client: null,
        replayDelayMs: 0,
      }),
    )
    expect(retrieve).not.toHaveBeenCalled()
    expect(events[0]).toMatchObject({ type: 'sources', source: 'recorded' })
    const text = events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
    expect(text).toContain('queryClient.cancelQueries')
    expect(events.some((e) => e.type === 'cite')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'recorded', invalidCitations: [] })
  })

  it('marks the recorded refusal as a refusal', async () => {
    const events = await collect(
      answer("How do I configure SWR's dedupingInterval?", 'rerank', {
        retrieve: vi.fn(),
        client: null,
        replayDelayMs: 0,
      }),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done', refused: true })
  })

  it('returns passages and a notice for other questions without a key', async () => {
    const retrieve = vi.fn().mockResolvedValue([passage])
    const events = await collect(answer('What is a query?', 'hybrid', { retrieve, client: null }))
    expect(retrieve).toHaveBeenCalledWith('What is a query?', 'hybrid')
    expect(events).toEqual([
      { type: 'sources', passages: [passage], source: 'retrieved', mode: 'hybrid' },
      { type: 'notice', kind: 'no-key' },
    ])
  })

  it('streams a live answer when a client is configured, even for a demo question', async () => {
    const retrieve = vi.fn().mockResolvedValue([passage])
    const client = fakeClient({ chunks: ['Live answer [1].'] })
    const events = await collect(
      answer('How do I cancel a query manually?', 'rerank', { retrieve, client }),
    )
    expect(events[0]).toMatchObject({ type: 'sources', source: 'retrieved' })
    expect(events.some((e) => e.type === 'cite')).toBe(true)
    expect(client.calls).toHaveLength(1)
  })

  it('stops replaying when aborted', async () => {
    const controller = new AbortController()
    const out: StreamEvent[] = []
    for await (const e of answer(
      'How do I cancel a query manually?',
      'rerank',
      {
        retrieve: vi.fn(),
        client: null,
        replayDelayMs: 0,
      },
      controller.signal,
    )) {
      out.push(e)
      if (out.length === 3) controller.abort()
    }
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out.some((e) => e.type === 'done')).toBe(false)
  })
})
