import 'server-only'

import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Local embeddings with bge-small-en-v1.5 (384 dimensions, quantized), so
 * indexing and search never need an API key or leave the machine. The
 * model downloads once into a cache outside the repository.
 */
export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5'
export const EMBEDDING_DIMENSIONS = 384

/** bge models expect this prefix on queries, not on passages. */
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '

type Extractor = (
  texts: string[],
  options: { pooling: 'cls'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>

let extractor: Promise<Extractor> | null = null

async function load(): Promise<Extractor> {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = process.env.CITE_MODEL_CACHE ?? join(homedir(), '.cache', 'cite-models')
  env.allowRemoteModels = true
  const pipe = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
  return pipe as unknown as Extractor
}

function model(): Promise<Extractor> {
  extractor ??= load().catch((e: unknown) => {
    extractor = null
    throw e
  })
  return extractor
}

export async function embedPassages(texts: string[], batchSize = 32): Promise<number[][]> {
  const run = await model()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = await run(texts.slice(i, i + batchSize), { pooling: 'cls', normalize: true })
    out.push(...batch.tolist())
  }
  return out
}

export async function embedQuery(text: string): Promise<number[]> {
  const run = await model()
  const [vector] = (await run([QUERY_PREFIX + text], { pooling: 'cls', normalize: true })).tolist()
  if (!vector) throw new Error('embedding returned nothing')
  return vector
}
