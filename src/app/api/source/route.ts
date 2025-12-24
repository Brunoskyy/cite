import { readCorpusFile } from '@/lib/corpus'

export const runtime = 'nodejs'

/** A corpus file's lines, for the sources panel. Only files that exist in the corpus are served. */
export async function GET(request: Request): Promise<Response> {
  const file = new URL(request.url).searchParams.get('file') ?? ''
  if (file.length > 200) return Response.json({ error: 'not found' }, { status: 404 })
  const source = await readCorpusFile(file)
  if (source === null) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(
    { file, lines: source.split('\n') },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  )
}
