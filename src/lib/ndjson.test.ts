import { describe, expect, it } from 'vitest'

import { readNdjson } from './ndjson'

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p))
      c.close()
    },
  })
}

async function all<T>(it: AsyncIterable<T>) {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

describe('readNdjson', () => {
  it('handles lines split across chunks and several lines per chunk', async () => {
    const values = await all(readNdjson(streamOf(['{"a":', '1}\n{"b":2}\n{"c"', ':3}'])))
    expect(values).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })

  it('skips garbage lines and keeps going', async () => {
    expect(await all(readNdjson(streamOf(['{"a":1}\nnot json\n\n{"b":2}\n'])))).toEqual([
      { a: 1 },
      { b: 2 },
    ])
  })

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"t":"café"}\n')
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 10))
        c.enqueue(bytes.slice(10))
        c.close()
      },
    })
    expect(await all(readNdjson(body))).toEqual([{ t: 'café' }])
  })
})
