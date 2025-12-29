'use client'

import type { Passage } from '@/lib/types'

import { SourceViewer } from './source-viewer'

interface Props {
  passages: Passage[]
  cited: Set<number>
  active: number | null
  peek: number | null
  onSelect: (n: number | null) => void
  recorded: boolean
}

export function SourcesPanel({ passages, cited, active, peek, onSelect, recorded }: Props) {
  if (passages.length === 0) return null
  return (
    <section
      aria-labelledby="sources-title"
      className="border-line bg-surface overflow-hidden rounded-2xl border"
    >
      <header className="border-line flex items-baseline justify-between border-b px-4 py-3">
        <h2 id="sources-title" className="text-sm font-semibold">
          Sources
        </h2>
        <span className="text-faint text-xs">
          {recorded ? 'recorded with this answer' : `${passages.length} retrieved`}
        </span>
      </header>
      <ol>
        {passages.map((p, i) => {
          const n = i + 1
          const open = active === n
          const lit = peek === n
          return (
            <li key={`${p.id}-${n}`} className="border-line border-b last:border-b-0">
              <button
                type="button"
                id={`source-${n}`}
                aria-expanded={open}
                onClick={() => onSelect(open ? null : n)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${open ? 'bg-accent-soft' : lit ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
              >
                <span
                  className={`mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ${cited.has(n) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted border-line border'}`}
                >
                  {n}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12.5px]">{p.file}</span>
                  <span className="text-muted block truncate text-xs">
                    {[p.title, ...p.headings].join(' › ')} · lines {p.startLine}–{p.endLine}
                  </span>
                </span>
              </button>
              {open && <SourceViewer passage={p} />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
