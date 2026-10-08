import { cloudProvider } from '@shared/providers'
import type { CloudProviderId, ConnectionKind, ModelInfo } from '@shared/types'
import type { LlmMessage } from '../prompt/buildMessages'
import { THINKING_TOKEN_ALLOWANCE } from '../prompt/context'
import { HttpError, readHttpError } from './httpError'

// Every server the app talks to accepts the OpenAI chat format, but each has its
// habits: another name for an option, another way to switch thinking off, another
// shape for its list of models. This file holds those differences, so that the
// client in openaiCompatible.ts stays one plain request.
//
// The rules for the online services come from their documentation (October 2026).
// They change often: when a service starts refusing requests, look here first.

/** A server to talk to, with everything needed to reach it. */
export interface ProviderTarget {
  kind: ConnectionKind
  /** Which online service, when kind is `cloud`. */
  provider?: CloudProviderId
  baseUrl: string
  apiKey?: string
}

/** "Ollama", "OpenRouter", or "the server" for an address the user typed. */
export function serviceName(target: Pick<ProviderTarget, 'kind' | 'provider'>): string {
  if (target.kind === 'ollama') return 'Ollama'
  return (target.kind === 'cloud' && cloudProvider(target.provider)?.name) || 'the server'
}

// --- Chat requests ----------------------------------------------------------------

export function chatHeaders(target: ProviderTarget): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (target.apiKey) headers['Authorization'] = `Bearer ${target.apiKey}`
  // OpenRouter shows this name next to the requests in the user's account.
  if (target.provider === 'openrouter') headers['X-Title'] = 'SillySimple'
  return headers
}

export interface ChatRequest {
  provider?: CloudProviderId
  model: string
  messages: LlmMessage[]
  temperature: number
  maxTokens: number
  /** false asks the model to answer directly, without a reasoning phase first. */
  thinking: boolean
  /** Texts at which the model must stop writing (in a scene: the start of someone else's line). */
  stop?: string[]
}

export function buildChatBody(request: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: shapeMessages(request.messages, request.provider),
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    stream: true,
  }
  if (request.stop?.length) body['stop'] = request.stop

  switch (request.provider) {
    case 'openai':
      // OpenAI's newer models only know the newer name of this option.
      renameKey(body, 'max_tokens', 'max_completion_tokens')
      if (!request.thinking) body['reasoning_effort'] = 'none'
      break
    case 'anthropic':
      // Claude's scale stops at 1.
      body['temperature'] = Math.min(request.temperature, 1)
      if (!request.thinking) body['thinking'] = { type: 'disabled' }
      break
    case 'openrouter':
      if (!request.thinking) body['reasoning'] = { enabled: false }
      break
    default:
      // Local servers and Mistral. Thinking models (Gemma, Qwen, DeepSeek…) reason before
      // they answer, and that reasoning counts against max_tokens: this turns it off.
      if (!request.thinking) body['reasoning_effort'] = 'none'
  }
  return body
}

/** The options that switch thinking off, under the names the different servers use. */
const THINKING_SWITCHES = ['reasoning_effort', 'reasoning', 'thinking']

/**
 * Called when a server refuses a request (HTTP 400 or 422). Servers and models do not
 * all accept the same options, and say so only when asked. This reads the refusal,
 * removes or renames the option it complains about, and returns true if the request
 * is worth sending again.
 */
export function adaptAfterRefusal(body: Record<string, unknown>, refusal: HttpError, provider?: CloudProviderId): boolean {
  const about = `${refusal.param ?? ''} ${refusal.message}`.toLowerCase()

  if ('max_tokens' in body && about.includes('max_completion_tokens')) {
    renameKey(body, 'max_tokens', 'max_completion_tokens')
    return true
  }

  // Some online models do not take stop texts. They are a safety net, not a need.
  if ('stop' in body && (refusal.param === 'stop' || /\bstop\b/.test(about))) {
    delete body['stop']
    return true
  }

  // Some models only work at their own temperature.
  if ('temperature' in body && about.includes('temperature')) {
    delete body['temperature']
    return true
  }

  // Anything else: the usual cause is the option that switches thinking off, which
  // old servers do not know and which some models do not allow.
  const switches = THINKING_SWITCHES.filter((key) => key in body)
  if (switches.length === 0) return false
  for (const key of switches) delete body[key]

  // Two different refusals end up here. "I do not know this option" comes from a model
  // that does not think: nothing more to do. "Thinking cannot be turned off" comes from
  // one that always thinks: it needs the room, or it spends the whole reply length on
  // its thoughts and writes nothing. Claude only ever refuses for the second reason.
  const mustThink = provider === 'anthropic' || /\bnone\b|disabled|mandatory|cannot be turned off/.test(about)
  if (provider && mustThink) {
    const key = 'max_completion_tokens' in body ? 'max_completion_tokens' : 'max_tokens'
    const allowed = body[key]
    if (typeof allowed === 'number') body[key] = allowed + THINKING_TOKEN_ALLOWANCE
  }
  return true
}

/** Placed before the character's greeting for services that want the user to speak first. */
const OPENING_CUE = '[The roleplay begins.]'

/**
 * Claude and Mistral expect a conversation to open with the user. A chat here
 * opens with the character's greeting, so a short cue is placed in front of it.
 */
function shapeMessages(messages: LlmMessage[], provider?: CloudProviderId): LlmMessage[] {
  if (provider !== 'anthropic' && provider !== 'mistral') return messages

  const first = messages.findIndex((message) => message.role !== 'system')
  if (first === -1 || messages[first]!.role === 'user') return messages
  return [...messages.slice(0, first), { role: 'user', content: OPENING_CUE }, ...messages.slice(first)]
}

function renameKey(body: Record<string, unknown>, from: string, to: string): void {
  if (!(from in body)) return
  body[to] = body[from]
  delete body[from]
}

// --- Lists of models ----------------------------------------------------------------

type Json = Record<string, unknown>

/** The models a server offers. Each online service describes them in its own way. */
export async function listModels(target: ProviderTarget, signal?: AbortSignal): Promise<ModelInfo[]> {
  const get = async (path: string, headers = bearer(target)): Promise<Json[]> => {
    const response = await fetch(joinUrl(target.baseUrl, path), { headers, signal })
    if (!response.ok) throw await readHttpError(response)
    const payload = (await response.json()) as { data?: unknown }
    return Array.isArray(payload.data) ? payload.data.filter(isRecord) : []
  }

  switch (target.provider) {
    case 'openrouter': {
      // The list is public: it comes back even with a wrong key. So the key is checked apart.
      const check = await fetch(joinUrl(target.baseUrl, 'key'), { headers: bearer(target), signal })
      if (!check.ok) throw await readHttpError(check)

      return (await get('models'))
        .filter((model) => {
          const outputs = isRecord(model['architecture']) ? model['architecture']['output_modalities'] : undefined
          return !Array.isArray(outputs) || outputs.includes('text')
        })
        .map((model) => modelInfo(model['id'], model['name'], model['context_length']))
        .filter(isModel)
    }

    case 'anthropic': {
      // The list of models is part of Claude's own API, which names its headers differently.
      const headers = { 'x-api-key': target.apiKey ?? '', 'anthropic-version': '2023-06-01' }
      return (await get('models?limit=1000', headers))
        .map((model) => modelInfo(model['id'], model['display_name'], model['max_input_tokens']))
        .filter(isModel)
    }

    case 'openai':
      // The list mixes chat models with image, speech and embedding models: keep the first kind.
      return (await get('models'))
        .filter((model) => typeof model['id'] === 'string' && !NOT_CHAT.test(model['id']))
        .sort((a, b) => Number(b['created'] ?? 0) - Number(a['created'] ?? 0))
        .map((model) => modelInfo(model['id']))
        .filter(isModel)

    case 'mistral': {
      const seen = new Set<unknown>()
      return (await get('models'))
        .filter((model) => {
          const capabilities = isRecord(model['capabilities']) ? model['capabilities'] : {}
          if (capabilities['completion_chat'] === false || seen.has(model['id'])) return false
          seen.add(model['id'])
          return true
        })
        .map((model) => modelInfo(model['id'], undefined, model['max_context_length']))
        .filter(isModel)
    }

    default:
      return (await get('models')).map((model) => modelInfo(model['id'])).filter(isModel)
  }
}

const NOT_CHAT = /embedding|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|sora|babbage|davinci|instruct/i

function bearer(target: ProviderTarget): Record<string, string> {
  return target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}
}

function modelInfo(id: unknown, name?: unknown, contextLength?: unknown): ModelInfo | null {
  if (typeof id !== 'string' || !id) return null
  const model: ModelInfo = { id }
  if (typeof name === 'string' && name && name !== id) model.name = name
  if (typeof contextLength === 'number' && contextLength > 0) model.contextLength = contextLength
  return model
}

function isModel(model: ModelInfo | null): model is ModelInfo {
  return model !== null
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path}`
}
