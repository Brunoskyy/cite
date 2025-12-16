import 'server-only'

import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export const CORPUS_DIR = join(process.cwd(), 'corpus')

/** Every Markdown file in the corpus, as forward-slash paths relative to it. */
export async function listCorpusFiles(dir = CORPUS_DIR): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'SOURCE.md')
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort()
}

let known: Promise<Set<string>> | null = null

/**
 * Reads a corpus file by its relative path. The path is checked against the
 * list of files that exist rather than normalised, so `..`, absolute paths,
 * encoded separators and anything else simply do not match.
 */
export async function readCorpusFile(file: string): Promise<string | null> {
  known ??= listCorpusFiles().then((f) => new Set(f))
  if (!(await known).has(file)) return null
  return readFile(join(CORPUS_DIR, ...file.split('/')), 'utf8')
}
