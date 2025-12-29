import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'

import { perClient, retrievalSlots } from '@/lib/guards'
import { inspect, type Inspection } from '@/lib/inspect'
import { Busy, clientKey } from '@/lib/limits'
import { FIXTURES } from '@/lib/fixtures'

export const metadata: Metadata = { title: 'Retrieval' }
export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function Rank({ value, best }: { value: number | null; best?: boolean }) {
  if (value === null) return <span className="text-faint">–</span>
  return <span className={best ? 'text-accent font-semibold' : undefined}>{value}</span>
}

export default async function InspectPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).q
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 400) ?? ''
  let result: Inspection | null = null
  let limited: string | null = null
  if (q.length >= 3) {
    if (perClient.take(clientKey(await headers())) > 0) {
      limited = 'Too many lookups in a minute. Try again shortly.'
    } else {
      try {
        result = await retrievalSlots.run(() => inspect(q))
      } catch (e) {
        if (!(e instanceof Busy)) throw e
        limited = 'The server is busy. Try again in a moment.'
      }
    }
  }

  return (
    <div className="pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl tracking-tight">How a question finds its passages</h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed">
          Two retrievers run side by side: full-text search over stemmed words, and nearest
          neighbours over embeddings. Reciprocal rank fusion merges their lists, and a cross-encoder
          rereads the top of the merged list with the question. The answer is written from the first
          six.
        </p>
      </div>

      <form className="mt-6 flex max-w-2xl gap-2" action="/inspect">
        <label htmlFor="q" className="sr-only">
          Question
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          maxLength={400}
          placeholder="How do I cancel a query manually?"
          className="border-line bg-surface focus:border-accent min-w-0 flex-1 rounded-lg border px-3 py-2 text-[15px] outline-none"
        />
        <button
          type="submit"
          className="bg-accent text-accent-ink rounded-lg px-4 text-sm font-medium"
        >
          Inspect
        </button>
      </form>

      {limited && (
        <p role="alert" className="text-danger mt-6 text-sm">
          {limited}
        </p>
      )}

      {!result && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {FIXTURES.slice(0, 6).map((f) => (
            <li key={f.question}>
              <Link
                href={`/inspect?q=${encodeURIComponent(f.question)}`}
                className="border-line bg-surface hover:border-accent rounded-full border px-3 py-1.5 text-sm"
              >
                {f.question}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <section className="mt-8" aria-labelledby="ranked">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ranked" className="text-sm font-semibold">
              Candidates, in final order
            </h2>
            <p className="text-faint text-xs tabular-nums">
              keyword {result.timings.keyword} ms · vector {result.timings.vector} ms
              {result.timings.rerank !== null && ` · rerank ${result.timings.rerank} ms`}
            </p>
          </div>
          <div className="border-line bg-surface mt-3 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[42rem] text-sm">
              <caption className="sr-only">
                Retrieved passages for “{q}”, with their rank in each retriever, after fusion and
                after reranking
              </caption>
              <thead className="text-muted text-left text-xs">
                <tr className="border-line border-b">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Passage
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Keyword
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Vector
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Fused
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Reranked
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Rerank score
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {result.rows.map((r, i) => (
                  <tr
                    key={r.passage.id}
                    className={`border-line border-b last:border-b-0 ${i < 6 ? '' : 'text-muted'}`}
                  >
                    <td className="max-w-0 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {i < 6 && (
                          <span className="bg-accent text-accent-ink inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-semibold">
                            {i + 1}
                          </span>
                        )}
                        <span className="truncate font-mono text-[12.5px]">
                          {r.passage.file}:{r.passage.startLine}–{r.passage.endLine}
                        </span>
                      </div>
                      <div className="text-muted truncate text-xs">
                        {[r.passage.title, ...r.passage.headings].join(' › ')}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Rank value={r.keywordRank} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Rank value={r.vectorRank} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Rank value={r.fusedRank} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Rank value={r.rerankRank} best={r.rerankRank === 1} />
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right">
                      {r.rerankScore === null ? '–' : r.rerankScore.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted mt-3 max-w-2xl text-xs leading-relaxed">
            A dash means that retriever did not return the passage in its top ten. Fusion scores
            each passage by 1 / (60 + rank) in each list and adds them, so agreement between the two
            retrievers beats a single first place. The first six rows are what the model reads.
          </p>
        </section>
      )}
    </div>
  )
}
