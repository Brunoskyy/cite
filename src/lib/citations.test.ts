import { describe, expect, it } from 'vitest'

import { CitationParser, parseAnswer, type Segment } from './citations'

const feed = (chunks: string[], count = 5): { segments: Segment[]; parser: CitationParser } => {
  const parser = new CitationParser(count)
  const segments: Segment[] = []
  for (const c of chunks) segments.push(...parser.push(c))
  segments.push(...parser.end())
  // Collapse adjacent text for easier assertions.
  const merged: Segment[] = []
  for (const s of segments) {
    const prev = merged[merged.length - 1]
    if (s.type === 'text' && prev?.type === 'text') prev.text += s.text
    else merged.push({ ...s } as Segment)
  }
  return { segments: merged, parser }
}

describe('CitationParser', () => {
  it('splits text and markers', () => {
    expect(parseAnswer('Use cancelQueries [1]. The signal is passed [2, 3].', 3).segments).toEqual([
      { type: 'text', text: 'Use cancelQueries ' },
      { type: 'cite', indices: [1] },
      { type: 'text', text: '. The signal is passed ' },
      { type: 'cite', indices: [2, 3] },
      { type: 'text', text: '.' },
    ])
  })

  it('handles a marker split across chunks', () => {
    const { segments } = feed(['Cancel it [', '1', '2', '] now'], 12)
    expect(segments).toEqual([
      { type: 'text', text: 'Cancel it ' },
      { type: 'cite', indices: [12] },
      { type: 'text', text: ' now' },
    ])
  })

  it('releases text as soon as it cannot be a marker', () => {
    const parser = new CitationParser(3)
    expect(parser.push('Hello wor')).toEqual([{ type: 'text', text: 'Hello wor' }])
    expect(parser.push('ld [')).toEqual([{ type: 'text', text: 'ld ' }])
    expect(parser.push('2')).toEqual([])
    expect(parser.push(', ')).toEqual([])
    expect(parser.push('3] ok')).toEqual([
      { type: 'cite', indices: [2, 3] },
      { type: 'text', text: ' ok' },
    ])
  })

  it('drops indices that point at no passage, and counts them', () => {
    const { segments, stats } = parseAnswer('A [1] B [7] C [2, 9]', 3)
    expect(segments).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'cite', indices: [1] },
      { type: 'text', text: ' B  C ' },
      { type: 'cite', indices: [2] },
    ])
    expect(stats).toEqual({ citations: 2, invalid: [7, 9] })
    expect(parseAnswer('zero [0]', 3).stats.invalid).toEqual([0])
  })

  it('leaves Markdown links and non-numeric brackets alone', () => {
    const text = 'See [the docs](https://x.dev) and `arr[0]` and [`useQuery`].'
    expect(parseAnswer(text, 3).segments).toEqual([{ type: 'text', text }])
  })

  it('treats an unfinished marker at the end as text', () => {
    expect(feed(['trailing [1'], 3).segments).toEqual([{ type: 'text', text: 'trailing [1' }])
  })

  it('reads adjacent markers', () => {
    expect(parseAnswer('x [1][2].', 3).segments).toEqual([
      { type: 'text', text: 'x ' },
      { type: 'cite', indices: [1] },
      { type: 'cite', indices: [2] },
      { type: 'text', text: '.' },
    ])
  })

  it('dedupes repeated indices in one marker', () => {
    expect(parseAnswer('x [2, 2]', 3).segments[1]).toEqual({ type: 'cite', indices: [2] })
  })

  it('does not depend on where the stream splits after a word', () => {
    const whole = parseAnswer('Read data.pages[1] here', 6).segments
    expect(whole).toEqual([{ type: 'text', text: 'Read data.pages[1] here' }])
    expect(feed(['Read data.pages', '[', '1', '] here'], 6).segments).toEqual(whole)
    const { segments, parser } = feed(['Read data.pages', '[0]', ' here'], 6)
    expect(segments).toEqual([{ type: 'text', text: 'Read data.pages[0] here' }])
    expect(parser.stats).toEqual({ citations: 0, invalid: [] })
    // After a space it is still a citation, whatever the split.
    expect(feed(['Cancel it', ' ', '[', '1]', '.'], 3).segments).toEqual([
      { type: 'text', text: 'Cancel it ' },
      { type: 'cite', indices: [1] },
      { type: 'text', text: '.' },
    ])
  })

  it('leaves markers inside fenced code alone, however the fence arrives', () => {
    const text = 'Like this [1]:\n\n```ts\nconst xs = [1, 2]\n```\n\nDone [2].'
    const expected: Segment[] = [
      { type: 'text', text: 'Like this ' },
      { type: 'cite', indices: [1] },
      { type: 'text', text: ':\n\n```ts\nconst xs = [1, 2]\n```\n\nDone ' },
      { type: 'cite', indices: [2] },
      { type: 'text', text: '.' },
    ]
    expect(parseAnswer(text, 3).segments).toEqual(expected)
    expect(
      feed(['Like this [1]:\n\n`', '``ts\nconst xs = [', '1, 2]\n``', '`\n\nDone [2].'], 3)
        .segments,
    ).toEqual(expected)
    expect(parseAnswer(text, 3).stats).toEqual({ citations: 2, invalid: [] })
  })

  it('leaves markers inside inline code alone', () => {
    const text = 'Write `[1]` literally, or ``a [2] b`` too [3].'
    expect(parseAnswer(text, 3).segments).toEqual([
      { type: 'text', text: 'Write `[1]` literally, or ``a [2] b`` too ' },
      { type: 'cite', indices: [3] },
      { type: 'text', text: '.' },
    ])
  })

  it('does not let a stray backtick swallow later paragraphs', () => {
    expect(parseAnswer('A lone ` tick.\n\nNext [1].', 3).stats.citations).toBe(1)
  })

  it('reads a marker right after an exclamation mark as a citation', () => {
    expect(parseAnswer('That is all![1]', 3).segments).toEqual([
      { type: 'text', text: 'That is all!' },
      { type: 'cite', indices: [1] },
    ])
  })
})
