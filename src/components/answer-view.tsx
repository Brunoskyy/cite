'use client'

import { createContext, memo, useContext, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { Segment } from '@/lib/citations'
import { rehypeCitations, segmentsToMarkdown } from '@/lib/render'
import type { Passage } from '@/lib/types'

import { CitationChip } from './citation-chip'

interface CiteContext {
  passages: Passage[]
  active: number | null
  onSelect: (n: number) => void
  onPeek: (n: number | null) => void
}

const Ctx = createContext<CiteContext | null>(null)

function Cite({ n }: { n: number }) {
  const c = useContext(Ctx)
  if (!c) return null
  return (
    <CitationChip
      n={n}
      passage={c.passages[n - 1]}
      active={c.active === n}
      onSelect={c.onSelect}
      onPeek={c.onPeek}
    />
  )
}

/**
 * Defined once, outside any component: if this object changed between
 * renders, react-markdown would remount every chip, and a hover or focus
 * update between mousedown and click would swallow the click.
 */
const components: Components = {
  span({ node, children, ...rest }) {
    const raw = node?.properties?.dataCite
    if (raw !== undefined) return <Cite n={Number(raw)} />
    return <span {...rest}>{children}</span>
  },
  a({ href, children }) {
    // Model output: only web links survive, anything else is plain text.
    const safe = href && /^https?:\/\//.test(href) ? href : undefined
    return safe ? (
      <a href={safe} rel="noreferrer noopener" target="_blank">
        {children}
      </a>
    ) : (
      <span>{children as ReactNode}</span>
    )
  },
}

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeCitations]}
      skipHtml
      components={components}
    >
      {text}
    </ReactMarkdown>
  )
})

interface Props extends CiteContext {
  segments: Segment[]
  streaming: boolean
}

export function AnswerView({ segments, passages, streaming, active, onSelect, onPeek }: Props) {
  const value = useMemo(
    () => ({ passages, active, onSelect, onPeek }),
    [passages, active, onSelect, onPeek],
  )
  return (
    <Ctx.Provider value={value}>
      <div className="answer">
        <Markdown text={segmentsToMarkdown(segments)} />
        {streaming && <span className="caret" aria-hidden="true" />}
      </div>
    </Ctx.Provider>
  )
}
