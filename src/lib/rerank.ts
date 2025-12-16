import 'server-only'

import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Passage } from './types'

/**
 * A cross-encoder reads the question and a passage together and scores how
 * well one answers the other. It is slower than the retrievers (one model
 * pass per candidate), so it only reorders the top of the fused list.
 */
export const RERANK_MODEL = 'Xenova/bge-reranker-base'

interface Loaded {
  tokenizer: (
    a: string[],
    options: { text_pair: string[]; padding: boolean; truncation: boolean; max_length: number },
  ) => unknown
  model: (inputs: unknown) => Promise<{ logits: { data: Float32Array | number[] } }>
}

let loaded: Promise<Loaded> | null = null

async function load(): Promise<Loaded> {
  const { AutoTokenizer, AutoModelForSequenceClassification, env } =
    await import('@huggingface/transformers')
  env.cacheDir = process.env.CITE_MODEL_CACHE ?? join(homedir(), '.cache', 'cite-models')
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(RERANK_MODEL),
    AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: 'q8' }),
  ])
  return { tokenizer, model } as unknown as Loaded
}

export async function rerank(question: string, passages: Passage[]): Promise<number[]> {
  if (passages.length === 0) return []
  loaded ??= load().catch((e: unknown) => {
    loaded = null
    throw e
  })
  const { tokenizer, model } = await loaded
  const inputs = tokenizer(
    passages.map(() => question),
    {
      text_pair: passages.map((p) => `${[p.title, ...p.headings].join(' > ')}\n${p.text}`),
      padding: true,
      truncation: true,
      max_length: 512,
    },
  )
  const { logits } = await model(inputs)
  return Array.from(logits.data)
}
