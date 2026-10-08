import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectContextLength } from './contextLength'

// A stand-in for a local server: answers the addresses it is given, 404 for the rest.
function server(routes: Record<string, unknown | (() => unknown)>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`
    if (!(key in routes)) return new Response('not found', { status: 404 })
    const body = routes[key]
    return new Response(JSON.stringify(typeof body === 'function' ? body() : body), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const paths = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${new URL(url as string).pathname}`)

describe('detectContextLength', () => {
  afterEach(() => vi.unstubAllGlobals())

  const ollama = { kind: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' } as const
  const custom = { kind: 'custom', baseUrl: 'http://127.0.0.1:1234/v1/' } as const

  it('reads what a running Ollama model was loaded with', async () => {
    server({ 'GET /api/ps': { models: [{ name: 'other:7b', context_length: 2048 }, { name: 'gemma4:latest', model: 'gemma4:latest', context_length: 4096 }] } })
    expect(await detectContextLength(ollama, 'gemma4')).toBe(4096) // "gemma4" is "gemma4:latest"
    expect(await detectContextLength(ollama, 'other:7b')).toBe(2048)
  })

  it('has no answer for an Ollama model that is not in memory, unless asked to load it', async () => {
    let loaded = false
    const fetchMock = server({
      'GET /api/ps': () => ({ models: loaded ? [{ name: 'llama3.1:8b', context_length: 32768 }] : [] }),
      'POST /api/generate': () => {
        loaded = true
        return { done: true, done_reason: 'load' }
      },
    })

    expect(await detectContextLength(ollama, 'llama3.1:8b')).toBeNull()
    expect(paths(fetchMock)).toEqual(['GET /api/ps'])

    expect(await detectContextLength(ollama, 'llama3.1:8b', { load: true })).toBe(32768)
    expect(paths(fetchMock).slice(1)).toEqual(['GET /api/ps', 'POST /api/generate', 'GET /api/ps'])
  })

  it('reads the context LM Studio loaded the model with', async () => {
    const fetchMock = server({
      'GET /api/v1/models': {
        models: [
          { key: 'qwen/qwen3-8b', loaded_instances: [], max_context_length: 131072 },
          {
            key: 'google/gemma-4-26b-a4b',
            max_context_length: 262144,
            loaded_instances: [
              { id: 'google/gemma-4-26b-a4b', config: { context_length: 16384 } },
              { id: 'google/gemma-4-26b-a4b:2', config: { context_length: 4096 } },
            ],
          },
        ],
      },
    })

    expect(await detectContextLength(custom, 'google/gemma-4-26b-a4b')).toBe(16384)
    expect(await detectContextLength(custom, 'google/gemma-4-26b-a4b:2')).toBe(4096) // a second copy of the model
    // Not loaded: what it could read at most is not what it will run with.
    expect(await detectContextLength(custom, 'qwen/qwen3-8b')).toBeNull()
    expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:1234/api/v1/models')
  })

  it('still understands an older LM Studio', async () => {
    server({ 'GET /api/v0/models': { data: [{ id: 'gemma-3-12b', state: 'loaded', max_context_length: 131072, loaded_context_length: 8192 }] } })
    expect(await detectContextLength(custom, 'gemma-3-12b')).toBe(8192)
  })

  it('reads the context of llama.cpp and KoboldCpp, which serve a single model', async () => {
    const fetchMock = server({ 'GET /props': { default_generation_settings: { n_ctx: 12288 } } })
    expect(await detectContextLength(custom, 'whatever-the-name')).toBe(12288)
    expect(paths(fetchMock)).toEqual(['GET /api/v1/models', 'GET /api/v0/models', 'GET /props'])
  })

  it('sends the key of a server that wants one', async () => {
    const fetchMock = server({ 'GET /props': { default_generation_settings: { n_ctx: 4096 } } })
    await detectContextLength({ ...custom, apiKey: 'secret' }, 'm')
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toEqual({ Authorization: 'Bearer secret' })
  })

  it('answers "unknown" instead of failing, whatever goes wrong', async () => {
    server({})
    expect(await detectContextLength(custom, 'm')).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    expect(await detectContextLength(ollama, 'm', { load: true })).toBeNull()
    expect(await detectContextLength(custom, 'm')).toBeNull()

    // An online service is not asked here: its list of models says it.
    expect(await detectContextLength({ kind: 'cloud', provider: 'openai', baseUrl: 'https://example.test' }, 'm')).toBeNull()
  })
})
