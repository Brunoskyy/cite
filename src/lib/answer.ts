import { CitationParser } from './citations'
import { findFixture, replay } from './fixtures'
import { generateAnswer, type AnswerEvent, type ModelClient } from './generate'
import { isRefusal } from './prompt'
import type { Passage, RetrievalMode } from './types'

/** Everything the ask endpoint streams, one JSON object per line. */
export type StreamEvent =
  | {
      type: 'sources'
      passages: Passage[]
      source: 'recorded' | 'retrieved'
      mode: RetrievalMode | null
    }
  | { type: 'notice'; kind: 'no-key' }
  | AnswerEvent

export interface AnswerDeps {
  retrieve: (question: string, mode: RetrievalMode) => Promise<Passage[]>
  client: ModelClient | null
  replayDelayMs?: number
}

/**
 * The whole answer path. A recorded demo question replays its fixture
 * with the passages it was written against. Anything else retrieves; with
 * a model client it streams a live answer, and without one it returns the
 * passages and says why there is no answer.
 */
export async function* answer(
  question: string,
  mode: RetrievalMode,
  deps: AnswerDeps,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const fixture = deps.client ? null : findFixture(question)
  if (fixture) {
    yield { type: 'sources', passages: fixture.passages, source: 'recorded', mode: null }
    const parser = new CitationParser(fixture.passages.length)
    for await (const chunk of replay(fixture.answer, signal, deps.replayDelayMs)) {
      for (const s of parser.push(chunk)) yield s
    }
    if (signal?.aborted) return
    for (const s of parser.end()) yield s
    yield {
      type: 'done',
      stopReason: 'end_turn',
      refused: isRefusal(fixture.answer),
      declined: false,
      citations: parser.stats.citations,
      invalidCitations: parser.stats.invalid,
      model: 'recorded',
    }
    return
  }

  const passages = await deps.retrieve(question, mode)
  yield { type: 'sources', passages, source: 'retrieved', mode }
  if (!deps.client) {
    yield { type: 'notice', kind: 'no-key' }
    return
  }
  yield* generateAnswer(deps.client, question, passages, signal)
}
