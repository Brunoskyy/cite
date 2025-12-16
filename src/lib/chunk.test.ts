import { describe, expect, it } from 'vitest'

import { chunkMarkdown, embeddingText, parseFrontMatter } from './chunk'

const doc = [
  '---', // 1
  'id: cancel',
  'title: Query Cancellation',
  '---',
  '',
  'Intro paragraph.', // 6
  '',
  '## Default behavior', // 8
  '',
  'Not cancelled by default.', // 10
  '',
  '### Details', // 12
  'Inner text.', // 13
  '',
  '```ts', // 15
  '# not a heading',
  'const x = 1',
  '```', // 18
  '',
  '## Manual', // 20
  'Call cancelQueries.', // 21
].join('\n')

describe('parseFrontMatter', () => {
  it('reads the title and where the body starts', () => {
    expect(parseFrontMatter(doc)).toEqual({ title: 'Query Cancellation', bodyStart: 4 })
    expect(parseFrontMatter('# Hi\n')).toEqual({ title: null, bodyStart: 0 })
  })
})

describe('chunkMarkdown', () => {
  const chunks = chunkMarkdown('guides/query-cancellation.md', doc)

  it('splits by heading and keeps the heading path and line ranges', () => {
    expect(chunks.map((c) => [c.headings.join(' > '), c.startLine, c.endLine])).toEqual([
      ['', 6, 6],
      ['Default behavior', 8, 10],
      ['Default behavior > Details', 12, 18],
      ['Manual', 20, 21],
    ])
    expect(chunks.every((c) => c.title === 'Query Cancellation')).toBe(true)
  })

  it('does not treat a # line inside a code block as a heading', () => {
    const details = chunks[2]!
    expect(details.text).toContain('# not a heading')
    expect(chunks.some((c) => c.headings.includes('not a heading'))).toBe(false)
  })

  it('line ranges point at the original text', () => {
    const lines = doc.split('\n')
    for (const c of chunks) {
      expect(lines.slice(c.startLine - 1, c.endLine).join('\n')).toBe(c.text)
    }
  })

  it('cuts long sections into overlapping windows at blank lines', () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${'word '.repeat(40)}`)
    const long = ['# Long', '', '## Big', '', paragraphs.join('\n\n')].join('\n')
    const parts = chunkMarkdown('long.md', long, { targetChars: 600, overlapLines: 1 })
    expect(parts.length).toBeGreaterThan(2)
    // No non-blank line falls between windows.
    const covered = new Set(parts.flatMap((c) => range(c.startLine, c.endLine)))
    long.split('\n').forEach((text, i) => {
      if (text.trim() && !text.startsWith('#')) expect(covered.has(i + 1)).toBe(true)
    })
    // Every paragraph is whole in at least one window.
    for (const p of paragraphs) expect(parts.some((c) => c.text.includes(p))).toBe(true)
    expect(parts[0]!.title).toBe('Long')
  })

  it('never emits a window contained in the previous one', () => {
    const lines = Array.from({ length: 40 }, (_, i) =>
      i % 5 === 4 ? '' : `line ${i} ${'x'.repeat(60)}`,
    )
    const parts = chunkMarkdown('dense.md', ['# Dense', ...lines].join('\n'), {
      targetChars: 300,
      overlapLines: 3,
    })
    for (let i = 1; i < parts.length; i += 1) {
      const a = parts[i - 1]!
      const b = parts[i]!
      expect(a.startLine <= b.startLine && a.endLine >= b.endLine).toBe(false)
    }
  })

  it('falls back to the first H1, then the file name, for the title', () => {
    expect(chunkMarkdown('a/b.md', '# Hello\n\ntext')[0]!.title).toBe('Hello')
    expect(chunkMarkdown('a/b.md', 'text only')[0]!.title).toBe('b')
  })

  it('prefixes the embedding text with where the passage sits', () => {
    expect(embeddingText(chunks[2]!).split('\n')[0]).toBe(
      'Query Cancellation > Default behavior > Details',
    )
  })
})

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}
