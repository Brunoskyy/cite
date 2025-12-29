'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import type { StreamEvent } from '@/lib/answer'
import type { Segment } from '@/lib/citations'
import { readNdjson } from '@/lib/ndjson'
import { answerForClipboard, citedIndices } from '@/lib/render'
import type { Passage } from '@/lib/types'

import { AnswerView } from './answer-view'
import { SourcesPanel } from './sources-panel'

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'stopped' | 'error'

interface Result {
  question: string
  passages: Passage[]
  recorded: boolean
  segments: Segment[]
  done: Extract<StreamEvent, { type: 'done' }> | null
  noKey: boolean
  error: { message: string; retryable: boolean } | null
}

const empty = (question: string): Result => ({
  question,
  passages: [],
  recorded: false,
  segments: [],
  done: null,
  noKey: false,
  error: null,
})

function appendSegment(list: Segment[], s: Segment): Segment[] {
  const last = list[list.length - 1]
  if (s.type === 'text' && last?.type === 'text')
    return [...list.slice(0, -1), { type: 'text', text: last.text + s.text }]
  return [...list, s]
}

export function Ask({ suggestions, live }: { suggestions: string[]; live: boolean }) {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<Result | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [peek, setPeek] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => () => controller.current?.abort(), [])

  // "/" focuses the question box, like most search fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key === '/' && target?.tagName !== 'TEXTAREA' && target?.tagName !== 'INPUT') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ask = useCallback(async (q: string) => {
    const text = q.trim()
    if (text.length < 3) return
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setQuestion(text)
    setResult(empty(text))
    setActive(null)
    setCopied(false)
    setStatus('loading')
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setResult((r) => ({
          ...(r ?? empty(text)),
          error: {
            message: body.error ?? `The server answered ${res.status}.`,
            retryable: res.status >= 429,
          },
        }))
        setStatus('error')
        return
      }
      for await (const event of readNdjson<StreamEvent>(res.body)) {
        if (ctrl.signal.aborted) break
        setResult((r) => {
          const cur = r ?? empty(text)
          switch (event.type) {
            case 'sources':
              return { ...cur, passages: event.passages, recorded: event.source === 'recorded' }
            case 'text':
            case 'cite':
              return { ...cur, segments: appendSegment(cur.segments, event) }
            case 'notice':
              return { ...cur, noKey: true }
            case 'done':
              return { ...cur, done: event }
            case 'error':
              return { ...cur, error: { message: event.message, retryable: event.retryable } }
          }
        })
        if (event.type === 'text' || event.type === 'cite') setStatus('streaming')
        if (event.type === 'error') setStatus('error')
      }
      setStatus((s) => (ctrl.signal.aborted ? 'stopped' : s === 'error' ? 'error' : 'done'))
    } catch (e) {
      if (ctrl.signal.aborted) {
        setStatus('stopped')
        return
      }
      setResult((r) => ({
        ...(r ?? empty(text)),
        error: {
          message:
            e instanceof Error && e.message
              ? 'Lost the connection to the server.'
              : 'Something went wrong.',
          retryable: true,
        },
      }))
      setStatus('error')
    }
  }, [])

  const stop = () => controller.current?.abort()

  const select = useCallback((n: number | null) => {
    setActive(n)
    // On a phone the sources sit below the answer; bring the opened one into view.
    if (n !== null && window.matchMedia('(max-width: 1023px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() =>
        document
          .getElementById(`source-${n}`)
          ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }),
      )
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(question)
  }

  const busy = status === 'loading' || status === 'streaming'
  const cited = result ? citedIndices(result.segments) : new Set<number>()
  const refused = result?.done?.refused ?? false

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <form
          onSubmit={submit}
          className="border-line bg-surface focus-within:border-accent rounded-2xl border p-2 shadow-sm"
        >
          <label htmlFor="question" className="sr-only">
            Question about TanStack Query
          </label>
          <textarea
            id="question"
            ref={input}
            rows={2}
            maxLength={400}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void ask(question)
              }
            }}
            placeholder="Ask something about TanStack Query, like how to cancel a query"
            className="placeholder:text-faint block w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-1">
            <span className="text-faint text-xs">
              Enter to ask · Shift+Enter for a new line · <kbd className="font-mono">/</kbd> to
              focus
            </span>
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="border-line hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-sm"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={question.trim().length < 3}
                className="bg-accent text-accent-ink rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Ask
              </button>
            )}
          </div>
        </form>

        {!result && (
          <div className="mt-8">
            <h2 className="text-muted text-xs font-semibold tracking-wider uppercase">
              {live ? 'Try one of these' : 'Recorded demo questions'}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void ask(s)}
                    className="border-line bg-surface hover:border-accent rounded-full border px-3 py-1.5 text-left text-sm"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            {!live && (
              <p className="text-muted mt-6 max-w-prose text-sm">
                This instance runs without an API key. The questions above replay answers written
                against the exact passages the search returns; any other question shows the passages
                Cite would send to the model.
              </p>
            )}
          </div>
        )}

        {result && (
          <article className="mt-8" aria-live="polite" aria-busy={busy}>
            <h1 className="text-muted mb-3 text-sm font-medium">{result.question}</h1>

            {status === 'loading' && result.segments.length === 0 && !result.noKey && (
              <p className="text-muted text-sm" role="status">
                {result.passages.length ? 'Writing the answer…' : 'Searching the docs…'}
              </p>
            )}

            {result.segments.length > 0 && (
              <div
                className={refused ? 'border-line rounded-xl border border-dashed p-4' : undefined}
              >
                <AnswerView
                  segments={result.segments}
                  passages={result.passages}
                  streaming={status === 'streaming'}
                  active={active}
                  onSelect={select}
                  onPeek={setPeek}
                />
                {refused && (
                  <p className="text-muted mt-2 text-sm">
                    Nothing in the retrieved passages answers this, so Cite says so instead of
                    guessing. The passages it looked at are listed alongside.
                  </p>
                )}
              </div>
            )}

            {result.noKey && (
              <div className="border-line bg-surface rounded-xl border p-4 text-sm">
                <p className="font-medium">This question is not one of the recorded demos.</p>
                <p className="text-muted mt-1">
                  Live answers need an <code className="font-mono">ANTHROPIC_API_KEY</code> on the
                  server. Here are the {result.passages.length} passages the search found; with a
                  key, these are what the model would read and cite.
                </p>
              </div>
            )}

            {result.error && (
              <div
                role="alert"
                className="border-danger/40 text-danger mt-4 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <span>{result.error.message}</span>
                {result.error.retryable && (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void ask(result.question)}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}

            {status === 'stopped' && <p className="text-muted mt-3 text-sm">Stopped.</p>}

            {(status === 'done' || status === 'stopped') && result.segments.length > 0 && (
              <div className="text-muted mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <button
                  type="button"
                  className="hover:text-ink underline-offset-2 hover:underline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(answerForClipboard(result.segments, result.passages))
                      .then(() => setCopied(true))
                  }}
                >
                  {copied ? 'Copied with sources' : 'Copy with sources'}
                </button>
                <button
                  type="button"
                  className="hover:text-ink underline-offset-2 hover:underline"
                  onClick={() => void ask(result.question)}
                >
                  Ask again
                </button>
                <a
                  className="hover:text-ink underline-offset-2 hover:underline"
                  href={`/inspect?q=${encodeURIComponent(result.question)}`}
                >
                  See how these passages were found
                </a>
                {result.done && (
                  <span className="text-faint ml-auto">
                    {result.done.model === 'recorded' ? 'recorded answer' : result.done.model} ·{' '}
                    {result.done.citations} citations
                    {result.done.invalidCitations.length > 0 &&
                      ` · ${result.done.invalidCitations.length} dropped`}
                  </span>
                )}
              </div>
            )}
          </article>
        )}
      </div>

      <div ref={panel} className="lg:sticky lg:top-20 lg:self-start">
        {result && (
          <SourcesPanel
            passages={result.passages}
            cited={cited}
            active={active}
            peek={peek}
            onSelect={select}
            recorded={result.recorded}
          />
        )}
      </div>
    </div>
  )
}
