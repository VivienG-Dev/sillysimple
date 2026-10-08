import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../providers/httpError'
import {
  checkVoiceService,
  describeVoiceError,
  ELEVENLABS_MODELS,
  fetchSample,
  missingPermission,
  OPENAI_VOICES,
  readVoiceError,
  synthesize,
  type VoiceTarget,
} from './engines'

type Route = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const sound = (bytes: number[], type = 'audio/mpeg'): Response => new Response(new Uint8Array(bytes), { headers: { 'content-type': type } })

/** A fake service: "METHOD /path" -> what it answers. Anything else is a 404. */
function server(routes: Record<string, Route | unknown>): { calls: { method: string; url: URL; init?: RequestInit }[] } {
  const calls: { method: string; url: URL; init?: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      const method = init?.method ?? 'GET'
      calls.push({ method, url, init })
      const route = routes[`${method} ${url.pathname}`]
      if (route === undefined) return json({ detail: { code: 'not_found', message: 'Not found' } }, 404)
      return typeof route === 'function' ? (route as Route)(init, url) : json(route)
    }),
  )
  return { calls }
}
afterEach(() => vi.unstubAllGlobals())

const eleven: VoiceTarget = { service: 'elevenlabs', baseUrl: 'https://api.elevenlabs.io', apiKey: 'sk_test', model: '' }
const local: VoiceTarget = { service: 'server', baseUrl: 'http://127.0.0.1:8880/v1/', model: 'kokoro' }
const header = (init: RequestInit | undefined, name: string): string | undefined => (init?.headers as Record<string, string> | undefined)?.[name]

describe('checking ElevenLabs', () => {
  const voices = {
    voices: [
      { voice_id: 'v2', name: 'Rachel', labels: { gender: 'female', age: 'young', accent: 'american', use_case: 'narrative_story' }, preview_url: 'https://storage.example/rachel.mp3' },
      { voice_id: 'v1', name: 'Adam', labels: {}, preview_url: null },
      { name: 'No id' },
    ],
    has_more: false,
  }

  it('asks for a key before anything else', async () => {
    const { calls } = server({})
    expect(await checkVoiceService({ ...eleven, apiKey: undefined })).toEqual({ ok: false, error: 'Enter your ElevenLabs API key first.' })
    expect(calls).toHaveLength(0)
  })

  it('returns the voices by name, the speech models and what is used', async () => {
    const { calls } = server({
      'GET /v2/voices': voices,
      'GET /v1/models': [
        { model_id: 'eleven_multilingual_v2', name: 'Multilingual v2', can_do_text_to_speech: true },
        { model_id: 'eleven_english_sts_v2', name: 'Speech to speech', can_do_text_to_speech: false },
      ],
      'GET /v1/user/subscription': { character_count: 1200, character_limit: 10000 },
    })
    const samples = new Map<string, string>()
    const status = await checkVoiceService(eleven, samples)

    expect(status).toEqual({
      ok: true,
      listed: true,
      voices: [
        { id: 'v1', name: 'Adam', description: undefined, hasSample: undefined },
        { id: 'v2', name: 'Rachel', description: 'female · young · american · narrative story', hasSample: true },
      ],
      models: [{ id: 'eleven_multilingual_v2', name: 'Multilingual v2' }],
      usage: { used: 1200, limit: 10000 },
    })
    // The address of a sample stays on this side: the page only learns that there is one.
    expect([...samples]).toEqual([['v2', 'https://storage.example/rachel.mp3']])
    expect(header(calls[0]!.init, 'xi-api-key')).toBe('sk_test')
    expect(header(calls[0]!.init, 'Authorization')).toBeUndefined()
    expect(calls[0]!.url.searchParams.get('page_size')).toBe('100')
  })

  it('reads every page of voices', async () => {
    const { calls } = server({
      'GET /v2/voices': (_init: RequestInit | undefined, url: URL) =>
        json(
          url.searchParams.get('next_page_token') === 'p2'
            ? { voices: [{ voice_id: 'b', name: 'Bea' }], has_more: false }
            : { voices: [{ voice_id: 'a', name: 'Ann' }], has_more: true, next_page_token: 'p2' },
        ),
    })
    const status = await checkVoiceService(eleven)
    expect(status.ok && status.voices.map((voice) => voice.name)).toEqual(['Ann', 'Bea'])
    expect(calls.filter((call) => call.url.pathname === '/v2/voices')).toHaveLength(2)
  })

  it('works with a key that may only read the voices', async () => {
    server({ 'GET /v2/voices': voices })
    const status = await checkVoiceService(eleven)
    // The models it cannot read are those the app knows of, the newest first: the choice is still offered.
    expect(status).toMatchObject({ ok: true, models: ELEVENLABS_MODELS, usage: undefined })
    expect(ELEVENLABS_MODELS.map((model) => model.id)).toEqual(['eleven_v4', 'eleven_v4_turbo', 'eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5'])
  })

  it('says so when the key is refused', async () => {
    server({ 'GET /v2/voices': () => json({ detail: { code: 'invalid_api_key', message: 'Invalid API key' } }, 401) })
    expect(await checkVoiceService(eleven)).toEqual({
      ok: false,
      error: 'ElevenLabs refused the API key. Check that it was copied whole: it is shown only once, when it is created.',
    })
  })

  it('tells a key that is right but may not list the voices from a wrong key', async () => {
    // What ElevenLabs answers to a key made with "Text to Speech" only, which is how most people make their first one.
    server({
      'GET /v2/voices': () =>
        json({ detail: { status: 'missing_permissions', message: 'The API key you used is missing the permission voices_read to execute this operation.' } }, 401),
    })
    expect(await checkVoiceService(eleven)).toEqual({
      ok: false,
      keyKnown: true,
      error:
        'ElevenLabs knows this key, but the key is not allowed to list your voices. In your ElevenLabs account (Developers, then API Keys), edit this key and turn on "Voices: Read" next to "Text to Speech", then try again.',
    })
  })
})

describe('checking a speech server', () => {
  it('uses the list of voices the server has, whatever its shape', async () => {
    server({ 'GET /v1/audio/voices': { voices: ['af_heart', 'am_adam', 'af_heart'] } })
    expect(await checkVoiceService(local)).toEqual({
      ok: true,
      listed: true,
      models: [],
      voices: [
        { id: 'af_heart', name: 'af_heart' },
        { id: 'am_adam', name: 'am_adam' },
      ],
    })

    server({ 'GET /v1/audio/voices': [{ id: 'x1', name: 'Xena' }, { voice_id: 'y2' }, { name: 'Zed' }] })
    const status = await checkVoiceService(local)
    expect(status.ok && status.voices).toEqual([
      { id: 'x1', name: 'Xena' },
      { id: 'y2', name: 'y2' },
      { id: 'Zed', name: 'Zed' },
    ])
  })

  it('offers OpenAI’s own voices at OpenAI’s address, which has no list', async () => {
    const { calls } = server({ 'GET /v1/models': { data: [] } })
    const status = await checkVoiceService({ service: 'server', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x', model: 'gpt-4o-mini-tts' })
    expect(status.ok && status.listed).toBe(true)
    expect(status.ok && status.voices.map((voice) => voice.id)).toEqual(OPENAI_VOICES)
    expect(status.ok && status.voices[0]).toEqual({ id: 'alloy', name: 'Alloy' })
    expect(header(calls[0]!.init, 'Authorization')).toBe('Bearer sk-x')
    expect(header(calls[0]!.init, 'xi-api-key')).toBeUndefined()
  })

  it('lets the user type a voice when another server has no list', async () => {
    server({ 'GET /v1/models': { data: [] } })
    expect(await checkVoiceService(local)).toEqual({ ok: true, voices: [], listed: false, models: [] })
    // Not even a list of models: the server answered all the same, so the address is right.
    server({})
    expect(await checkVoiceService(local)).toEqual({ ok: true, voices: [], listed: false, models: [] })
  })

  it('says so when the key is refused, the address is wrong or nothing answers', async () => {
    server({ 'GET /v1/audio/voices': () => json({ error: { message: 'Incorrect API key' } }, 401) })
    expect(await checkVoiceService(local)).toEqual({ ok: false, error: 'The speech server asks for an API key.' })

    server({})
    expect(await checkVoiceService({ ...local, baseUrl: 'not an address' })).toMatchObject({ ok: false, error: expect.stringContaining('not a valid URL') })

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) }))))
    expect(await checkVoiceService(local)).toEqual({
      ok: false,
      error: 'Nothing answered at http://127.0.0.1:8880/v1/. Check the address and that the server is started.',
    })
  })
})

describe('speaking', () => {
  it('asks ElevenLabs for the voice in the address, with the key and no model unless one is chosen', async () => {
    const { calls } = server({ 'POST /v1/text-to-speech/voice%201': () => sound([1, 2, 3]) })
    const spoken = await synthesize(eleven, { text: 'You are late.', voiceId: 'voice 1' })

    expect(spoken).toEqual({ audio: new Uint8Array([1, 2, 3]), mime: 'audio/mpeg' })
    expect(calls[0]!.url.searchParams.get('output_format')).toBe('mp3_44100_128')
    expect(header(calls[0]!.init, 'xi-api-key')).toBe('sk_test')
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ text: 'You are late.' })

    await synthesize({ ...eleven, model: 'eleven_flash_v2_5' }, { text: 'Hi.', voiceId: 'voice 1' })
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({ text: 'Hi.', model_id: 'eleven_flash_v2_5' })
  })

  it('asks a speech server the way OpenAI is asked', async () => {
    const { calls } = server({ 'POST /v1/audio/speech': () => sound([9, 9], 'audio/wav; charset=binary') })
    const spoken = await synthesize({ ...local, apiKey: 'k' }, { text: 'Hello.', voiceId: 'af_heart' })

    expect(spoken).toEqual({ audio: new Uint8Array([9, 9]), mime: 'audio/wav' })
    expect(calls[0]!.url.href).toBe('http://127.0.0.1:8880/v1/audio/speech')
    expect(header(calls[0]!.init, 'Authorization')).toBe('Bearer k')
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ model: 'kokoro', input: 'Hello.', voice: 'af_heart', response_format: 'mp3' })
  })

  it('fails with the service’s own explanation, and on an empty sound', async () => {
    server({ 'POST /v1/text-to-speech/gone': () => json({ detail: { code: 'voice_not_found', message: 'The specified voice ID does not exist.' } }, 404) })
    const failure = await synthesize(eleven, { text: 'Hi.', voiceId: 'gone' }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HttpError)
    expect(describeVoiceError(failure, eleven)).toBe('This voice is no longer on your ElevenLabs account. Pick another one.')

    server({ 'POST /v1/audio/speech': () => sound([]) })
    await expect(synthesize(local, { text: 'Hi.', voiceId: 'x' })).rejects.toThrow('sent back no sound')
  })

  it('only fetches a sample from a secure address', async () => {
    server({ 'GET /rachel.mp3': () => sound([7]) })
    expect(await fetchSample('https://storage.example/rachel.mp3')).toEqual({ audio: new Uint8Array([7]), mime: 'audio/mpeg' })
    await expect(fetchSample('http://storage.example/rachel.mp3')).rejects.toThrow('no sample')
    await expect(fetchSample('file:///etc/passwd')).rejects.toThrow('no sample')
  })
})

describe('what went wrong, in plain words', () => {
  const failure = async (status: number, body: unknown): Promise<HttpError> => readVoiceError(json(body, status))

  it('reads the explanation of each service', async () => {
    expect(await failure(400, { detail: { code: 'text_too_long', message: 'Too long' } })).toMatchObject({ status: 400, message: 'Too long', param: 'text_too_long' })
    expect(await failure(401, { detail: { status: 'quota_exceeded', message: 'Quota' } })).toMatchObject({ param: 'quota_exceeded' })
    expect(await failure(422, { detail: 'Plain words' })).toMatchObject({ message: 'Plain words' })
    expect(await failure(400, { error: { message: 'Bad voice', code: 'invalid_value' } })).toMatchObject({ message: 'Bad voice', param: 'invalid_value' })
    expect((await readVoiceError(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))).message).toBe('The server answered 502 Bad Gateway')
  })

  it('tells an account without characters left, under whatever status it comes', async () => {
    const empty = 'Your ElevenLabs account has no characters left for this month. Replies are no longer read until it has some again.'
    expect(describeVoiceError(await failure(401, { detail: { status: 'quota_exceeded', message: 'You have 0 credits remaining' } }), eleven)).toBe(empty)
    expect(describeVoiceError(await failure(402, { detail: { code: 'insufficient_credits', message: 'Not enough' } }), eleven)).toBe(empty)
    expect(describeVoiceError(await failure(402, { error: { message: 'Billing hard limit reached' } }), local)).toBe(
      'The speech server says this account has no credit left: Billing hard limit reached',
    )
  })

  it('tells what a restricted key lacks', async () => {
    const lacks = (permission: string, status = 401): Promise<HttpError> =>
      failure(status, { detail: { status: 'missing_permissions', message: `The API key you used is missing the permission ${permission} to execute this operation.` } })

    expect(missingPermission(await lacks('voices_read'))).toBe('voices_read')
    expect(describeVoiceError(await lacks('text_to_speech'), eleven)).toBe(
      'ElevenLabs knows this key, but the key is not allowed to speak. In your ElevenLabs account (Developers, then API Keys), edit this key and turn on "Text to Speech", then try again.',
    )
    expect(describeVoiceError(await lacks('user_read'), eleven)).toContain('(it lacks "user read")')
    // Under the newer shape of errors, without the permission being named.
    const unnamed = await failure(403, { detail: { code: 'insufficient_permissions', message: 'You do not have the required permissions for this action.' } })
    expect(missingPermission(unnamed)).toBe('')
    expect(describeVoiceError(unnamed, eleven)).toBe(
      'ElevenLabs knows this key, but the key is not allowed to do this. In your ElevenLabs account (Developers, then API Keys), edit this key and give it access to Text to Speech and to Voices (Read), then try again.',
    )
    expect(missingPermission(await failure(401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } }))).toBeNull()
    expect(missingPermission(await failure(404, { detail: { code: 'voice_not_found', message: 'missing the permission x' } }))).toBeNull()
    expect(missingPermission(new Error('missing the permission voices_read'))).toBeNull()
  })

  it('tells a speech model the plan does not have', async () => {
    const denied = await failure(403, { detail: { code: 'model_access_denied', message: 'You do not have access to this model.' } })
    expect(describeVoiceError(denied, eleven)).toBe(
      'ElevenLabs cannot use the speech model chosen, or your plan does not include it: You do not have access to this model. Pick another one in Settings › Voice.',
    )
    expect(describeVoiceError(await failure(400, { detail: { code: 'unsupported_model', message: 'Nope.' } }), eleven)).toContain('Pick another one in Settings › Voice.')
    expect(describeVoiceError(await failure(400, { error: { message: 'The model `tts-9` does not exist or you do not have access to it.' } }), local)).toContain('Pick another one')
    // A voice that is gone is not a model that is gone.
    expect(describeVoiceError(await failure(404, { detail: { code: 'voice_not_found', message: 'The specified voice ID does not exist.' } }), eleven)).toContain('This voice is no longer')
  })

  it('gives the service’s own reason when a key is refused for something else', async () => {
    const unusual = await failure(401, { detail: { status: 'detected_unusual_activity', message: 'Unusual activity detected. Free Tier usage disabled.' } })
    expect(describeVoiceError(unusual, eleven)).toBe('ElevenLabs refused the request: Unusual activity detected. Free Tier usage disabled.')
    expect(describeVoiceError(await failure(401, { error: { message: 'Incorrect API key provided: sk-x***.' } }), { ...local, apiKey: 'sk-x' })).toBe(
      'The speech server refused the API key. Check that it was copied whole: it is shown only once, when it is created.',
    )
    expect(describeVoiceError(await failure(401, {}), eleven)).toBe('ElevenLabs refused the API key. Check that it was copied whole: it is shown only once, when it is created.')
  })

  it('tells a plan that does not include a voice, a wrong address, and a busy service', async () => {
    expect(describeVoiceError(await failure(403, { detail: { code: 'voice_access_denied', message: 'You do not have access to this voice.' } }), eleven)).toBe(
      'ElevenLabs does not allow this with your key or your plan: You do not have access to this voice.',
    )
    expect(describeVoiceError(await failure(404, { error: 'Not Found' }), local)).toBe(
      'This server has no speech at http://127.0.0.1:8880/v1/. Check the address (it usually ends in /v1) and the name of the model.',
    )
    expect(describeVoiceError(await failure(429, { detail: { code: 'system_busy', message: 'Busy' } }), eleven)).toBe(
      'ElevenLabs is receiving too many requests right now. Wait a moment, then try again.',
    )
    expect(describeVoiceError(await failure(400, { detail: { code: 'text_too_long', message: 'Too long' } }), eleven)).toBe('ElevenLabs answered: Too long')
    expect(describeVoiceError(Object.assign(new Error('slow'), { name: 'TimeoutError' }), eleven)).toBe('No answer from ElevenLabs in time.')
  })
})
