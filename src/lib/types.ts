/** A retrieved passage, as the answer prompt, the UI and the evals see it. */
export interface Passage {
  id: number
  file: string
  title: string
  headings: string[]
  startLine: number
  endLine: number
  text: string
}

export type RetrievalMode = 'keyword' | 'vector' | 'hybrid' | 'rerank'

export const RETRIEVAL_MODES: readonly RetrievalMode[] = ['keyword', 'vector', 'hybrid', 'rerank']

export interface Scored {
  passage: Passage
  /** Final score in the mode's own units (rank-fusion score, cosine, rerank logit). */
  score: number
  /** Rank in the keyword and vector lists before fusion, when known. */
  keywordRank: number | null
  vectorRank: number | null
}
