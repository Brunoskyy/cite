/**
 * Splits a Markdown document into passages a reader can be pointed at.
 *
 * Every chunk keeps the 1-based line range it came from and the path of
 * headings above it, because a citation is only useful if it can open the
 * exact lines in the original file. Chunks never cross a heading; long
 * sections are cut into windows of roughly `targetChars` that overlap by a
 * few lines, so a sentence near a cut is always whole in one of them.
 * Headings inside fenced code blocks are not headings.
 */

export interface Chunk {
  file: string
  /** Document title from front matter, or the first H1, or the file name. */
  title: string
  /** Headings above this chunk, outermost first, not including the title. */
  headings: string[]
  /** 1-based, inclusive. */
  startLine: number
  endLine: number
  text: string
}

export interface ChunkOptions {
  targetChars?: number
  overlapLines?: number
}

interface Section {
  headings: string[]
  /** 1-based line numbers of the section body (heading line included). */
  lines: Array<{ n: number; text: string }>
}

const FENCE = /^\s*(```|~~~)/
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

export function parseFrontMatter(source: string): { title: string | null; bodyStart: number } {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---') return { title: null, bodyStart: 0 }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end === -1) return { title: null, bodyStart: 0 }
  let title: string | null = null
  for (const line of lines.slice(1, end)) {
    const m = /^title:\s*(.+)$/.exec(line)
    if (m?.[1]) title = m[1].replace(/^['"]|['"]$/g, '').trim()
  }
  return { title, bodyStart: end + 1 }
}

export function chunkMarkdown(file: string, source: string, options: ChunkOptions = {}): Chunk[] {
  const targetChars = options.targetChars ?? 1200
  const overlapLines = options.overlapLines ?? 2
  const all = source.replace(/\r\n?/g, '\n').split('\n')
  const { title: fmTitle, bodyStart } = parseFrontMatter(all.join('\n'))

  let title = fmTitle
  const sections: Section[] = []
  const stack: Array<{ level: number; text: string }> = []
  let current: Section = { headings: [], lines: [] }
  let inFence = false

  for (let i = bodyStart; i < all.length; i += 1) {
    const text = all[i] ?? ''
    if (FENCE.test(text)) inFence = !inFence
    const m = inFence ? null : HEADING.exec(text)
    if (m?.[1] && m[2]) {
      const level = m[1].length
      const heading = cleanHeading(m[2])
      if (level === 1 && title === null) {
        title = heading
        continue
      }
      if (hasBody(current)) sections.push(current)
      while (stack.length && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop()
      stack.push({ level, text: heading })
      current = { headings: stack.map((s) => s.text), lines: [{ n: i + 1, text }] }
      continue
    }
    current.lines.push({ n: i + 1, text })
  }
  if (hasBody(current)) sections.push(current)

  const docTitle = title ?? file.replace(/\.md$/, '').split('/').pop() ?? file
  const chunks: Chunk[] = []
  for (const section of sections) {
    for (const window of windows(section.lines, targetChars, overlapLines)) {
      const trimmed = trimBlank(window)
      if (trimmed.length === 0) continue
      const prev = chunks[chunks.length - 1]
      // An overlap that trims down to the previous window's lines adds nothing.
      if (
        prev &&
        prev.file === file &&
        prev.startLine <= trimmed[0]!.n &&
        prev.endLine >= trimmed[trimmed.length - 1]!.n
      )
        continue
      chunks.push({
        file,
        title: docTitle,
        headings: section.headings,
        startLine: trimmed[0]!.n,
        endLine: trimmed[trimmed.length - 1]!.n,
        text: trimmed.map((l) => l.text).join('\n'),
      })
    }
  }
  return chunks
}

/**
 * Cuts a section into windows near `target` characters, preferring to cut
 * at a blank line and never inside a fenced code block unless the block
 * alone is larger than the target.
 */
function windows(
  lines: Section['lines'],
  target: number,
  overlap: number,
): Array<Section['lines']> {
  const total = lines.reduce((n, l) => n + l.text.length + 1, 0)
  if (total <= target * 1.3) return [lines]

  const out: Array<Section['lines']> = []
  let start = 0
  while (start < lines.length) {
    let size = 0
    let end = start
    let lastBreak = -1
    let inFence = false
    while (end < lines.length && size < target) {
      const text = lines[end]!.text
      if (FENCE.test(text)) inFence = !inFence
      size += text.length + 1
      if (!inFence && text.trim() === '') lastBreak = end
      end += 1
    }
    // Finish an open code block rather than cut it in half, within reason.
    while (inFence && end < lines.length && size < target * 3) {
      const text = lines[end]!.text
      if (FENCE.test(text)) inFence = false
      size += text.length + 1
      end += 1
    }
    if (end < lines.length && lastBreak > start && !inFence) end = lastBreak + 1
    out.push(lines.slice(start, end))
    if (end >= lines.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return out
}

/**
 * A section with nothing under its heading (a "## Parameters" followed
 * straight by a sub-heading) is not a passage anyone can be pointed at.
 * Markdown comments like `[//]: # 'Example'` do not count as content.
 */
function hasBody(section: Section): boolean {
  return section.lines.some((l, i) => {
    const t = l.text.trim()
    if (t === '' || t.startsWith('[//]: #')) return false
    return !(i === 0 && HEADING.test(l.text))
  })
}

function trimBlank(lines: Section['lines']): Section['lines'] {
  let a = 0
  let b = lines.length
  while (a < b && lines[a]!.text.trim() === '') a += 1
  while (b > a && lines[b - 1]!.text.trim() === '') b -= 1
  return lines.slice(a, b)
}

/** `Using axios [v0.22.0+](https://...)` reads as `Using axios v0.22.0+`. */
export function cleanHeading(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The text an embedding sees: where the chunk sits, then what it says. */
export function embeddingText(chunk: Chunk): string {
  const path = [chunk.title, ...chunk.headings].join(' > ')
  return `${path}\n\n${chunk.text}`
}
