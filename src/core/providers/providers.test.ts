import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LlmMessage } from '../prompt/buildMessages'
import { joinUrl, listModels, openAiContextLength, type ProviderTarget } from './dialects'
import { HttpError } from './httpError'
import { describeConnectionError, describeEmptyReply, testConnection } from './index'
import { ollamaHost } from './ollama'
import { streamChat } from './openaiCompatible'
import { readSseData } from './sse'

function streamOf(...parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of source) items.push(item)
  return items
}

describe('readSseData', () => {
  it('reads one payload per data line', async () => {
    expect(await collect(readSseData(streamOf('data: one\n\ndata: two\n\n')))).toEqual(['one', 'two'])
  })

  it('joins a line that was cut across two network chunks', async () => {
    expect(await collect(readSseData(streamOf('data: hel', 'lo\n\nda', 'ta: world\n\n')))).toEqual([
      'hello',
      'world',
    ])
  })

  it('accepts Windows line endings, comments and a last line without a newline', async () => {
    expect(await collect(readSseData(streamOf(': ping\r\ndata: a\r\n\r\ndata: b')))).toEqual(['a', 'b'])
  })
})

describe('streamChat', () => {
  afterEach(() => vi.unstubAllGlobals())

  const input = {
    kind: 'custom' as const,
    baseUrl: 'http://127.0.0.1:11434/v1/',
    model: 'test',
    messages: [] as LlmMessage[],
    temperature: 0.8,
    maxTokens: 100,
    thinking: false,
  }

  const sse = (...chunks: object[]): Response =>
    new Response(streamOf(...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'), {
      status: 200,
    })

  const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> =>
    JSON.parse((fetchMock.mock.calls[call]![1] as RequestInit).body as string)

  it('yields the text deltas and stops at [DONE]', async () => {
    const fetchMock = vi.fn(async () => {
      const lines = [
        'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: not json\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
      ]
      return new Response(streamOf(...lines), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await collect(streamChat(input))).toEqual([
      { type: 'text', delta: 'Hel' },
      { type: 'text', delta: 'lo' },
      { type: 'finish', reason: 'stop' },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('keeps reasoning apart from the reply, whatever the server calls the field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse(
          { choices: [{ delta: { reasoning_content: 'She is late.' } }] },
          { choices: [{ delta: { reasoning: ' So…' } }] },
          { choices: [{ delta: { content: 'Late again.' } }] },
          { choices: [{ delta: {}, finish_reason: 'length' }] },
        ),
      ),
    )

    expect(await collect(streamChat(input))).toEqual([
      { type: 'thinking', delta: 'She is late.' },
      { type: 'thinking', delta: ' So…' },
      { type: 'text', delta: 'Late again.' },
      { type: 'finish', reason: 'length' },
    ])
  })

  it('asks the model not to think, unless thinking is turned on', async () => {
    const fetchMock = vi.fn(async () => sse())
    vi.stubGlobal('fetch', fetchMock)

    await collect(streamChat(input))
    await collect(streamChat({ ...input, thinking: true }))

    expect(sentBody(fetchMock, 0)['reasoning_effort']).toBe('none')
    expect(sentBody(fetchMock, 1)).not.toHaveProperty('reasoning_effort')
  })

  it('asks again without the option when the server refuses it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"unknown field reasoning_effort"}', { status: 400 }))
      .mockResolvedValueOnce(sse({ choices: [{ delta: { content: 'Hi' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await collect(streamChat(input))).toEqual([{ type: 'text', delta: 'Hi' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentBody(fetchMock, 1)).not.toHaveProperty('reasoning_effort')
  })

  it("throws the server's own error message", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"model not found"}}', { status: 404 })),
    )
    await expect(collect(streamChat(input))).rejects.toThrow('model not found')
  })

  it('reports an error that arrives in the middle of a stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse(
          { choices: [{ delta: { content: 'Half a' } }] },
          { error: { code: 'server_error', message: 'Provider disconnected' }, choices: [{ delta: {}, finish_reason: 'error' }] },
        ),
      ),
    )
    await expect(collect(streamChat(input))).rejects.toThrow('Provider disconnected')
  })

  it('reads Mistral replies, where the content becomes a list while the model thinks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse(
          { choices: [{ delta: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'Hmm.' }] }] } }] },
          { choices: [{ delta: { content: [{ type: 'text', text: 'Late' }] } }] },
          { choices: [{ delta: { content: ' again.' } }] },
        ),
      ),
    )
    expect(await collect(streamChat(input))).toEqual([
      { type: 'thinking', delta: 'Hmm.' },
      { type: 'text', delta: 'Late' },
      { type: 'text', delta: ' again.' },
    ])
  })

  it("reads OpenRouter's detailed reasoning when there is no plain one", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse(
          { choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'She is' }, { type: 'reasoning.encrypted' }] } }] },
          { choices: [{ delta: { reasoning: ' late.', reasoning_details: [{ type: 'reasoning.text', text: ' late.' }] } }] },
        ),
      ),
    )
    expect(await collect(streamChat(input))).toEqual([
      { type: 'thinking', delta: 'She is' },
      { type: 'thinking', delta: ' late.' }, // Not counted twice.
    ])
  })
})

describe('online services', () => {
  afterEach(() => vi.unstubAllGlobals())

  const messages: LlmMessage[] = [
    { role: 'system', content: 'You are Elara.' },
    { role: 'assistant', content: 'You are late.' },
    { role: 'user', content: 'Sorry.' },
  ]
  const request = { kind: 'cloud' as const, apiKey: 'secret', model: 'm', messages, temperature: 1.2, maxTokens: 300, thinking: false }
  const cloud = (provider: ProviderTarget['provider'], baseUrl = 'https://example.test/v1') => ({ ...request, provider, baseUrl })

  const ok = (): Response => new Response(streamOf('data: [DONE]\n\n'), { status: 200 })
  const refuse = (body: object, status = 400): Response => new Response(JSON.stringify(body), { status })
  const sent = (fetchMock: ReturnType<typeof vi.fn>, call = 0): { headers: Record<string, string>; body: Record<string, unknown> } => {
    const init = fetchMock.mock.calls[call]![1] as RequestInit
    return { headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }
  }
  const stub = (...responses: Response[]): ReturnType<typeof vi.fn> => {
    const fetchMock = vi.fn()
    for (const response of responses) fetchMock.mockResolvedValueOnce(response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('sends the key as a bearer token, and none to a server without one', async () => {
    const fetchMock = stub(ok(), ok())
    await collect(streamChat(cloud('openai')))
    await collect(streamChat({ ...request, kind: 'custom', apiKey: undefined, baseUrl: 'http://127.0.0.1:1234/v1' }))

    expect(sent(fetchMock, 0).headers['Authorization']).toBe('Bearer secret')
    expect(sent(fetchMock, 1).headers).not.toHaveProperty('Authorization')
  })

  it('speaks to OpenAI with the newer name for the reply length', async () => {
    const fetchMock = stub(ok())
    await collect(streamChat(cloud('openai')))

    const { body } = sent(fetchMock)
    expect(body).toMatchObject({ max_completion_tokens: 300, reasoning_effort: 'none', temperature: 1.2 })
    expect(body).not.toHaveProperty('max_tokens')
    expect((body['messages'] as LlmMessage[]).map((message) => message.role)).toEqual(['system', 'assistant', 'user'])
  })

  it('speaks to Claude: thinking switched off, temperature capped, the user speaking first', async () => {
    const fetchMock = stub(ok())
    await collect(streamChat(cloud('anthropic')))

    const { body } = sent(fetchMock)
    expect(body).toMatchObject({ max_tokens: 300, temperature: 1, thinking: { type: 'disabled' } })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body['messages']).toEqual([
      messages[0],
      { role: 'user', content: '[The roleplay begins.]' },
      messages[1],
      messages[2],
    ])
  })

  it('does not add an opening cue when the user already speaks first', async () => {
    const fetchMock = stub(ok())
    await collect(streamChat({ ...cloud('mistral'), messages: [messages[0]!, messages[2]!] }))
    expect(sent(fetchMock).body['messages']).toEqual([messages[0], messages[2]])
  })

  it('speaks to OpenRouter with its own switch for reasoning, and names the app', async () => {
    const fetchMock = stub(ok(), ok())
    await collect(streamChat(cloud('openrouter')))
    await collect(streamChat({ ...cloud('openrouter'), thinking: true }))

    expect(sent(fetchMock, 0).body).toMatchObject({ reasoning: { enabled: false }, max_tokens: 300 })
    expect(sent(fetchMock, 0).headers['X-Title']).toBe('SillySimple')
    expect(sent(fetchMock, 1).body).not.toHaveProperty('reasoning')
  })

  it('sends the stop texts of a scene, and drops them for a model that does not take any', async () => {
    const fetchMock = stub(
      refuse({ error: { message: "Unsupported parameter: 'stop' is not supported with this model.", param: 'stop' } }),
      ok(),
    )
    await collect(streamChat({ ...cloud('openai'), stop: ['\nRen:', '\nQuill:'] }))

    expect(sent(fetchMock, 0).body['stop']).toEqual(['\nRen:', '\nQuill:'])
    expect(sent(fetchMock, 1).body).not.toHaveProperty('stop')
    expect(sent(fetchMock, 1).body).toHaveProperty('reasoning_effort') // Nothing else was touched.
  })

  it('renames the reply length when a server asks for the newer name', async () => {
    const fetchMock = stub(
      refuse({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", param: 'max_tokens' } }),
      ok(),
    )
    await collect(streamChat({ ...request, kind: 'custom', baseUrl: 'https://example.test/v1' }))

    expect(sent(fetchMock, 1).body).toMatchObject({ max_completion_tokens: 300, reasoning_effort: 'none' })
    expect(sent(fetchMock, 1).body).not.toHaveProperty('max_tokens')
  })

  it('adapts step by step to a model that takes neither a temperature nor "no thinking"', async () => {
    const fetchMock = stub(
      refuse({ error: { message: "Unsupported value: 'temperature' does not support 1.2 with this model.", param: 'temperature' } }),
      refuse({ error: { message: "Unsupported value: 'reasoning_effort' does not support 'none' with this model.", param: 'reasoning_effort' } }),
      ok(),
    )
    await collect(streamChat(cloud('openai')))

    const { body } = sent(fetchMock, 2)
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('reasoning_effort')
    // The model will think: it gets room for it on top of the reply.
    expect(body['max_completion_tokens']).toBe(2300)
  })

  it('gives Claude room to think when a model refuses to stop', async () => {
    const fetchMock = stub(
      refuse({ error: { message: '"thinking.type.disabled" is not supported for this model.' } }),
      ok(),
    )
    await collect(streamChat(cloud('anthropic')))

    expect(sent(fetchMock, 1).body).not.toHaveProperty('thinking')
    expect(sent(fetchMock, 1).body['max_tokens']).toBe(2300)
  })

  it('understands the way Mistral reports a field it does not accept', async () => {
    const fetchMock = stub(
      refuse({ detail: [{ type: 'extra_forbidden', loc: ['body', 'reasoning_effort'], msg: 'Extra inputs are not permitted' }] }, 422),
      ok(),
    )
    await collect(streamChat(cloud('mistral')))

    expect(sent(fetchMock, 1).body).not.toHaveProperty('reasoning_effort')
    // A model that does not know the option does not think: the reply length stays as set.
    expect(sent(fetchMock, 1).body['max_tokens']).toBe(300)
  })

  it('gives room to an OpenRouter model whose reasoning cannot be switched off', async () => {
    const fetchMock = stub(refuse({ error: { code: 400, message: 'Reasoning is mandatory for this endpoint and cannot be disabled.' } }), ok())
    await collect(streamChat(cloud('openrouter')))

    expect(sent(fetchMock, 1).body).not.toHaveProperty('reasoning')
    expect(sent(fetchMock, 1).body['max_tokens']).toBe(2300)
  })

  it('does not ask a local server for more room when it only ignores the thinking switch', async () => {
    const fetchMock = stub(refuse({ error: 'unknown field' }), ok())
    await collect(streamChat({ ...request, kind: 'custom', apiKey: undefined, baseUrl: 'http://127.0.0.1:1234/v1' }))
    expect(sent(fetchMock, 1).body['max_tokens']).toBe(300)
  })

  it('gives up, with the reason, when a refusal is about something else', async () => {
    const fetchMock = stub(
      refuse({ error: { message: 'thinking is not supported' } }),
      refuse({ error: { message: 'This model does not exist.' } }),
    )
    await expect(collect(streamChat(cloud('anthropic')))).rejects.toThrow('This model does not exist.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // --- lists of models ---

  const json = (body: object, status = 200): Response => new Response(JSON.stringify(body), { status })
  const target = (provider: ProviderTarget['provider']): ProviderTarget => ({ kind: 'cloud', provider, baseUrl: 'https://example.test/v1', apiKey: 'secret' })

  it('lists OpenRouter models that write text, after checking the key', async () => {
    const fetchMock = stub(
      json({ data: { label: 'key' } }),
      json({
        data: [
          { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', context_length: 1000000, architecture: { output_modalities: ['text'] } },
          { id: 'some/image-maker', name: 'Image', architecture: { output_modalities: ['image'] } },
          { id: 'old/model' },
        ],
      }),
    )

    expect(await listModels(target('openrouter'))).toEqual([
      { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', contextLength: 1000000 },
      { id: 'old/model' },
    ])
    expect(fetchMock.mock.calls[0]![0]).toBe('https://example.test/v1/key')
  })

  it("stops at a wrong OpenRouter key, although the list itself is public", async () => {
    const fetchMock = stub(json({ error: { code: 401, message: 'No auth credentials found' } }, 401))
    await expect(listModels(target('openrouter'))).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("lists Claude models with the headers of Claude's own API", async () => {
    const fetchMock = stub(json({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', max_input_tokens: 1000000 }], has_more: false }))

    expect(await listModels(target('anthropic'))).toEqual([
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', contextLength: 1000000 },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.test/v1/models?limit=1000')
    expect(init.headers).toEqual({ 'x-api-key': 'secret', 'anthropic-version': '2023-06-01' })
  })

  it('keeps only the chat models of OpenAI, newest first', async () => {
    stub(
      json({
        data: [
          { id: 'gpt-6-sol', created: 10 },
          { id: 'text-embedding-4-large', created: 30 },
          { id: 'gpt-6-luna', created: 20 },
          { id: 'gpt-image-2', created: 40 },
          { id: 'gpt-realtime', created: 50 },
        ],
      }),
    )
    expect(await listModels(target('openai'))).toEqual([{ id: 'gpt-6-luna' }, { id: 'gpt-6-sol' }])
  })

  it('keeps only the chat models of Mistral, once each', async () => {
    stub(
      json({
        data: [
          { id: 'mistral-small-latest', capabilities: { completion_chat: true }, max_context_length: 131072 },
          { id: 'mistral-small-latest', capabilities: { completion_chat: true }, max_context_length: 131072 },
          { id: 'mistral-embed', capabilities: { completion_chat: false } },
        ],
      }),
    )
    expect(await listModels(target('mistral'))).toEqual([{ id: 'mistral-small-latest', contextLength: 131072 }])
  })

  it('asks for a key before trying an online service', async () => {
    const fetchMock = stub()
    expect(await testConnection({ kind: 'cloud', provider: 'mistral', baseUrl: 'https://example.test/v1' })).toEqual({
      ok: false,
      error: 'Enter your Mistral API key first.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('urls', () => {
  it('joins without doubling slashes', () => {
    expect(joinUrl('http://localhost:1234/v1/', 'models')).toBe('http://localhost:1234/v1/models')
  })

  it('finds the Ollama host from the OpenAI-compatible URL', () => {
    expect(ollamaHost('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434')
    expect(ollamaHost('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434')
  })
})

describe('describeConnectionError', () => {
  const ollama = { kind: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: null } as const

  it('explains a refused connection in plain words', () => {
    const error = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    expect(describeConnectionError(error, ollama)).toMatch(/stopped answering/)
  })

  it('names the address for a custom server', () => {
    const error = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    const custom = { kind: 'custom', baseUrl: 'http://localhost:1234/v1', model: null } as const
    expect(describeConnectionError(error, custom)).toContain('http://localhost:1234/v1')
  })

  const openrouter = { kind: 'cloud', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k' } as const

  it('says so when an online service cannot be reached', () => {
    const error = new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })
    expect(describeConnectionError(error, openrouter)).toBe('OpenRouter could not be reached. Check your internet connection.')
  })

  it('explains a refused key, an empty account and a busy service', () => {
    expect(describeConnectionError(new HttpError(401, 'No auth credentials found'), openrouter)).toMatch(/refused the API key/)
    expect(describeConnectionError(new HttpError(402, 'Insufficient credits'), openrouter)).toMatch(/no credit left: Insufficient credits/)
    expect(describeConnectionError(new HttpError(429, 'You exceeded your current quota'), openrouter)).toMatch(/no credit left/)
    expect(describeConnectionError(new HttpError(429, 'Rate limit reached'), openrouter)).toMatch(/too many requests/)
    expect(describeConnectionError(new HttpError(404, 'No such model'), openrouter)).toBe('OpenRouter answered: No such model')
  })

  it('tells a server that wants a key from a key that is wrong', () => {
    const custom = { kind: 'custom', baseUrl: 'https://example.test/v1' } as const
    expect(describeConnectionError(new HttpError(401, 'Unauthorized'), custom)).toBe('The server asks for an API key.')
  })
})

describe('describeEmptyReply', () => {
  it('says the model ran out of room while thinking', () => {
    expect(describeEmptyReply({ sawThinking: true, finishReason: 'length' })).toMatch(/whole reply length thinking/)
  })

  it('suspects hidden thinking when the reply length ran out with nothing written', () => {
    expect(describeEmptyReply({ sawThinking: false, finishReason: 'length' })).toMatch(/If it is a thinking model/)
  })

  it('falls back to a plain message when nothing explains it', () => {
    expect(describeEmptyReply({ sawThinking: false, finishReason: 'stop' })).toBe('The model sent back an empty reply.')
  })
})

describe("OpenAI's context lengths, which its list does not give", () => {
  it('knows the families, and leaves the others to the size set by hand', () => {
    expect(openAiContextLength('gpt-5-mini')).toBe(400_000)
    expect(openAiContextLength('gpt-4.1-nano')).toBe(1_047_576)
    expect(openAiContextLength('gpt-4o-2024-08-06')).toBe(128_000)
    expect(openAiContextLength('o4-mini')).toBe(200_000)
    expect(openAiContextLength('gpt-4')).toBe(8192)
    expect(openAiContextLength('gpt-3.5-turbo-0125')).toBe(16_385)
    expect(openAiContextLength('davinci-002')).toBeNull()
  })
})
