import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Passage } from '@/lib/types'

import { AnswerView } from './answer-view'
import { SourcesPanel } from './sources-panel'

const passages: Passage[] = [
  {
    id: 1,
    file: 'guides/a.md',
    title: 'A',
    headings: ['Intro'],
    startLine: 3,
    endLine: 4,
    text: 'x',
  },
  { id: 2, file: 'guides/b.md', title: 'B', headings: [], startLine: 1, endLine: 2, text: 'y' },
]

afterEach(() => vi.unstubAllGlobals())

describe('AnswerView', () => {
  it('renders citations as labelled buttons that select their source', async () => {
    const onSelect = vi.fn()
    render(
      <AnswerView
        segments={[
          { type: 'text', text: 'Use `cancelQueries` ' },
          { type: 'cite', indices: [1, 2] },
          { type: 'text', text: '.' },
        ]}
        passages={passages}
        streaming={false}
        active={null}
        onSelect={onSelect}
        onPeek={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button', { name: 'Source 2: guides/b.md, lines 1 to 2' })
    await userEvent.click(chip)
    expect(onSelect).toHaveBeenCalledWith(2)
    expect(screen.getByText('cancelQueries').tagName).toBe('CODE')
  })

  it('keeps a click working while hover state changes underneath it', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <AnswerView
        segments={[{ type: 'cite', indices: [1] }]}
        passages={passages}
        streaming={false}
        active={null}
        onSelect={onSelect}
        onPeek={vi.fn()}
      />,
    )
    const before = screen.getByRole('button', { name: /^Source 1/ })
    rerender(
      <AnswerView
        segments={[{ type: 'cite', indices: [1] }]}
        passages={passages}
        streaming={false}
        active={1}
        onSelect={onSelect}
        onPeek={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /^Source 1/ })).toBe(before)
    expect(before).toHaveAttribute('aria-pressed', 'true')
  })

  it('never renders model-written raw HTML or script links', () => {
    render(
      <AnswerView
        segments={[
          {
            type: 'text',
            text: 'Hi <img src=x onerror=alert(1)> [click](javascript:alert(1)) [docs](https://tanstack.com)',
          },
        ]}
        passages={passages}
        streaming={false}
        active={null}
        onSelect={vi.fn()}
        onPeek={vi.fn()}
      />,
    )
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('click').closest('a')).toBeNull()
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://tanstack.com',
    )
  })
})

describe('SourcesPanel', () => {
  it('lists sources, marks the cited ones, and highlights the cited lines when opened', async () => {
    const lines = ['l1', 'l2', 'cited three', 'cited four', 'l5']
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ file: 'guides/a.md', lines }))),
    )
    Element.prototype.scrollIntoView = vi.fn()
    const onSelect = vi.fn()
    const { rerender } = render(
      <SourcesPanel
        passages={passages}
        cited={new Set([1])}
        active={null}
        peek={null}
        onSelect={onSelect}
        recorded={false}
      />,
    )
    expect(screen.getByText('2 retrieved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /guides\/a\.md/ }))
    expect(onSelect).toHaveBeenCalledWith(1)

    rerender(
      <SourcesPanel
        passages={passages}
        cited={new Set([1])}
        active={1}
        peek={null}
        onSelect={onSelect}
        recorded={false}
      />,
    )
    await waitFor(() => expect(screen.getByText('cited three')).toBeInTheDocument())
    const row = screen.getByText('cited three').closest('tr')!
    expect(row).toHaveAttribute('aria-current', 'location')
    expect(row.className).toContain('bg-mark')
    expect(screen.getByText('l1').closest('tr')!.className).not.toContain('bg-mark')
    expect(fetch).toHaveBeenCalledWith('/api/source?file=guides%2Fa.md')
  })
})
