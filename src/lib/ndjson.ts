/**
 * Splits a byte stream into JSON values, one per line. A line can arrive
 * in pieces, or several lines in one chunk; a line that is not JSON is
 * skipped rather than ending the stream.
 */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) {
          const parsed = tryParse<T>(line)
          if (parsed !== undefined) yield parsed
        }
        newline = buffer.indexOf('\n')
      }
      if (done) break
    }
    const rest = buffer.trim()
    if (rest) {
      const parsed = tryParse<T>(rest)
      if (parsed !== undefined) yield parsed
    }
  } finally {
    reader.releaseLock()
  }
}

function tryParse<T>(line: string): T | undefined {
  try {
    return JSON.parse(line) as T
  } catch {
    return undefined
  }
}
