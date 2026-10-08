import type { ConnectionStatus } from '@shared/types'
import { listModels, serviceName, type ProviderTarget } from './dialects'
import { HttpError } from './httpError'
import { listOllamaModels } from './ollama'

export type { ProviderTarget } from './dialects'
export { streamChat } from './openaiCompatible'

/** A server on this computer answers at once. An online service gets more time: its list can be long. */
const LOCAL_TIMEOUT_MS = 4000
const CLOUD_TIMEOUT_MS = 15000

/** Checks that the server answers and returns the models it offers. */
export async function testConnection(target: ProviderTarget): Promise<ConnectionStatus> {
  if (target.kind === 'cloud' && !target.apiKey) {
    return { ok: false, error: `Enter your ${serviceName(target)} API key first.` }
  }

  const signal = AbortSignal.timeout(target.kind === 'cloud' ? CLOUD_TIMEOUT_MS : LOCAL_TIMEOUT_MS)
  try {
    const models =
      target.kind === 'ollama' ? await listOllamaModels(target.baseUrl, signal) : await listModels(target, signal)
    return { ok: true, models }
  } catch (error) {
    return { ok: false, error: describeConnectionError(error, target) }
  }
}

/** Turns a low-level error into a sentence a non-technical user can act on. */
export function describeConnectionError(error: unknown, target: ProviderTarget): string {
  const name = serviceName(target)
  const code = errorCode(error)

  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENETUNREACH') {
    // Ollama was quit, or ended, between two messages. Asking again finds the one that runs now, or starts the app's own.
    if (target.kind === 'ollama') return 'The model on this computer stopped answering. Try again.'
    if (target.kind === 'cloud') return `${name} could not be reached. Check your internet connection.`
    return `Nothing answered at ${target.baseUrl}. Check the address and that the server is started.`
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `No answer from ${name} after a few seconds.`
  }
  if (error instanceof TypeError && /invalid url/i.test(describe(error))) {
    return 'That address is not a valid URL. It should look like http://127.0.0.1:1234/v1'
  }
  if (error instanceof HttpError) return describeHttpStatus(error, target)
  return describe(error)
}

/** The statuses that mean the same thing everywhere: wrong key, no credit, too many requests. */
function describeHttpStatus(error: HttpError, target: ProviderTarget): string {
  const name = serviceName(target)
  const Name = name.charAt(0).toUpperCase() + name.slice(1)

  if (error.status === 401) {
    return target.apiKey ? `${Name} refused the API key.` : `${Name} asks for an API key.`
  }

  const aboutMoney = /credit|quota|billing|balance|spend|payment/i.test(error.message)
  if (error.status === 402 || (error.status === 429 && aboutMoney)) {
    return `${Name} says this account has no credit left: ${error.message}`
  }
  if (error.status === 429) {
    return `${Name} is receiving too many requests right now. Wait a moment, then try again.`
  }
  return target.kind === 'cloud' ? `${Name} answered: ${error.message}` : error.message
}

/**
 * Explains a reply that ended without any text, which otherwise looks like the app froze.
 * The usual cause is a thinking model that spent every allowed token on its reasoning.
 */
export function describeEmptyReply(info: { sawThinking: boolean; finishReason: string | null }): string {
  if (info.sawThinking && info.finishReason === 'length') {
    return 'The model used up its whole reply length thinking and wrote nothing. In Generation settings, turn on "Let the model think before replying" to give it room, or raise the reply length.'
  }
  if (info.sawThinking) return 'The model thought about it but wrote no reply.'
  // Online services do not always show the thinking: running out of room with nothing written is the sign.
  if (info.finishReason === 'length') {
    return 'The model reached its reply length before writing anything. If it is a thinking model, turn on "Let the model think before replying" in Generation settings.'
  }
  return 'The model sent back an empty reply.'
}

function errorCode(error: unknown): string | undefined {
  // Node's fetch wraps the real cause: TypeError('fetch failed', { cause: { code } })
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined
  return typeof cause?.code === 'string' ? cause.code : undefined
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? error.cause.message : ''
  return cause ? `${error.message}: ${cause}` : error.message
}
