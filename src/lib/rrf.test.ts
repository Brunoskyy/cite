import { describe, expect, it } from 'vitest'

import { reciprocalRankFusion } from './rrf'

describe('reciprocalRankFusion', () => {
  it('rewards agreement between lists over a single top hit', () => {
    const keyword = ['a', 'b', 'c']
    const vector = ['d', 'b', 'a']
    const fused = reciprocalRankFusion([keyword, vector], (x) => x)
    expect(fused.map((r) => r.item)).toEqual(['a', 'b', 'd', 'c'])
    expect(fused[0]!.ranks).toEqual([1, 3])
    expect(fused.find((r) => r.item === 'c')!.ranks).toEqual([3, null])
  })

  it('uses 1/(k+rank) and sums across lists', () => {
    const [top] = reciprocalRankFusion([['x'], ['x']], (x) => x, 60)
    expect(top!.score).toBeCloseTo(2 / 61)
  })

  it('defaults to k = 60, so agreement at rank 4 beats two lone top hits', () => {
    // With k = 1, a and c would score 1/2 each and b only 2/5.
    const fused = reciprocalRankFusion(
      [
        ['a', 'p', 'q', 'b'],
        ['c', 's', 't', 'b'],
      ],
      (x) => x,
    )
    expect(fused.slice(0, 3).map((r) => r.item)).toEqual(['b', 'a', 'c'])
    expect(fused[0]!.score).toBeCloseTo(2 / 64, 10)
    expect(fused[1]!.score).toBeCloseTo(1 / 61, 10)
    expect(fused.find((r) => r.item === 'q')!.score).toBeCloseTo(1 / 63, 10)
  })

  it('handles empty lists', () => {
    expect(reciprocalRankFusion([[], []], (x: string) => x)).toEqual([])
    expect(reciprocalRankFusion([['a'], []], (x) => x).map((r) => r.ranks)).toEqual([[1, null]])
  })
})
