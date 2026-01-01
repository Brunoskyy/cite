import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/retrieve', () => ({
  retrieve: vi.fn().mockResolvedValue([
    {
      passage: {
        id: 9,
        file: 'guides/x.md',
        title: 'X',
        headings: [],
        startLine: 1,
        endLine: 3,
        text: 'x',
      },
      score: 1,
      keywordRank: 1,
      vectorRank: 1,
    },
  ]),
}))

const post = (body: string, ip = '1.1.1.1') =>
  new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body,
  })

async function lines(res: Response): Promise<Array<{ type: string }>> {
  const text = await res.text()
  return text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { type: string })
}

describe('POST /api/ask', () => {
  it('streams a recorded answer as newline-delimited JSON', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { POST } = await import('./route')
    const res = await POST(post(JSON.stringify({ question: 'How do I cancel a query manually?' })))
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const events = await lines(res)
    expect(events[0]).toMatchObject({ type: 'sources', source: 'recorded' })
    expect(events.some((e) => e.type === 'cite')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('returns passages and the no-key notice for other questions', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { POST } = await import('./route')
    const events = await lines(
      await POST(post(JSON.stringify({ question: 'What is gcTime?' }), '2.2.2.2')),
    )
    expect(events.map((e) => e.type)).toEqual(['sources', 'notice'])
  })

  it('rejects bad input with a reason', async () => {
    const { POST } = await import('./route')
    expect((await POST(post('not json', '3.3.3.3'))).status).toBe(400)
    const short = await POST(post(JSON.stringify({ question: 'hi' }), '3.3.3.3'))
    expect(short.status).toBe(400)
    expect(((await short.json()) as { error: string }).error).toMatch(/three characters/)
    expect(
      (await POST(post(JSON.stringify({ question: 'x'.repeat(401) }), '3.3.3.3'))).status,
    ).toBe(400)
    expect(
      (await POST(post(JSON.stringify({ question: 'ok?', mode: 'sql' }), '3.3.3.3'))).status,
    ).toBe(400)
    expect((await POST(post('x'.repeat(5000), '3.3.3.3'))).status).toBe(413)
  })

  it('rate limits one client without affecting another', async () => {
    const { POST } = await import('./route')
    let last = 0
    for (let i = 0; i < 21; i += 1) last = (await POST(post('{}', '4.4.4.4'))).status
    expect(last).toBe(429)
    expect((await POST(post('{}', '5.5.5.5'))).status).toBe(400)
  })
})
