import { describe, expect, it } from 'vitest'

import { answerForClipboard, segmentsToMarkdown } from './render'
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

  it('turns citations into tokens no Markdown can produce', () => {
    expect(segmentsToMarkdown(segments)).toBe('Use it \uE0001\uE001\uE0002\uE001.')
    // Sentinels typed into text are stripped, so they can never forge a citation.
    expect(segmentsToMarkdown([{ type: 'text', text: 'x\uE0009\uE001y' }])).toBe('x9y')
  })

  it('copies the answer with markers and only the sources it cited', () => {
    expect(answerForClipboard(segments, [p('a.md'), p('b.md'), p('c.md')])).toBe(
      'Use it [1, 2].\n\nSources:\n[1] a.md, lines 3–9\n[2] b.md, lines 3–9',
    )
  })
})
