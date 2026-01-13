import 'dotenv/config'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { chunkMarkdown, embeddingText, type Chunk } from '../src/lib/chunk'
import { CORPUS_DIR, listCorpusFiles } from '../src/lib/corpus'
import { closeDb, db, toVector } from '../src/lib/db'
import { embedPassages } from '../src/lib/embed'

/**
 * Chunks every corpus file, embeds the chunks, and replaces the table's
 * contents in one transaction. Each chunk is keyed by a hash of its file,
 * lines and embedded text (title and headings included), so re-running on an unchanged corpus re-embeds nothing.
 */
async function main() {
  const started = performance.now()
  const files = await listCorpusFiles()
  const chunks: Array<Chunk & { hash: string }> = []
  for (const file of files) {
    const source = await readFile(join(CORPUS_DIR, ...file.split('/')), 'utf8')
    for (const c of chunkMarkdown(file, source)) {
      const hash = createHash('sha256')
        // Everything that ends up in the row: the embedded text includes the title.
        .update(`${c.file}:${c.startLine}-${c.endLine}:${c.headings.join('>')}:${embeddingText(c)}`)
        .digest('hex')
      if (!chunks.some((x) => x.hash === hash)) chunks.push({ ...c, hash })
    }
  }

  const client = await db().connect()
  try {
    const { rows } = await client.query<{ hash: string }>('SELECT hash FROM chunks')
    const existing = new Set(rows.map((r) => r.hash))
    const fresh = chunks.filter((c) => !existing.has(c.hash))
    const wanted = new Set(chunks.map((c) => c.hash))
    const stale = [...existing].filter((h) => !wanted.has(h))

    console.log(
      `${files.length} files, ${chunks.length} chunks: ${fresh.length} new, ${stale.length} stale`,
    )
    const vectors = fresh.length ? await embedPassages(fresh.map(embeddingText)) : []

    await client.query('BEGIN')
    if (stale.length) await client.query('DELETE FROM chunks WHERE hash = ANY($1)', [stale])
    for (const [i, c] of fresh.entries()) {
      await client.query(
        `INSERT INTO chunks
           (file, title, headings, heading_path, start_line, end_line, content, embedding, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)`,
        [
          c.file,
          c.title,
          c.headings,
          c.headings.join(' '),
          c.startLine,
          c.endLine,
          c.text,
          toVector(vectors[i]!),
          c.hash,
        ],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
  console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)} s`)
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void closeDb())
