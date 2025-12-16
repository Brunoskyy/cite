import 'server-only'

import { Pool } from 'pg'

let pool: Pool | null = null

/** One pool per process. `DATABASE_URL` must point at Postgres with pgvector. */
export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is not set. See .env.example.')
    pool = new Pool({ connectionString, max: 5 })
  }
  return pool
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end()
  pool = null
}

/** pgvector's text format: `[0.1,0.2,...]`. */
export function toVector(values: readonly number[]): string {
  return `[${values.join(',')}]`
}
