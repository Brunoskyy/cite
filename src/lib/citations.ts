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

/** The body of a marker once its `[` is found: digits separated by commas, then `]`. */
const MARKER_BODY = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/y
/** A suffix that might still turn into a marker once more text arrives. */
const PARTIAL = /\[(?:\d{1,3}(?:\s*,\s*\d{0,3})*\s*,?\s*)?$/
/** Backticks at the very end might be the start of a longer run (a fence). */
const TRAILING_TICKS = /`+$/
/** A `[` right after one of these is indexing or a link label, not a citation: `arr[0]`, `fn()[1]`. */
const NOT_BEFORE_MARKER = /[\w`)]/

/**
 * Where the parser is in the Markdown the model writes. Markers are only
 * read in prose: inside a fenced block or inline code, `[1]` is code.
 * The state carries over between stream chunks, and so does the last
 * released character, so a marker's lookbehind never depends on where the
 * stream happened to split.
 */
interface ScanState {
  prev: string
  lineStart: boolean
  /** Length of the backtick run that opened the current fence, or 0. */
  fence: number
  /** Length of the backtick run that opened the current inline code span, or 0. */
  inline: number
}

export class CitationParser {
  private buffer = ''
  private readonly state: ScanState = { prev: '', lineStart: true, fence: 0, inline: 0 }
  readonly stats: ParserStats = { citations: 0, invalid: [] }
  private readonly passageCount: number

  constructor(passageCount: number) {
    this.passageCount = passageCount
  }

  push(text: string): Segment[] {
    this.buffer += text
    let holdFrom = this.buffer.length
    const partial = PARTIAL.exec(this.buffer)
    if (partial) holdFrom = partial.index
    const ticks = TRAILING_TICKS.exec(this.buffer)
    if (ticks && ticks.index < holdFrom) holdFrom = ticks.index
    const ready = this.buffer.slice(0, holdFrom)
    this.buffer = this.buffer.slice(holdFrom)
    return this.scan(ready)
  }

  /** Releases whatever is held back; an unfinished marker is just text. */
  end(): Segment[] {
    const rest = this.buffer
    this.buffer = ''
    return rest ? this.scan(rest) : []
  }

  private scan(text: string): Segment[] {
    const out: Segment[] = []
    const st = this.state
    let plainFrom = 0
    let i = 0
    while (i < text.length) {
      const ch = text[i]!
      if (ch === '`') {
        let n = 1
        while (text[i + n] === '`') n += 1
        if (st.fence) {
          if (st.lineStart && n >= st.fence) st.fence = 0
        } else if (st.inline) {
          if (n === st.inline) st.inline = 0
        } else if (st.lineStart && n >= 3) {
          st.fence = n
        } else {
          st.inline = n
        }
        i += n
        st.prev = '`'
        st.lineStart = false
        continue
      }
      if (ch === '[' && !st.fence && !st.inline && !NOT_BEFORE_MARKER.test(st.prev)) {
        MARKER_BODY.lastIndex = i
        const m = MARKER_BODY.exec(text)
        if (m) {
          if (i > plainFrom) out.push({ type: 'text', text: text.slice(plainFrom, i) })
          const indices = this.validate(m[1] ?? '')
          if (indices.length) {
            out.push({ type: 'cite', indices })
            this.stats.citations += indices.length
          }
          i += m[0].length
          plainFrom = i
          st.prev = ']'
          st.lineStart = false
          continue
        }
      }
      if (ch === '\n') {
        st.lineStart = true
        // An inline span cannot cross a paragraph; a stray backtick must not eat the rest.
        if (text[i + 1] === '\n') st.inline = 0
      } else if (ch !== ' ' || !st.lineStart) {
        st.lineStart = false
      }
      st.prev = ch
      i += 1
    }
    if (plainFrom < text.length) out.push({ type: 'text', text: text.slice(plainFrom) })
    return merge(out)
  }

  private validate(body: string): number[] {
    const indices: number[] = []
    for (const raw of body.split(',')) {
      const n = Number(raw.trim())
      if (n >= 1 && n <= this.passageCount) {
        if (!indices.includes(n)) indices.push(n)
      } else {
        this.stats.invalid.push(n)
      }
    }
    return indices
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
