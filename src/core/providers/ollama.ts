import type { ModelInfo } from '@shared/types'

// Ollama's own API, next to the OpenAI-compatible one the chat goes through. It is the
// one that lists what is installed, downloads a model and removes one.

/**
 * Lists the models installed in Ollama through its own API, which also gives
 * their size on disk. Chat itself goes through the OpenAI-compatible endpoint.
 */
export async function listOllamaModels(baseUrl: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  const response = await fetch(`${ollamaHost(baseUrl)}/api/tags`, { signal })
  if (!response.ok) throw new Error(`Ollama answered ${response.status}.`)

  const payload = (await response.json()) as { models?: { name?: unknown; size?: unknown }[] }
  return (payload.models ?? [])
    .filter((model): model is { name: string; size?: unknown } => typeof model.name === 'string')
    .map((model) => ({
      id: model.name,
      sizeBytes: typeof model.size === 'number' ? model.size : undefined,
    }))
}

/** http://127.0.0.1:11434/v1 -> http://127.0.0.1:11434 */
export function ollamaHost(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
}

/** Ollama adds ":latest" to a name that has no tag: "gemma4" and "gemma4:latest" are the same model. */
export function sameOllamaModel(name: unknown, model: string): boolean {
  const withTag = (value: string): string => (value.includes(':') ? value : `${value}:latest`)
  return typeof name === 'string' && withTag(name).toLowerCase() === withTag(model).toLowerCase()
}

/** The version of the Ollama at this address, or null when nothing there answers like one. */
export async function ollamaVersion(baseUrl: string, timeoutMs = 800): Promise<string | null> {
  try {
    const response = await fetch(`${ollamaHost(baseUrl)}/api/version`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return null
    const payload = (await response.json()) as { version?: unknown }
    return typeof payload.version === 'string' ? payload.version : null
  } catch {
    return null
  }
}

// --- Downloading a model -----------------------------------------------------------

export interface PullProgress {
  /** False until Ollama starts on the files, true again once they are all there and being checked. */
  phase: 'preparing' | 'downloading' | 'finishing'
  doneBytes: number
  /** Grows as Ollama announces the files of the model: the largest one comes first. */
  totalBytes: number
}

/**
 * Follows the lines Ollama sends while it downloads a model. Each file of a model (its
 * weights, its template…) reports its own progress, by digest; this adds them up.
 */
export function createPullTracker(): { read(line: unknown): PullProgress; progress(): PullProgress } {
  const files = new Map<string, { total: number; done: number }>()
  let phase: PullProgress['phase'] = 'preparing'

  const progress = (): PullProgress => {
    let doneBytes = 0
    let totalBytes = 0
    for (const file of files.values()) {
      doneBytes += Math.min(file.done, file.total)
      totalBytes += file.total
    }
    return { phase, doneBytes, totalBytes }
  }

  return {
    progress,
    read(line) {
      if (typeof line !== 'object' || line === null) return progress()
      const { status, digest, total, completed } = line as Record<string, unknown>
      if (typeof digest === 'string' && typeof total === 'number' && total > 0) {
        const done = typeof completed === 'number' ? completed : 0
        // A file's count never goes back: a retry inside Ollama restarts its own numbers.
        files.set(digest, { total, done: Math.max(done, files.get(digest)?.done ?? 0) })
        phase = 'downloading'
      } else if (typeof status === 'string' && files.size > 0 && /^(verifying|writing|removing|success)/i.test(status)) {
        phase = 'finishing'
      }
      return progress()
    },
  }
}

/**
 * Has the Ollama at `baseUrl` download a model. Resolves when it is installed; throws
 * what Ollama said when it cannot be. Aborting `signal` stops the download: Ollama keeps
 * what it already has, and a later call goes on from there.
 */
export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${ollamaHost(baseUrl)}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal,
  })
  if (!response.ok || !response.body) throw new Error(await errorOf(response))

  const tracker = createPullTracker()
  let succeeded = false
  for await (const line of jsonLines(response.body)) {
    const { error, status } = line as { error?: unknown; status?: unknown }
    if (typeof error === 'string') throw new Error(error)
    if (status === 'success') succeeded = true
    onProgress(tracker.read(line))
  }
  // A stream that just stops (Ollama was quit, the network dropped) is not a download.
  if (!succeeded) throw new Error('The download stopped before the end.')
}

// --- Embeddings -------------------------------------------------------------------

/**
 * One vector per text, in the same order, each of length 1. The model has to be an
 * embedding model the Ollama at `baseUrl` holds; throws what Ollama said otherwise.
 */
export async function embedWithOllama(
  baseUrl: string,
  model: string,
  texts: readonly string[],
  signal?: AbortSignal,
  /** How long Ollama keeps the model in memory afterwards ("30m"). Left out: as Ollama is set. */
  keepAlive?: string,
): Promise<number[][]> {
  if (texts.length === 0) return []
  const response = await fetch(`${ollamaHost(baseUrl)}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts, ...(keepAlive && { keep_alive: keepAlive }) }),
    signal,
  })
  if (!response.ok) throw new Error(await errorOf(response))
  const { embeddings } = (await response.json()) as { embeddings?: unknown }
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length || !embeddings.every((item) => Array.isArray(item) && item.length > 0)) {
    throw new Error('Ollama did not answer one vector per text.')
  }
  return embeddings as number[][]
}

/** Removes a model from the disk. Removing one that is not there is not an error. */
export async function deleteOllamaModel(baseUrl: string, model: string): Promise<void> {
  const response = await fetch(`${ollamaHost(baseUrl)}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok && response.status !== 404) throw new Error(await errorOf(response))
}

/** Ollama puts what went wrong in `{"error": "…"}`. */
async function errorOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const { error } = JSON.parse(text) as { error?: unknown }
    if (typeof error === 'string' && error) return error
  } catch {
    // Not JSON: the status will have to do.
  }
  return `Ollama answered ${response.status}.`
}

/** The JSON objects of a stream that sends one per line. */
async function* jsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder()
  let pending = ''
  const parsed = (text: string): unknown[] => {
    try {
      return text.trim() ? [JSON.parse(text)] : []
    } catch {
      return [] // Half a line, or something that is not JSON: skipped.
    }
  }

  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) yield* parsed(line)
  }
  yield* parsed(pending + decoder.decode())
}
