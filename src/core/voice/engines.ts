import { ELEVENLABS } from '@shared/providers'
import type { VoiceInfo, VoiceService, VoiceStatus } from '@shared/types'
import { HttpError } from '../providers/httpError'

// The services that turn text into speech. Two families:
//
// - ElevenLabs, with its own API (voices, models, usage, speech).
// - "A speech server": anything that takes OpenAI's speech request (POST /audio/speech).
//   That is OpenAI itself, and most servers one can run on one's own computer.
//
// What is written here comes from the documentation of both, read in October 2026.
// Neither was tried with a real key: when a service starts refusing requests, look here.

/** A voice service to talk to, with everything needed to reach it. */
export interface VoiceTarget {
  service: VoiceService
  /** ElevenLabs: its own address. A speech server: the address the user typed, ending in /v1 as a rule. */
  baseUrl: string
  apiKey?: string
  /** The speech model. Empty: the service's own default (ElevenLabs only). */
  model: string
}

/** The voices OpenAI offers, for when the address is OpenAI's: it has no list to ask for. */
export const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']

/**
 * ElevenLabs' speech models, for a key that may not read the list of them (its
 * "Models" permission is off). From its documentation, October 2026; the list the
 * service gives is used whenever it can be read.
 */
export const ELEVENLABS_MODELS = [
  { id: 'eleven_v4', name: 'Eleven v4 · the most expressive' },
  { id: 'eleven_v4_turbo', name: 'Eleven v4 Turbo · expressive and fast' },
  { id: 'eleven_v3', name: 'Eleven v3' },
  { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2' },
  { id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5 · the fastest and cheapest' },
]

/** A local server answers at once; a service on the internet gets more time. */
const CHECK_TIMEOUT_MS = 15000
/** How long a piece of speech may take to come back. */
export const SPEAK_TIMEOUT_MS = 60000
/** ElevenLabs gives its voices by pages of this size at most. A handful of pages holds any personal library. */
const VOICES_PER_PAGE = 100
const MAX_VOICE_PAGES = 5

export function voiceServiceName(target: Pick<VoiceTarget, 'service'>): string {
  return target.service === 'elevenlabs' ? ELEVENLABS.name : 'the speech server'
}

function headers(target: VoiceTarget, json = false): Record<string, string> {
  const result: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {}
  if (target.apiKey) {
    if (target.service === 'elevenlabs') result['xi-api-key'] = target.apiKey
    else result['Authorization'] = `Bearer ${target.apiKey}`
  }
  return result
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '')

// --- Checking a service: its voices, its models, what is left to use ---------------

/**
 * Checks that the service answers, and returns what it offers. `samples` receives the
 * address of each voice's sample, kept by the caller: the page never sees it.
 */
export async function checkVoiceService(target: VoiceTarget, samples?: Map<string, string>): Promise<VoiceStatus> {
  if (target.service === 'elevenlabs' && !target.apiKey) return { ok: false, error: 'Enter your ElevenLabs API key first.' }

  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS)
  try {
    return target.service === 'elevenlabs' ? await checkElevenLabs(target, signal, samples) : await checkSpeechServer(target, signal)
  } catch (error) {
    return { ok: false, error: describeVoiceError(error, target), ...(missingPermission(error) !== null && { keyKnown: true }) }
  }
}

async function checkElevenLabs(target: VoiceTarget, signal: AbortSignal, samples?: Map<string, string>): Promise<VoiceStatus> {
  const voices: VoiceInfo[] = []
  let page = ''
  for (let count = 0; count < MAX_VOICE_PAGES; count++) {
    const url = `${trimSlash(target.baseUrl)}/v2/voices?page_size=${VOICES_PER_PAGE}&include_total_count=false${page && `&next_page_token=${encodeURIComponent(page)}`}`
    const body = await getJson(url, target, signal)
    for (const item of list(body['voices'])) {
      const id = text(item['voice_id'])
      if (!id) continue
      const sample = text(item['preview_url'])
      if (sample && samples) samples.set(id, sample)
      voices.push({ id, name: text(item['name']) || id, description: describeVoice(item) || undefined, hasSample: Boolean(sample) || undefined })
    }
    page = body['has_more'] === true ? text(body['next_page_token']) : ''
    if (!page) break
  }
  voices.sort((a, b) => a.name.localeCompare(b.name))

  // The rest is a comfort: a key that may speak but not read these still works.
  const [models, usage] = await Promise.all([
    getJson(`${trimSlash(target.baseUrl)}/v1/models`, target, signal).then(
      (body) =>
        list(body)
          .filter((model) => model['can_do_text_to_speech'] !== false && text(model['model_id']))
          .map((model) => ({ id: text(model['model_id']), name: text(model['name']) || text(model['model_id']) })),
      () => ELEVENLABS_MODELS,
    ),
    getJson(`${trimSlash(target.baseUrl)}/v1/user/subscription`, target, signal).then(
      (body) => {
        const used = Number(body['character_count'])
        const limit = Number(body['character_limit'])
        return Number.isFinite(used) && Number.isFinite(limit) && limit > 0 ? { used, limit } : undefined
      },
      () => undefined,
    ),
  ])
  return { ok: true, voices, listed: true, models, usage }
}

/** "female · young · American": what ElevenLabs says of a voice in its labels. */
function describeVoice(voice: Record<string, unknown>): string {
  const labels = isRecord(voice['labels']) ? voice['labels'] : {}
  const parts = ['gender', 'age', 'accent', 'descriptive', 'use_case'].map((key) => text(labels[key]).replace(/_/g, ' ')).filter(Boolean)
  return [...new Set(parts)].join(' · ')
}

async function checkSpeechServer(target: VoiceTarget, signal: AbortSignal): Promise<VoiceStatus> {
  const base = trimSlash(target.baseUrl)
  new URL(base) // An address that is not one fails here, with a message of its own.

  // Many servers one runs at home list their voices at /audio/voices. OpenAI does not.
  const listed = await getJson(`${base}/audio/voices`, target, signal).then(readVoiceList, (error: unknown) => {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) throw error
    if (!(error instanceof HttpError)) throw error // Nothing answered at all.
    return null
  })
  if (listed?.length) return { ok: true, voices: listed, listed: true, models: [] }

  // No list: the address is still worth checking, with the one request every such server answers.
  await getJson(`${base}/models`, target, signal).catch((error: unknown) => {
    if (error instanceof HttpError && error.status !== 401 && error.status !== 403) return null
    throw error
  })
  const openai = /(^|\.)openai\.com$/.test(new URL(base).hostname)
  return { ok: true, voices: openai ? OPENAI_VOICES.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })) : [], listed: openai, models: [] }
}

/** The list of voices of a speech server, whatever shape it comes in: names, or objects with an id or a name. */
function readVoiceList(body: unknown): VoiceInfo[] {
  const items = Array.isArray(body) ? body : isRecord(body) ? (Array.isArray(body['voices']) ? body['voices'] : Array.isArray(body['data']) ? body['data'] : []) : []
  const voices: VoiceInfo[] = []
  for (const item of items as unknown[]) {
    const id = typeof item === 'string' ? item : isRecord(item) ? text(item['id']) || text(item['voice_id']) || text(item['name']) : ''
    if (!id || voices.some((voice) => voice.id === id)) continue
    voices.push({ id, name: (isRecord(item) && text(item['name'])) || id })
  }
  return voices
}

// --- Speaking ------------------------------------------------------------------------

/** Has `text` spoken by the voice `voiceId`. Returns the sound, and what kind of file it is. */
export async function synthesize(
  target: VoiceTarget,
  request: { text: string; voiceId: string },
  signal?: AbortSignal,
): Promise<{ audio: Uint8Array; mime: string }> {
  const base = trimSlash(target.baseUrl)
  const response =
    target.service === 'elevenlabs'
      ? await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(request.voiceId)}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: headers(target, true),
          body: JSON.stringify({ text: request.text, ...(target.model && { model_id: target.model }) }),
          signal,
        })
      : await fetch(`${base}/audio/speech`, {
          method: 'POST',
          headers: headers(target, true),
          body: JSON.stringify({ model: target.model, input: request.text, voice: request.voiceId, response_format: 'mp3' }),
          signal,
        })
  if (!response.ok) throw await readVoiceError(response)

  const audio = new Uint8Array(await response.arrayBuffer())
  if (audio.length === 0) throw new Error('The voice service sent back no sound.')
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  return { audio, mime: type.startsWith('audio/') ? type : 'audio/mpeg' }
}

/** Fetches the sample of a voice, from the address the service gave for it. */
export async function fetchSample(url: string, signal?: AbortSignal): Promise<{ audio: Uint8Array; mime: string }> {
  if (!/^https:\/\//.test(url)) throw new Error('This voice has no sample to play.')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('The sample of this voice could not be loaded.')
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  return { audio: new Uint8Array(await response.arrayBuffer()), mime: type.startsWith('audio/') ? type : 'audio/mpeg' }
}

// --- Errors --------------------------------------------------------------------------

async function getJson(url: string, target: VoiceTarget, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: headers(target), signal })
  if (!response.ok) throw await readVoiceError(response)
  const body: unknown = await response.json().catch(() => null)
  // A list is handed back as it is: callers that expect one read it with list().
  return (Array.isArray(body) ? body : isRecord(body) ? body : {}) as Record<string, unknown>
}

/**
 * Reads the explanation out of an error response. Its `param` is the service's own code
 * for the error, when it gives one.
 *   ElevenLabs   { "detail": { "code": "voice_not_found", "status": "…", "message": "…" } }  or  { "detail": "…" }
 *   OpenAI       { "error": { "message": "…", "code": "…" } }
 */
export async function readVoiceError(response: Response): Promise<HttpError> {
  const fallback = `The server answered ${response.status} ${response.statusText}`.trim()
  const body: unknown = await response
    .text()
    .then((raw) => JSON.parse(raw) as unknown)
    .catch(() => null)
  if (!isRecord(body)) return new HttpError(response.status, fallback)

  const detail = body['detail']
  if (typeof detail === 'string' && detail) return new HttpError(response.status, detail)
  if (isRecord(detail)) {
    return new HttpError(response.status, text(detail['message']) || fallback, text(detail['code']) || text(detail['status']) || undefined)
  }
  const error = body['error']
  if (typeof error === 'string' && error) return new HttpError(response.status, error)
  if (isRecord(error)) return new HttpError(response.status, text(error['message']) || fallback, text(error['code']) || undefined)
  return new HttpError(response.status, text(body['message']) || fallback)
}

/** Turns an error from a voice service into a sentence a non-technical user can act on. */
export function describeVoiceError(error: unknown, target: VoiceTarget): string {
  const name = voiceServiceName(target)
  const Name = name.charAt(0).toUpperCase() + name.slice(1)
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined
  const code = typeof cause?.code === 'string' ? cause.code : ''

  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH'].includes(code)) {
    return target.service === 'elevenlabs'
      ? 'ElevenLabs could not be reached. Check your internet connection.'
      : `Nothing answered at ${target.baseUrl}. Check the address and that the server is started.`
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return `No answer from ${name} in time.`
  if (error instanceof TypeError && /invalid url/i.test(`${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`)) {
    return 'That address is not a valid URL. It should look like https://api.openai.com/v1 or http://127.0.0.1:8880/v1'
  }
  if (!(error instanceof HttpError)) return error instanceof Error ? error.message : String(error)

  const what = `${error.param ?? ''} ${error.message}`

  // A key that is known but may not do this. ElevenLabs' keys are restricted when they are
  // created: this is the first thing most people meet, and it is not a wrong key.
  const permission = missingPermission(error)
  if (permission !== null && target.service === 'elevenlabs') {
    const where = 'In your ElevenLabs account (Developers, then API Keys), edit this key'
    if (permission === 'voices_read') {
      return `ElevenLabs knows this key, but the key is not allowed to list your voices. ${where} and turn on "Voices: Read" next to "Text to Speech", then try again.`
    }
    if (permission === 'text_to_speech') {
      return `ElevenLabs knows this key, but the key is not allowed to speak. ${where} and turn on "Text to Speech", then try again.`
    }
    return `ElevenLabs knows this key, but the key is not allowed to do this${permission ? ` (it lacks "${permission.replace(/_/g, ' ')}")` : ''}. ${where} and give it access to Text to Speech and to Voices (Read), then try again.`
  }
  // ElevenLabs has answered "no characters left" under several statuses over time: the words decide.
  if (error.status === 402 || /quota|insufficient_credits|credits? (left|remaining)|payment_required|billing|balance/i.test(what)) {
    return target.service === 'elevenlabs'
      ? 'Your ElevenLabs account has no characters left for this month. Replies are no longer read until it has some again.'
      : `${Name} says this account has no credit left: ${error.message}`
  }
  if (error.status === 401) {
    if (!target.apiKey) return `${Name} asks for an API key.`
    // "Invalid API key" needs no more words. Any other reason is the service's to give: it is said as it came.
    const plain = /invalid[ _]api[ _]key|incorrect api key|unauthorized|authentication/i.test(what) || error.message.startsWith('The server answered')
    return plain ? `${Name} refused the API key. Check that it was copied whole: it is shown only once, when it is created.` : `${Name} refused the request: ${error.message}`
  }
  if (/voice_not_found|invalid_voice_id/.test(what) || (error.status === 404 && target.service === 'elevenlabs' && /voice/i.test(what))) {
    return 'This voice is no longer on your ElevenLabs account. Pick another one.'
  }
  // The speech model: not part of the plan, or not a model the service has (any more).
  if (/model_access_denied|unsupported_model|model_not_found|invalid_model/.test(what) || (error.status !== 404 && /\bmodel\b.*(not (found|available|supported|exist)|access)/i.test(error.message))) {
    return `${Name} cannot use the speech model chosen, or your plan does not include it: ${error.message} Pick another one in Settings › Voice.`
  }
  if (error.status === 403) return `${Name} does not allow this with your key or your plan: ${error.message}`
  if (error.status === 404 && target.service === 'server') {
    return `This server has no speech at ${target.baseUrl}. Check the address (it usually ends in /v1) and the name of the model.`
  }
  if (error.status === 429) return `${Name} is receiving too many requests right now. Wait a moment, then try again.`
  return `${Name} answered: ${error.message}`
}

/**
 * The permission a key lacks, when that is why a request was refused: "voices_read",
 * "text_to_speech"… Empty when the service does not name it. Null when the refusal is
 * about something else.
 */
export function missingPermission(error: unknown): string | null {
  if (!(error instanceof HttpError) || (error.status !== 401 && error.status !== 403)) return null
  const named = /missing the permission[s]? ([a-z_]+)/i.exec(error.message)
  if (named) return named[1]!.toLowerCase()
  return /missing_permissions|insufficient_permissions/.test(error.param ?? '') ? '' : null
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : [])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
