/**
 * Reciprocal rank fusion: each list votes 1 / (k + rank) for every item it
 * returned, and items are ordered by the sum. It needs no score
 * normalisation, which is the point: a full-text rank and a cosine
 * distance are not on the same scale and should not be added.
 *
 * k = 60 is the constant from the original paper; it keeps a single list's
 * top hit from drowning out agreement between lists.
 */
export interface Ranked<T> {
  item: T
  score: number
  /** Rank (1-based) in each input list, or null when absent from it. */
  ranks: Array<number | null>
}

export function reciprocalRankFusion<T>(
  lists: ReadonlyArray<readonly T[]>,
  key: (item: T) => string | number,
  k = 60,
): Ranked<T>[] {
  const byKey = new Map<string | number, Ranked<T>>()
  lists.forEach((list, li) => {
    list.forEach((item, i) => {
      const id = key(item)
      let entry = byKey.get(id)
      if (!entry) {
        entry = { item, score: 0, ranks: lists.map(() => null) }
        byKey.set(id, entry)
      }
      entry.score += 1 / (k + i + 1)
      entry.ranks[li] = i + 1
    })
  })
  return [...byKey.values()].sort((a, b) => b.score - a.score)
}
