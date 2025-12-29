import type { Metadata } from 'next'

import { RunChart } from '@/components/run-chart'
import { isAnswers, isRetrieval, loadRuns } from '@/lib/runs'

export const metadata: Metadata = { title: 'Evals' }
export const dynamic = 'force-dynamic'

function RankCell({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <td className="p-0.5">
        <span
          className="text-faint flex h-7 items-center justify-center rounded bg-[var(--miss)] text-xs"
          title="Not in the top 5"
        >
          –
        </span>
      </td>
    )
  }
  const step = Math.min(rank, 5)
  return (
    <td className="p-0.5">
      <span
        className="flex h-7 items-center justify-center rounded text-xs font-semibold tabular-nums"
        style={{ background: `var(--rank-${step})`, color: `var(--rank-text-${step})` }}
        title={`Expected passage at rank ${rank}`}
      >
        {rank}
      </span>
    </td>
  )
}

export default async function EvalsPage() {
  const all = await loadRuns()
  const runs = all.filter(isRetrieval)
  const answerRuns = all.filter(isAnswers)
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`)
  const questions = runs[0]?.results.map((r) => r.id) ?? []

  return (
    <div className="pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl tracking-tight">Measured, not guessed</h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed">
          {questions.length} questions each name the section of the docs that answers them. A run
          asks every question and records where the first passage from that section landed. Recall@5
          is how often it made the top five, the context the model reads; MRR rewards landing
          higher.
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="text-muted mt-8 text-sm">
          No runs yet. Run <code className="font-mono">npm run eval:retrieval</code>.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="chart-title"
            className="border-line bg-surface mt-8 rounded-2xl border p-5"
          >
            <h2 id="chart-title" className="text-sm font-semibold">
              Retrieval, by pipeline
            </h2>
            <div className="mt-3">
              <RunChart
                runs={runs.map((r) => ({
                  id: r.id,
                  label: r.label,
                  recallAt5: r.metrics.recallAt5,
                  mrr: r.metrics.mrr,
                }))}
              />
            </div>
          </section>

          <section aria-labelledby="table-title" className="mt-8">
            <h2 id="table-title" className="text-sm font-semibold">
              Runs
            </h2>
            <div className="border-line bg-surface mt-3 overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[36rem] text-sm tabular-nums">
                <thead className="text-muted text-xs">
                  <tr className="border-line border-b">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Pipeline
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Recall@1
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Recall@3
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Recall@5
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      MRR
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Per question
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-line border-b last:border-b-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">
                        {r.label}
                      </th>
                      <td className="px-3 py-2.5 text-right">{r.metrics.recallAt1.toFixed(3)}</td>
                      <td className="px-3 py-2.5 text-right">{r.metrics.recallAt3.toFixed(3)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {r.metrics.recallAt5.toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-right">{r.metrics.mrr.toFixed(3)}</td>
                      <td className="text-muted px-4 py-2.5 text-right">
                        {r.msPerQuestion.toLocaleString('en')} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="matrix-title" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="matrix-title" className="text-sm font-semibold">
                Where each expected passage landed
              </h2>
              <div className="text-muted flex items-center gap-1.5 text-xs" aria-hidden="true">
                rank
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold"
                    style={{ background: `var(--rank-${n})`, color: `var(--rank-text-${n})` }}
                  >
                    {n}
                  </span>
                ))}
                <span className="text-faint inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--miss)] text-[10px]">
                  –
                </span>
                missed
              </div>
            </div>
            <div className="border-line bg-surface mt-3 overflow-x-auto rounded-2xl border p-2">
              <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-sm">
                <caption className="sr-only">
                  Rank of the expected passage for each question, per run; a dash means not in the
                  top five
                </caption>
                <thead>
                  <tr className="text-muted text-xs">
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Question
                    </th>
                    {runs.map((r) => (
                      <th key={r.id} scope="col" className="w-24 px-1 py-2 text-center font-medium">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q}>
                      <th
                        scope="row"
                        className="text-muted px-2 py-0.5 text-left font-mono text-xs font-normal"
                      >
                        {q}
                      </th>
                      {runs.map((r) => (
                        <RankCell
                          key={r.id}
                          rank={r.results.find((x) => x.id === q)?.rank ?? null}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {answerRuns.length > 0 ? (
            <section aria-labelledby="answers-title" className="mt-8">
              <h2 id="answers-title" className="text-sm font-semibold">
                Answer quality
              </h2>
              <div className="border-line bg-surface mt-3 overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[40rem] text-sm tabular-nums">
                  <thead className="text-muted text-xs">
                    <tr className="border-line border-b">
                      {[
                        'Run',
                        'Answered',
                        'Valid citations',
                        'Cited the right passage',
                        'Faithful',
                        'Correct refusals',
                        'False refusals',
                      ].map((h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={`px-3 py-2.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {answerRuns.map((r) => (
                      <tr key={r.id} className="border-line border-b last:border-b-0">
                        <th scope="row" className="px-3 py-2.5 text-left font-medium">
                          {r.label}
                        </th>
                        <td className="px-3 py-2.5 text-right">{r.metrics.answered}</td>
                        <td className="px-3 py-2.5 text-right">
                          {pct(r.metrics.citationValidity)}
                        </td>
                        <td className="px-3 py-2.5 text-right">{pct(r.metrics.citedExpected)}</td>
                        <td className="px-3 py-2.5 text-right">{pct(r.metrics.faithfulness)}</td>
                        <td className="px-3 py-2.5 text-right">{pct(r.metrics.correctRefusals)}</td>
                        <td className="px-3 py-2.5 text-right">{pct(r.metrics.falseRefusals)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section
              aria-labelledby="answers-title"
              className="border-line mt-8 max-w-2xl rounded-2xl border border-dashed p-5"
            >
              <h2 id="answers-title" className="text-sm font-semibold">
                Answer quality
              </h2>
              <p className="text-muted mt-2 text-sm leading-relaxed">
                <code className="font-mono">npm run eval:answers</code> asks every question through
                the full pipeline and checks that each citation resolves, that the cited passages
                include the expected one, that the eight out-of-scope questions get the refusal, and
                has a grader judge whether every claim is supported by its citations. It needs an
                API key, and no answer run has been committed yet; when one is, it shows here.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
