import 'server-only'

import { db, toVector } from './db'
import { embedQuery } from './embed'
import { rerank } from './rerank'
import { reciprocalRankFusion } from './rrf'
import type { Passage, RetrievalMode, Scored } from './types'

interface Row {
  id: string
  file: string
  title: string
  headings: string[]
  start_line: number
  end_line: number
  content: string
  score: number
}

const toPassage = (r: Row): Passage => ({
  id: Number(r.id),
  file: r.file,
  title: r.title,
  headings: r.headings,
  startLine: r.start_line,
  endLine: r.end_line,
  text: r.content,
})

/**
 * Full-text search. A question is mostly words that are not in the answer
 * ("how do I ..."), so the query ORs the stemmed terms instead of requiring
 * all of them, and ts_rank_cd does the ordering. The question only ever
 * reaches SQL as a bound parameter.
 */
export async function keywordSearch(question: string, limit: number): Promise<Passage[]> {
  const { rows } = await db().query<Row>(
    `WITH q AS (
       SELECT NULLIF(replace(plainto_tsquery('english', $1)::text, '&', '|'), '')::tsquery AS query
     )
     SELECT c.id, c.file, c.title, c.headings, c.start_line, c.end_line, c.content,
            ts_rank_cd(c.tsv, q.query, 32) AS score
       FROM chunks c, q
      WHERE q.query IS NOT NULL AND c.tsv @@ q.query
      ORDER BY score DESC, c.id
      LIMIT $2`,
    [question, limit],
  )
  return rows.map(toPassage)
}

/** Nearest neighbours by cosine distance over the HNSW index. */
export async function vectorSearch(question: string, limit: number): Promise<Passage[]> {
  const vector = await embedQuery(question)
  const { rows } = await db().query<Row>(
    `SELECT id, file, title, headings, start_line, end_line, content,
            1 - (embedding <=> $1::vector) AS score
       FROM chunks
      ORDER BY embedding <=> $1::vector, id
      LIMIT $2`,
    [toVector(vector), limit],
  )
  return rows.map(toPassage)
}

export interface RetrieveOptions {
  mode?: RetrievalMode
  /** How many passages to return. */
  k?: number
  /** How many each retriever contributes before fusion or reranking. */
  pool?: number
}

export async function retrieve(question: string, options: RetrieveOptions = {}): Promise<Scored[]> {
  const mode = options.mode ?? 'hybrid'
  const k = options.k ?? 6
  const pool = options.pool ?? 30

  if (mode === 'keyword') {
    return (await keywordSearch(question, k)).map((passage, i) => ({
      passage,
      score: 1 / (i + 1),
      keywordRank: i + 1,
      vectorRank: null,
    }))
  }
  if (mode === 'vector') {
    return (await vectorSearch(question, k)).map((passage, i) => ({
      passage,
      score: 1 / (i + 1),
      keywordRank: null,
      vectorRank: i + 1,
    }))
  }

  const [keyword, vector] = await Promise.all([
    keywordSearch(question, pool),
    vectorSearch(question, pool),
  ])
  const fused = reciprocalRankFusion([keyword, vector], (p) => p.id).map((r) => ({
    passage: r.item,
    score: r.score,
    keywordRank: r.ranks[0] ?? null,
    vectorRank: r.ranks[1] ?? null,
  }))
  if (mode === 'hybrid') return fused.slice(0, k)

  const candidates = fused.slice(0, Math.min(pool, 20))
  const scores = await rerank(
    question,
    candidates.map((c) => c.passage),
  )
  return candidates
    .map((c, i) => ({ ...c, score: scores[i] ?? -Infinity }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
