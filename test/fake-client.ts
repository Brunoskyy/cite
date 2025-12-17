import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'

import type { ModelClient, ModelStream } from '../src/lib/generate'

export interface FakeOptions {
  /** Text deltas to stream, in order. */
  chunks: string[]
  stopReason?: BetaMessage['stop_reason']
  /** Throw this after `failAfter` chunks. */
  error?: unknown
  failAfter?: number
  model?: string
}

/**
 * Emits the event sequence the Messages API streams for a text answer: an
 * (empty, display-omitted) thinking block, then a text block of deltas,
 * then the stop reason. Records every request it receives.
 */
export function fakeClient(
  options: FakeOptions,
): ModelClient & { calls: BetaMessageStreamParams[] } {
  const calls: BetaMessageStreamParams[] = []
  return {
    calls,
    beta: {
      messages: {
        stream(params, opts): ModelStream {
          calls.push(params)
          const model = options.model ?? params.model
          const text = options.chunks.join('')
          const events = async function* (): AsyncGenerator<BetaRawMessageStreamEvent> {
            yield { type: 'message_start', message: message(model, '', null) }
            yield {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'thinking', thinking: '', signature: '' },
            }
            yield { type: 'content_block_stop', index: 0 }
            yield {
              type: 'content_block_start',
              index: 1,
              content_block: { type: 'text', text: '', citations: null },
            }
            for (const [i, chunk] of options.chunks.entries()) {
              if (opts?.signal?.aborted) throw new Anthropic.APIUserAbortError()
              if (options.error && i === (options.failAfter ?? 0)) throw options.error
              yield {
                type: 'content_block_delta',
                index: 1,
                delta: { type: 'text_delta', text: chunk },
              }
              await Promise.resolve()
            }
            if (options.error && (options.failAfter ?? 0) >= options.chunks.length)
              throw options.error
            yield { type: 'content_block_stop', index: 1 }
            yield {
              type: 'message_delta',
              delta: {
                stop_reason: options.stopReason ?? 'end_turn',
                stop_sequence: null,
                stop_details: null,
                container: null,
              },
              usage: {
                output_tokens: 10,
                input_tokens: null,
                cache_creation_input_tokens: null,
                cache_read_input_tokens: null,
                server_tool_use: null,
                iterations: null,
              },
              context_management: null,
            } as unknown as BetaRawMessageStreamEvent
            yield { type: 'message_stop' }
          }
          const iterator = events()
          return {
            [Symbol.asyncIterator]: () => iterator,
            finalMessage: () =>
              Promise.resolve(message(model, text, options.stopReason ?? 'end_turn')),
          }
        },
      },
    },
  }
}

function message(model: string, text: string, stop: BetaMessage['stop_reason']): BetaMessage {
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model,
    content: text ? [{ type: 'text', text, citations: null }] : [],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 10 },
  } as unknown as BetaMessage
}
