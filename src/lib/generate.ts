import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'

import { CitationParser } from './citations'
import { buildUserMessage, isRefusal, SYSTEM_PROMPT } from './prompt'
import type { Passage } from './types'

export const MODEL = 'claude-opus-5-5'

/**
 * The slice of the SDK this module uses, so tests can pass a fake that
 * emits the same stream events without a network or a key.
 */
export interface ModelStream extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<BetaMessage>
}
export interface ModelClient {
  beta: {
    messages: {
      stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): ModelStream
    }
  }
}

export type AnswerEvent =
  | { type: 'text'; text: string }
  | { type: 'cite'; indices: number[] }
  | {
      type: 'done'
      stopReason: string | null
      refused: boolean
      declined: boolean
      citations: number
      invalidCitations: number[]
      model: string
    }
  | { type: 'error'; message: string; retryable: boolean }

export function requestParams(
  question: string,
  passages: readonly Passage[],
): BetaMessageStreamParams {
  return {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(question, passages) }],
    // Grounded Q&A over a handful of passages: the default effort is plenty.
    output_config: { effort: 'medium' },
    // If a safety classifier declines, the API retries on its recommended
    // fallback model inside the same call instead of returning the refusal.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }
}

/**
 * Streams an answer as text segments and validated citations. Never
 * throws: API failures become one `error` event, so the route can always
 * finish its response cleanly.
 */
export async function* generateAnswer(
  client: ModelClient,
  question: string,
  passages: readonly Passage[],
  signal?: AbortSignal,
): AsyncGenerator<AnswerEvent> {
  const parser = new CitationParser(passages.length)
  let full = ''
  try {
    const stream = client.beta.messages.stream(
      requestParams(question, passages),
      signal ? { signal } : {},
    )
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text
        for (const segment of parser.push(event.delta.text)) yield segment
      }
    }
    for (const segment of parser.end()) yield segment
    const message = await stream.finalMessage()
    yield {
      type: 'done',
      stopReason: message.stop_reason,
      refused: isRefusal(full),
      // A policy decline from the whole fallback chain, not the "not in the docs" answer.
      declined: message.stop_reason === 'refusal',
      citations: parser.stats.citations,
      invalidCitations: parser.stats.invalid,
      model: message.model,
    }
  } catch (e) {
    if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return
    yield describeError(e)
  }
}

function describeError(e: unknown): AnswerEvent {
  if (e instanceof Anthropic.AuthenticationError) {
    return { type: 'error', message: 'The API key was rejected.', retryable: false }
  }
  if (e instanceof Anthropic.RateLimitError) {
    return {
      type: 'error',
      message: 'Rate limited by the API. Try again in a moment.',
      retryable: true,
    }
  }
  if (e instanceof Anthropic.BadRequestError) {
    return { type: 'error', message: 'The request was rejected by the API.', retryable: false }
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { type: 'error', message: 'Could not reach the API.', retryable: true }
  }
  if (e instanceof Anthropic.APIError) {
    return {
      type: 'error',
      message: `The API answered ${e.status ?? 'with an error'}.`,
      retryable: true,
    }
  }
  return { type: 'error', message: 'Something went wrong while answering.', retryable: true }
}

/** A real client when a key (or another credential) is configured, otherwise null. */
export function createClient(): ModelClient | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null
  const client: ModelClient = new Anthropic()
  return client
}
