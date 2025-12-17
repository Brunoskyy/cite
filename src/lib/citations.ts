/**
 * Turns a streamed answer into text segments and citations as it arrives.
 *
 * The model writes markers like `[2]` or `[1, 3]` after each claim. Text
 * can be split anywhere between stream chunks, including in the middle of
 * a marker (`[1` then `2]`), so the parser holds back only the tail that
 * could still become a marker and releases everything else immediately.
 * A marker naming a passage that was never sent is dropped and counted:
 * the UI must never offer a link to a source that does not exist.
 */
export type Segment = { type: 'text'; text: string } | { type: 'cite'; indices: number[] }

export interface ParserStats {
  citations: number
  invalid: number[]
}

/**
 * A complete marker: digits separated by commas. Not right after a word
 * character, backtick or closing paren, so `arr[0]` and `fn()[1]` in code
 * stay code.
 */
const MARKER = /(?<![\w`)])\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g
/** A suffix that might still turn into a marker once more text arrives. */
const PARTIAL = /(?<![\w`)])\[(?:\d{1,3}(?:\s*,\s*\d{0,3})*\s*,?\s*)?$/

export class CitationParser {
  private buffer = ''
  readonly stats: ParserStats = { citations: 0, invalid: [] }
  private readonly passageCount: number

  constructor(passageCount: number) {
    this.passageCount = passageCount
  }

  push(text: string): Segment[] {
    this.buffer += text
    const partial = PARTIAL.exec(this.buffer)
    const holdFrom = partial ? partial.index : this.buffer.length
    const ready = this.buffer.slice(0, holdFrom)
    this.buffer = this.buffer.slice(holdFrom)
    return this.split(ready)
  }

  /** Releases whatever is held back; an unfinished marker is just text. */
  end(): Segment[] {
    const rest = this.buffer
    this.buffer = ''
    return rest ? this.split(rest) : []
  }

  private split(text: string): Segment[] {
    const out: Segment[] = []
    let last = 0
    for (const m of text.matchAll(MARKER)) {
      if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
      const indices: number[] = []
      for (const raw of (m[1] ?? '').split(',')) {
        const n = Number(raw.trim())
        if (n >= 1 && n <= this.passageCount) {
          if (!indices.includes(n)) indices.push(n)
        } else {
          this.stats.invalid.push(n)
        }
      }
      if (indices.length) {
        out.push({ type: 'cite', indices })
        this.stats.citations += indices.length
      }
      last = m.index + m[0].length
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
    return merge(out)
  }
}

function merge(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const prev = out[out.length - 1]
    if (s.type === 'text' && prev?.type === 'text') prev.text += s.text
    else out.push({ ...s } as Segment)
  }
  return out
}

/** Parses a whole answer at once; the same rules as streaming. */
export function parseAnswer(
  text: string,
  passageCount: number,
): { segments: Segment[]; stats: ParserStats } {
  const parser = new CitationParser(passageCount)
  const segments = merge([...parser.push(text), ...parser.end()])
  return { segments, stats: parser.stats }
}
