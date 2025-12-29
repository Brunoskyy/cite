import 'server-only'

import { RateLimiter, Semaphore } from './limits'

/**
 * Shared by every entry point that runs the embedding model or the
 * reranker, so the ask API and the inspector page draw from one budget.
 */
export const perClient = new RateLimiter(20, 60_000)
export const retrievalSlots = new Semaphore(2, 8)
