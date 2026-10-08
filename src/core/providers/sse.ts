/**
 * Reads a Server-Sent Events stream and yields the payload of each `data:` line.
 * Network chunks can cut a line in half, so text is buffered until a full line arrives.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const data = parseDataLine(line)
        if (data !== null) yield data
      }
    }

    const last = parseDataLine(buffer + decoder.decode())
    if (last !== null) yield last
  } finally {
    reader.releaseLock()
  }
}

function parseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null
  return line.slice(5).trimStart()
}
