import type { Segment } from './citations'
import type { Passage } from './types'

/**
 * Rebuilds Markdown from streamed segments, with each citation as a link
 * to `#cite-n`. The Markdown renderer turns those links into citation
 * buttons; everything else renders as the model wrote it.
 */
export function segmentsToMarkdown(segments: readonly Segment[]): string {
  return segments
    .map((s) => (s.type === 'text' ? s.text : s.indices.map((n) => `[${n}](#cite-${n})`).join('')))
    .join('')
}

export function citeIndex(href: string | undefined): number | null {
  const m = /^#cite-(\d{1,3})$/.exec(href ?? '')
  return m ? Number(m[1]) : null
}

export function sourceLabel(p: Pick<Passage, 'file' | 'startLine' | 'endLine'>): string {
  return `${p.file}, lines ${p.startLine}–${p.endLine}`
}

/** Plain text for the clipboard: the answer with [n] markers, then the numbered sources. */
export function answerForClipboard(
  segments: readonly Segment[],
  passages: readonly Passage[],
): string {
  const body = segments
    .map((s) => (s.type === 'text' ? s.text : `[${s.indices.join(', ')}]`))
    .join('')
    .trim()
  const used = new Set(segments.flatMap((s) => (s.type === 'cite' ? s.indices : [])))
  const sources = passages
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ n }) => used.has(n))
    .map(({ p, n }) => `[${n}] ${sourceLabel(p)}`)
  return sources.length ? `${body}\n\nSources:\n${sources.join('\n')}` : body
}

export function citedIndices(segments: readonly Segment[]): Set<number> {
  return new Set(segments.flatMap((s) => (s.type === 'cite' ? s.indices : [])))
}
