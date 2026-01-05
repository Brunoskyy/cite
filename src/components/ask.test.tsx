import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Ask } from './ask'

/** A fetch whose response streams the given lines, the next one only when `release` is called. */
function controlledFetch() {
  const pending: Array<{ push: (line: string) => void; close: () => void; signal: AbortSignal }> =
    []
  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
    })
    const signal = init.signal!
    signal.addEventListener('abort', () =>
      controller.error(new DOMException('aborted', 'AbortError')),
    )
    pending.push({
      push: (line) => controller.enqueue(new TextEncoder().encode(line + '\n')),
      close: () => controller.close(),
      signal,
    })
    return Promise.resolve(new Response(body, { status: 200 }))
  })
  return { fetchMock, pending }
}

afterEach(() => vi.unstubAllGlobals())

const sources = JSON.stringify({
  type: 'sources',
  source: 'retrieved',
  mode: 'rerank',
  passages: [
    { id: 1, file: 'a.md', title: 'A', headings: [], startLine: 1, endLine: 2, text: 'x' },
  ],
})
const done = JSON.stringify({
  type: 'done',
  stopReason: 'end_turn',
  refused: false,
  declined: false,
  citations: 1,
  invalidCitations: [],
  model: 'claude-opus-5-5',
})

describe('Ask', () => {
  it('streams an answer with its citation and offers to copy it', async () => {
    const { fetchMock, pending } = controlledFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(<Ask suggestions={['How do I cancel?']} live />)
    await userEvent.click(screen.getByRole('button', { name: 'How do I cancel?' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    act(() => {
      pending[0]!.push(sources)
      pending[0]!.push(JSON.stringify({ type: 'text', text: 'Call cancelQueries ' }))
      pending[0]!.push(JSON.stringify({ type: 'cite', indices: [1] }))
      pending[0]!.push(done)
      pending[0]!.close()
    })
    expect(await screen.findByRole('button', { name: /^Source 1: a\.md/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Copy with sources' })).toBeInTheDocument()
    expect(screen.getByText(/claude-opus-5-5 · 1 citations/)).toBeInTheDocument()
  })

  it('a newer question is not marked stopped when the older one unwinds', async () => {
    const { fetchMock, pending } = controlledFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(<Ask suggestions={['First question?', 'Second question?']} live />)
    await userEvent.click(screen.getByRole('button', { name: 'First question?' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    act(() => pending[0]!.push(sources))

    // Ask a second question from the box while the first is still streaming.
    const box = screen.getByLabelText('Question about TanStack Query')
    await userEvent.clear(box)
    await userEvent.type(box, 'Second question?{Enter}')
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[0]!.signal.aborted).toBe(true)
    act(() => pending[1]!.push(sources))
    // Let the first request's aborted read unwind before the new answer has any text.
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(screen.queryByText('Stopped.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Writing the answer')
    act(() => pending[1]!.push(JSON.stringify({ type: 'text', text: 'Second answer.' })))
    expect(await screen.findByText('Second answer.')).toBeInTheDocument()
  })

  it('Stop stops, and does not submit the question again', async () => {
    const { fetchMock, pending } = controlledFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(<Ask suggestions={['Long one?']} live />)
    await userEvent.click(screen.getByRole('button', { name: 'Long one?' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    act(() => {
      pending[0]!.push(sources)
      pending[0]!.push(JSON.stringify({ type: 'text', text: 'Partial' }))
    })
    await screen.findByText('Partial')
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(await screen.findByText('Stopped.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pending[0]!.signal.aborted).toBe(true)
  })

  it('explains the no-key case and shows an error with retry', async () => {
    const { fetchMock, pending } = controlledFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(<Ask suggestions={['Other?']} live={false} />)
    expect(screen.getByText(/runs without an API key/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Other?' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    act(() => {
      pending[0]!.push(sources)
      pending[0]!.push(JSON.stringify({ type: 'notice', kind: 'no-key' }))
      pending[0]!.push(
        JSON.stringify({ type: 'error', message: 'Could not reach the API.', retryable: true }),
      )
      pending[0]!.close()
    })
    expect(await screen.findByText(/not one of the recorded demos/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
