import { describe, expect, it } from 'vitest'

import { Busy, RateLimiter, readLimited, Semaphore } from './limits'

describe('RateLimiter', () => {
  it('allows up to the limit in a window, per key', () => {
    let now = 0
    const rl = new RateLimiter(2, 1000, () => now)
    expect(rl.take('a')).toBe(0)
    expect(rl.take('a')).toBe(0)
    expect(rl.take('a')).toBe(1000)
    expect(rl.take('b')).toBe(0)
    now = 400
    expect(rl.take('a')).toBe(600)
    now = 1001
    expect(rl.take('a')).toBe(0)
  })
})

describe('Semaphore', () => {
  it('runs at most max at once and rejects past the queue', async () => {
    const s = new Semaphore(1, 1)
    let release: () => void = () => undefined
    const first = s.run(() => new Promise<string>((r) => (release = () => r('a'))))
    const second = s.run(() => Promise.resolve('b'))
    await expect(s.run(() => Promise.resolve('c'))).rejects.toBeInstanceOf(Busy)
    release()
    await expect(first).resolves.toBe('a')
    await expect(second).resolves.toBe('b')
  })
})

describe('readLimited', () => {
  it('reads small bodies and refuses large ones', async () => {
    const small = new Request('http://x', { method: 'POST', body: '{"q":1}' })
    expect(await readLimited(small, 100)).toBe('{"q":1}')
    const big = new Request('http://x', { method: 'POST', body: 'x'.repeat(5000) })
    expect(await readLimited(big, 100)).toBeNull()
  })
})
