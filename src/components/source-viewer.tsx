'use client'

import { useEffect, useRef, useState } from 'react'

import type { Passage } from '@/lib/types'

const cache = new Map<string, Promise<string[]>>()

function loadLines(file: string): Promise<string[]> {
  let p = cache.get(file)
  if (!p) {
    p = fetch(`/api/source?file=${encodeURIComponent(file)}`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ lines: string[] }>)
          : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => d.lines)
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return p
}

const CONTEXT = 6

/**
 * The cited passage in its file: the lines it came from highlighted, a
 * little context around them, and the option to read the whole file.
 */
export function SourceViewer({ passage }: { passage: Passage }) {
  const [state, setState] = useState<{ file: string; lines: string[] | null; error: boolean }>({
    file: passage.file,
    lines: null,
    error: false,
  })
  const [whole, setWhole] = useState(false)
  const first = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    let live = true
    loadLines(passage.file).then(
      (lines) => live && setState({ file: passage.file, lines, error: false }),
      () => live && setState({ file: passage.file, lines: null, error: true }),
    )
    return () => {
      live = false
    }
  }, [passage.file])

  const lines = state.file === passage.file ? state.lines : null
  const error = state.file === passage.file && state.error

  useEffect(() => {
    first.current?.scrollIntoView({ block: 'nearest' })
  }, [lines, passage.startLine, whole])

  if (error) return <p className="text-danger p-4 text-sm">Could not load {passage.file}.</p>
  if (!lines) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading source">
        {[80, 95, 70, 88].map((w) => (
          <div
            key={w}
            className="bg-surface-2 h-3 animate-pulse rounded"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    )
  }

  const from = whole ? 1 : Math.max(1, passage.startLine - CONTEXT)
  const to = whole ? lines.length : Math.min(lines.length, passage.endLine + CONTEXT)
  return (
    <div>
      <div className="max-h-[22rem] overflow-auto">
        <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.55]">
          <caption className="sr-only">
            {passage.file}, lines {from} to {to}; lines {passage.startLine} to {passage.endLine} are
            the cited passage
          </caption>
          <tbody>
            {lines.slice(from - 1, to).map((text, i) => {
              const n = from + i
              const cited = n >= passage.startLine && n <= passage.endLine
              return (
                <tr
                  key={n}
                  ref={n === passage.startLine ? first : undefined}
                  className={cited ? 'bg-mark' : undefined}
                  aria-current={n === passage.startLine ? 'location' : undefined}
                >
                  <td
                    className={`w-10 border-r pr-2 text-right align-top tabular-nums select-none ${cited ? 'border-mark-edge text-ink' : 'border-line text-faint'}`}
                  >
                    {n}
                  </td>
                  <td className="px-3 align-top break-words whitespace-pre-wrap">{text || ' '}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-line flex items-center justify-between border-t px-3 py-2 text-xs">
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => setWhole((w) => !w)}
        >
          {whole ? 'Show only the passage' : `Show all ${lines.length} lines`}
        </button>
        <a
          className="text-muted hover:text-ink"
          href={`https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/docs/framework/react/${passage.file}#L${passage.startLine}-L${passage.endLine}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          View on GitHub
        </a>
      </div>
    </div>
  )
}
