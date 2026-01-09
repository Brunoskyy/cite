import type { Element, ElementContent, Root, RootContent, Text } from 'hast'

import type { Segment } from './citations'
import type { Passage } from './types'

/**
 * Citations travel through the Markdown renderer as private-use characters,
 * not as Markdown syntax. Nothing the model writes can produce one: they are
 * stripped from every text segment first, so a model-written `[x](#cite-9)`
 * stays an ordinary link and `That is all![1]` cannot turn into an image.
 */
const OPEN = '\uE000'
const CLOSE = '\uE001'
const SENTINELS = /[\uE000\uE001]/g
const TOKEN = /\uE000(\d{1,3})\uE001/g

export function segmentsToMarkdown(segments: readonly Segment[]): string {
  return segments
    .map((s) =>
      s.type === 'text'
        ? s.text.replace(SENTINELS, '')
        : s.indices.map((n) => `${OPEN}${n}${CLOSE}`).join(''),
    )
    .join('')
}

/** The hast property a citation placeholder carries; the view renders it as a chip. */
export const CITE_PROPERTY = 'dataCite'

/**
 * A rehype step that replaces citation tokens in text with empty
 * `<span data-cite="n">` placeholders. Code is left alone: the parser never
 * emits citations inside code, and anything that looks like one there is
 * dropped rather than rendered.
 */
export function rehypeCitations() {
  return (tree: Root) => {
    visit(tree)
  }
}

function visit(node: Root | Element): void {
  const next: Array<RootContent | ElementContent> = []
  for (const child of node.children) {
    if (child.type === 'text') next.push(...splitText(child, isCode(node)))
    else {
      if (child.type === 'element') visit(child)
      next.push(child)
    }
  }
  node.children = next as typeof node.children
}

function isCode(node: Root | Element): boolean {
  return node.type === 'element' && (node.tagName === 'code' || node.tagName === 'pre')
}

function splitText(text: Text, inCode: boolean): ElementContent[] {
  if (!text.value.includes(OPEN)) return [text]
  if (inCode) return [{ type: 'text', value: text.value.replace(TOKEN, '') }]
  const out: ElementContent[] = []
  let last = 0
  for (const m of text.value.matchAll(TOKEN)) {
    if (m.index > last) out.push({ type: 'text', value: text.value.slice(last, m.index) })
    out.push({
      type: 'element',
      tagName: 'span',
      properties: { [CITE_PROPERTY]: m[1] },
      children: [],
    })
    last = m.index + m[0].length
  }
  if (last < text.value.length) out.push({ type: 'text', value: text.value.slice(last) })
  return out
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
