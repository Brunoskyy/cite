import 'dotenv/config'

import { readFile } from 'node:fs/promises'

import { closeDb, db } from '../src/lib/db'

/** Applies db/schema.sql. Every statement is idempotent, so running it twice is fine. */
async function main() {
  const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
  await db().query(sql)
  console.log('schema applied')
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void closeDb())
