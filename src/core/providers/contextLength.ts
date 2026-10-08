import type { ProviderTarget } from './dialects'
import { ollamaHost, sameOllamaModel } from './ollama'

// How large a context the model actually runs with. This is not the size the model
// was trained for: it is the size the server loaded it with, which the user (or the
// server's defaults) chose, and beyond which the server cuts the conversation itself.
//
// Each local server reports it in its own way; the app asks, and when a server does
// not answer the question the caller falls back on the size set by hand.
//   Ollama               GET /api/ps          models[].context_length (only once the model is loaded)
//   LM Studio            GET /api/v1/models   models[].loaded_instances[].config.context_length
//   LM Studio (older)    GET /api/v0/models   data[].loaded_context_length
//   llama.cpp, KoboldCpp GET /props           default_generation_settings.n_ctx
// Online services give it in their list of models: see listModels() in dialects.ts.

const TIMEOUT_MS = 2000

export interface DetectOptions {
  /**
   * Ollama only: load the model first if it is not in memory. Ollama decides the context
   * when it loads a model, so there is nothing to read before that.
   */
  load?: boolean
  signal?: AbortSignal
}

/** The context length `model` runs with on a local server, or null when the server does not say. */
export async function detectContextLength(
  target: ProviderTarget,
  model: string,
  options: DetectOptions = {},
): Promise<number | null> {
  try {
    if (target.kind === 'ollama') return await fromOllama(target, model, options)
    if (target.kind === 'custom') return await fromLocalServer(target, model, options.signal)
  } catch {
    // A server that is down or does not know these addresses: not an error, just no answer.
  }
  return null
}

async function fromOllama(target: ProviderTarget, model: string, options: DetectOptions): Promise<number | null> {
  const host = ollamaHost(target.baseUrl)
  const running = async (): Promise<number | null> => {
    const payload = await getJson(`${host}/api/ps`, target, options.signal)
    const models = isRecord(payload) && Array.isArray(payload['models']) ? payload['models'].filter(isRecord) : []
    const found = models.find((item) => sameOllamaModel(item['name'], model) || sameOllamaModel(item['model'], model))
    return positive(found?.['context_length'])
  }

  const loaded = await running()
  if (loaded !== null || !options.load) return loaded

  // An empty request makes Ollama load the model, and answers once it is in memory.
  const response = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
    signal: options.signal,
  })
  await response.arrayBuffer()
  return response.ok ? running() : null
}

async function fromLocalServer(target: ProviderTarget, model: string, signal?: AbortSignal): Promise<number | null> {
  // These addresses sit next to /v1, not under it: http://127.0.0.1:1234/v1 -> http://127.0.0.1:1234
  const host = ollamaHost(target.baseUrl)
  const ask = (path: string): Promise<unknown> => getJson(`${host}${path}`, target, signal).catch(() => null)

  // LM Studio
  const current = await ask('/api/v1/models')
  if (isRecord(current) && Array.isArray(current['models'])) {
    for (const item of current['models'].filter(isRecord)) {
      const instances = Array.isArray(item['loaded_instances']) ? item['loaded_instances'].filter(isRecord) : []
      // A model can be loaded several times, each under its own id.
      const instance = instances.find((loaded) => loaded['id'] === model) ?? (item['key'] === model ? instances[0] : undefined)
      if (instance) return positive(isRecord(instance['config']) ? instance['config']['context_length'] : null)
    }
    return null // LM Studio answered and the model is not loaded: nothing to read yet.
  }

  const older = await ask('/api/v0/models')
  if (isRecord(older) && Array.isArray(older['data'])) {
    const found = older['data'].filter(isRecord).find((item) => item['id'] === model)
    return positive(found?.['loaded_context_length'])
  }

  // llama.cpp and KoboldCpp serve one model: its settings are the server's.
  const props = await ask('/props')
  if (isRecord(props) && isRecord(props['default_generation_settings'])) {
    return positive(props['default_generation_settings']['n_ctx'])
  }
  return null
}

async function getJson(url: string, target: ProviderTarget, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const response = await fetch(url, {
    headers: target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {},
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error(`${response.status}`)
  return response.json()
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
