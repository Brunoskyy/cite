'use client'

import { useState } from 'react'

export interface RunPoint {
  id: string
  label: string
  recallAt5: number
  mrr: number
}

const SERIES = [
  { key: 'recallAt5' as const, name: 'Recall@5', color: 'var(--series-1)' },
  { key: 'mrr' as const, name: 'MRR', color: 'var(--series-2)' },
]

const ROW = 44
const LEFT = 150
const RIGHT = 96
const TOP = 30
const WIDTH = 720

/**
 * One row per run, two dots per row on a shared 0 to 1 axis: recall@5 and
 * mean reciprocal rank. Both are proportions, so one axis is honest. A thin
 * rule joins each pair so the eye reads the row as one run.
 */
export function RunChart({ runs }: { runs: RunPoint[] }) {
  const [hover, setHover] = useState<{ run: RunPoint; key: 'recallAt5' | 'mrr' } | null>(null)
  const height = TOP + runs.length * ROW + 28
  const x = (v: number) => LEFT + v * (WIDTH - LEFT - RIGHT)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <figure className="m-0 max-w-3xl">
      <div className="text-muted mb-2 flex flex-wrap items-center gap-4 text-xs" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="12" height="12">
              <circle cx="6" cy="6" r="5" fill={s.color} />
            </svg>
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Recall at 5 and MRR for ${runs.length} retrieval runs. The table below lists every value.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={TOP - 8}
                y2={height - 26}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text x={x(t)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--faint)">
                {t === 0 ? '0' : t.toFixed(2)}
              </text>
            </g>
          ))}
          {runs.map((r, i) => {
            const y = TOP + i * ROW + ROW / 2
            const lo = Math.min(r.recallAt5, r.mrr)
            const hi = Math.max(r.recallAt5, r.mrr)
            return (
              <g key={r.id}>
                <text x={LEFT - 14} y={y + 4} textAnchor="end" fontSize={13} fill="var(--ink)">
                  {r.label}
                </text>
                <line
                  x1={x(lo)}
                  x2={x(hi)}
                  y1={y}
                  y2={y}
                  stroke="var(--faint)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                {SERIES.map((s) => {
                  const v = r[s.key]
                  const active = hover?.run.id === r.id && hover.key === s.key
                  return (
                    <g
                      key={s.key}
                      tabIndex={0}
                      role="img"
                      aria-label={`${r.label}: ${s.name} ${v.toFixed(3)}`}
                      onPointerEnter={() => setHover({ run: r, key: s.key })}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover({ run: r, key: s.key })}
                      onBlur={() => setHover(null)}
                      className="cursor-default outline-none"
                    >
                      {/* Hit area larger than the mark. */}
                      <circle cx={x(v)} cy={y} r={14} fill="transparent" />
                      <circle
                        cx={x(v)}
                        cy={y}
                        r={active ? 7 : 6}
                        fill={s.color}
                        stroke="var(--surface)"
                        strokeWidth={2}
                      />
                    </g>
                  )
                })}
                {/* Direct label on the last run only; the table carries the rest. */}
                {i === runs.length - 1 && (
                  <text
                    x={x(hi) + 12}
                    y={y + 4}
                    fontSize={12}
                    fill="var(--muted)"
                    className="tabular-nums"
                  >
                    {r.recallAt5.toFixed(2)} / {r.mrr.toFixed(2)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div
            className="border-line bg-surface pointer-events-none absolute rounded-lg border px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(x(hover.run[hover.key]) / WIDTH) * 100}%`,
              top: `${((TOP + runs.indexOf(hover.run) * ROW) / height) * 100}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="text-ink text-sm font-semibold tabular-nums">
              {hover.run[hover.key].toFixed(3)}
            </div>
            <div className="text-muted flex items-center gap-1.5">
              <svg width="12" height="4" aria-hidden="true">
                <line
                  x1="0"
                  x2="12"
                  y1="2"
                  y2="2"
                  stroke={SERIES.find((s) => s.key === hover.key)!.color}
                  strokeWidth={3}
                />
              </svg>
              {SERIES.find((s) => s.key === hover.key)!.name} · {hover.run.label}
            </div>
          </div>
        )}
      </div>
    </figure>
  )
}
