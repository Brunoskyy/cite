import { describe, expect, it } from 'vitest'

import { Busy, clientKey, RateLimiter, readLimited, Semaphore } from './limits'

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

describe('RateLimiter memory', () => {
  it('evicts the least recently seen keys past the cap', () => {
    const rl = new RateLimiter(1, 60_000, () => 0, 3)
    for (const k of ['a', 'b', 'c']) rl.take(k)
    rl.take('a') // a is now the most recent
    rl.take('d')
    expect(rl.size).toBe(3)
    // b was evicted, so it gets a fresh budget; a was kept and is still limited.
    expect(rl.take('a')).toBeGreaterThan(0)
    expect(rl.take('b')).toBe(0)
  })
})

describe('clientKey', () => {
  const h = (xff: string) => new Headers({ 'x-forwarded-for': xff, 'x-real-ip': '9.9.9.9' })

  it('ignores forwarding headers unless a proxy is trusted', () => {
    expect(clientKey(h('1.1.1.1'), undefined)).toBe('direct')
    expect(clientKey(h('2.2.2.2'), '')).toBe('direct')
    expect(clientKey(h('2.2.2.2'), 'nonsense')).toBe('direct')
  })

  it('takes the hop the trusted proxy appended, not what the client claimed', () => {
    // The client sent "6.6.6.6"; the proxy appended the real address.
    expect(clientKey(h('6.6.6.6, 203.0.113.7'), '1')).toBe('203.0.113.7')
    expect(clientKey(h('6.6.6.6, 203.0.113.7'), 'true')).toBe('203.0.113.7')
    expect(clientKey(h('6.6.6.6, 203.0.113.7, 10.0.0.2'), '2')).toBe('203.0.113.7')
    expect(clientKey(new Headers(), '1')).toBe('direct')
  })

  it('gives a spoofing client no new budget', () => {
    const rl = new RateLimiter(2, 60_000, () => 0)
    const hit = (spoof: string) => rl.take(clientKey(h(`${spoof}, 203.0.113.7`), '1'))
    expect(hit('1.1.1.1')).toBe(0)
    expect(hit('2.2.2.2')).toBe(0)
    expect(hit('3.3.3.3')).toBeGreaterThan(0)
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
