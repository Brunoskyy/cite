/**
 * Small in-process guards for a single-instance demo. Embedding and
 * reranking run on this machine's CPU, so the expensive part of a request
 * is bounded twice: per client by a sliding window, and globally by a
 * semaphore that queues work instead of running it all at once.
 */

export class RateLimiter {
  /** Insertion order is recency order: every take moves its key to the end. */
  private readonly hits = new Map<string, number[]>()
  private readonly limit: number
  private readonly windowMs: number
  private readonly maxKeys: number
  private readonly now: () => number

  constructor(limit: number, windowMs: number, now: () => number = Date.now, maxKeys = 10_000) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
    this.maxKeys = maxKeys
  }

  /** Records a hit and returns how many ms to wait, or 0 when allowed. */
  take(key: string): number {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    this.hits.delete(key)
    this.hits.set(key, recent)
    // Bounded memory whatever the keys are: the least recently seen go first.
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value
      if (oldest === undefined) break
      this.hits.delete(oldest)
    }
    if (recent.length >= this.limit) return this.windowMs - (now - recent[0]!)
    recent.push(now)
    return 0
  }

  get size(): number {
    return this.hits.size
  }
}

export class Semaphore {
  private active = 0
  private readonly waiting: Array<() => void> = []
  private readonly max: number
  private readonly maxQueue: number

  constructor(max: number, maxQueue: number) {
    this.max = max
    this.maxQueue = maxQueue
  }

  /** Runs `work` when a slot is free; rejects at once when the queue is full. */
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.waiting.length >= this.maxQueue) throw new Busy()
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.active += 1
    try {
      return await work()
    } finally {
      this.active -= 1
      this.waiting.shift()?.()
    }
  }
}

export class Busy extends Error {
  constructor() {
    super('busy')
  }
}

/** Reads a request body up to `max` bytes, whatever Content-Length claims. */
export async function readLimited(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Who a request is from, for the per-client limit. Forwarding headers are
 * written by whoever sends the request, so they are only believed when the
 * deployment says a proxy sets them: `TRUST_PROXY=n` means n proxies append
 * to `X-Forwarded-For`, and the entry they added is n from the right.
 *
 * Without it, Next.js route handlers do not expose the socket address, so
 * every request shares one key. That makes the per-client limit a global
 * one, which is the safe failure: a spoofed header cannot buy a new budget.
 */
export function clientKey(headers: Headers, trustProxy = process.env.TRUST_PROXY): string {
  const hops = trustedHops(trustProxy)
  if (hops === 0) return 'direct'
  const chain = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return chain[chain.length - hops] ?? 'direct'
}

function trustedHops(value: string | undefined): number {
  if (!value) return 0
  if (value === 'true') return 1
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : 0
}
