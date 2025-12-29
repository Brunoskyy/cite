'use client'

import type { Passage } from '@/lib/types'

interface Props {
  n: number
  passage: Passage | undefined
  active: boolean
  onSelect: (n: number) => void
  onPeek: (n: number | null) => void
}

/** A citation in the answer: a small numbered button that opens its source. */
export function CitationChip({ n, passage, active, onSelect, onPeek }: Props) {
  const label = passage
    ? `Source ${n}: ${passage.file}, lines ${passage.startLine} to ${passage.endLine}`
    : `Source ${n}`
  return (
    <button
      type="button"
      className={`cite mx-0.5 inline-flex h-[1.35em] min-w-[1.35em] -translate-y-[0.1em] items-center justify-center rounded-md px-1 align-baseline font-sans text-[0.7em] font-semibold tabular-nums transition-colors ${
        active
          ? 'bg-accent text-accent-ink'
          : 'bg-accent-soft text-accent hover:bg-accent hover:text-accent-ink'
      }`}
      aria-label={label}
      aria-pressed={active}
      title={passage ? `${passage.file}:${passage.startLine}–${passage.endLine}` : undefined}
      onClick={() => onSelect(n)}
      onMouseEnter={() => onPeek(n)}
      onMouseLeave={() => onPeek(null)}
      onFocus={() => onPeek(n)}
      onBlur={() => onPeek(null)}
    >
      {n}
    </button>
  )
}
