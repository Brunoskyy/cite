import { describe, expect, it } from 'vitest'

import { answerForClipboard, citeIndex, segmentsToMarkdown } from './render'
import type { Passage } from './types'

const p = (file: string): Passage => ({
  id: 1,
  file,
  title: '',
  headings: [],
  startLine: 3,
  endLine: 9,
  text: '',
})

describe('render helpers', () => {
  const segments = [
    { type: 'text' as const, text: 'Use it ' },
    { type: 'cite' as const, indices: [1, 2] },
    { type: 'text' as const, text: '.' },
  ]

  it('turns citations into anchor links for the renderer', () => {
    expect(segmentsToMarkdown(segments)).toBe('Use it [1](#cite-1)[2](#cite-2).')
    expect(citeIndex('#cite-12')).toBe(12)
    expect(citeIndex('https://x.dev/#cite-1')).toBeNull()
    expect(citeIndex(undefined)).toBeNull()
  })

  it('copies the answer with markers and only the sources it cited', () => {
    expect(answerForClipboard(segments, [p('a.md'), p('b.md'), p('c.md')])).toBe(
      'Use it [1, 2].\n\nSources:\n[1] a.md, lines 3–9\n[2] b.md, lines 3–9',
    )
  })
})
