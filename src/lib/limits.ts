/**
 * Small in-process guards for a single-instance demo. Embedding and
 * reranking run on this machine's CPU, so the expensive part of a request
 * is bounded twice: per client by a sliding window, and globally by a
 * semaphore that queues work instead of running it all at once.
 */

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly limit: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  /** Records a hit and returns how many ms to wait, or 0 when allowed. */
  take(key: string): number {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return this.windowMs - (now - recent[0]!)
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.prune(now)
    return 0
  }

  private prune(now: number) {
    for (const [k, ts] of this.hits)
      if (ts.every((t) => now - t >= this.windowMs)) this.hits.delete(k)
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

export function clientKey(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'
  )
}
