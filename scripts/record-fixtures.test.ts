import { describe, expect, it } from 'vitest'

import type { Passage } from '../src/lib/types'
import { resolveReferences } from './record-fixtures'

const p = (file: string, startLine: number): Passage => ({
  id: startLine,
  file,
  title: '',
  headings: [],
  startLine,
  endLine: startLine + 5,
  text: '',
})

describe('resolveReferences', () => {
  const passages = [p('a.md', 10), p('b.md', 3), p('a.md', 40)]

  it('maps file:line references to the passage numbers of this retrieval', () => {
    expect(resolveReferences('q', 'One {{a.md:40}}. Two {{b.md:3, a.md:10}}.', passages)).toBe(
      'One [3]. Two [2, 1].',
    )
  })

  it('refuses a reference that was not retrieved, and numbered citations', () => {
    expect(() => resolveReferences('q', 'x {{c.md:1}}', passages)).toThrow(/not retrieved/)
    expect(() => resolveReferences('q', 'x [1]', passages)).toThrow(/numbered citation/)
  })
})
