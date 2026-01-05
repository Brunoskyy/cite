import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('inspector parity', () => {
  it('uses the pipeline defaults rather than its own pool or rerank depth', () => {
    const source = readFileSync('src/lib/inspect.ts', 'utf8')
    expect(source).toMatch(/const pool = DEFAULTS\.pool/)
    expect(source).toMatch(/slice\(0, DEFAULTS\.rerankTop\)/)
    expect(source).not.toMatch(/options\.pool/)
  })
})
