import 'server-only'

import { DEFAULTS, keywordSearch, vectorSearch } from './retrieve'
import { rerank } from './rerank'
import { reciprocalRankFusion } from './rrf'
import type { Passage } from './types'

export interface InspectRow {
  passage: Passage
  keywordRank: number | null
  vectorRank: number | null
  fusedRank: number
  fusedScore: number
  rerankRank: number | null
  rerankScore: number | null
}

export interface Inspection {
  keyword: Passage[]
  vector: Passage[]
  rows: InspectRow[]
  timings: { keyword: number; vector: number; rerank: number | null }
}

/**
 * Every stage of retrieval for one question, side by side: what each
 * retriever returned, how fusion merged them, and how the cross-encoder
 * reordered the top of the fused list.
 */
export async function inspect(
  question: string,
  options: { withRerank?: boolean } = {},
): Promise<Inspection> {
  // Same pool and rerank depth as retrieve(), so the top six here are the
  // six an answer is written from.
  const pool = DEFAULTS.pool
  const t0 = performance.now()
  const keyword = await keywordSearch(question, pool)
  const t1 = performance.now()
  const vector = await vectorSearch(question, pool)
  const t2 = performance.now()
  const fused = reciprocalRankFusion([keyword, vector], (p) => p.id).slice(0, DEFAULTS.rerankTop)
  let scores: number[] | null = null
  let rerankMs: number | null = null
  if (options.withRerank !== false) {
    const t3 = performance.now()
    scores = await rerank(
      question,
      fused.map((f) => f.item),
    )
    rerankMs = Math.round(performance.now() - t3)
  }
  const order = scores
    ? fused.map((_, i) => i).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    : null
  const rows = fused.map((f, i) => ({
    passage: f.item,
    keywordRank: f.ranks[0] ?? null,
    vectorRank: f.ranks[1] ?? null,
    fusedRank: i + 1,
    fusedScore: f.score,
    rerankRank: order ? order.indexOf(i) + 1 : null,
    rerankScore: scores ? (scores[i] ?? null) : null,
  }))
  rows.sort((a, b) => (a.rerankRank ?? a.fusedRank) - (b.rerankRank ?? b.fusedRank))
  return {
    keyword,
    vector,
    rows,
    timings: { keyword: Math.round(t1 - t0), vector: Math.round(t2 - t1), rerank: rerankMs },
  }
}
