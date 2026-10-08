import type { LlmMessage } from '../prompt/buildMessages'
import { adaptAfterRefusal, buildChatBody, chatHeaders, joinUrl, type ProviderTarget } from './dialects'
import { HttpError, readHttpError } from './httpError'
import { readSseData } from './sse'

// Client for any server that speaks the OpenAI chat API: Ollama, LM Studio,
// KoboldCpp, llama.cpp, and the online services (see dialects.ts for what
// differs from one to the next).

export interface StreamChatInput extends ProviderTarget {
  model: string
  messages: LlmMessage[]
  temperature: number
  maxTokens: number
  /** false asks the model to answer directly, without a reasoning phase first. */
  thinking: boolean
  /** Texts at which the model must stop writing. */
  stop?: string[]
  signal?: AbortSignal
}

/**
 * What a stream can carry:
 * - text: a piece of the reply
 * - thinking: a piece of the model's reasoning, which is not part of the reply
 * - finish: why the model stopped ('stop' = done, 'length' = ran out of tokens)
 */
export type StreamPart =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'finish'; reason: string }

interface StreamChunk {
  choices?: {
    delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; reasoning_details?: unknown }
    finish_reason?: unknown
  }[]
  error?: { message?: unknown }
}

/** A refused request is adapted and sent again at most this many times. */
const MAX_ADAPTATIONS = 3

/** Yields the reply piece by piece as the model writes it. */
export async function* streamChat(input: StreamChatInput): AsyncGenerator<StreamPart> {
  const body = buildChatBody(input)
  const send = (): Promise<Response> =>
    fetch(joinUrl(input.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: chatHeaders(input),
      signal: input.signal,
      body: JSON.stringify(body),
    })

  let response = await send()

  // "Bad request": the server does not accept one of the options. Take the hint and ask again.
  for (let attempt = 0; response.status === 400 || response.status === 422; attempt++) {
    const refusal = await readHttpError(response)
    if (attempt === MAX_ADAPTATIONS || !adaptAfterRefusal(body, refusal, input.provider)) throw refusal
    response = await send()
  }

  if (!response.ok) throw await readHttpError(response)
  if (!response.body) throw new Error('The server sent an empty response.')

  for await (const data of readSseData(response.body)) {
    if (data === '[DONE]') return

    let chunk: StreamChunk
    try {
      chunk = JSON.parse(data) as StreamChunk
    } catch {
      continue // Some servers send keep-alive lines that are not JSON.
    }

    // An error can arrive in the middle of a stream that started well.
    if (chunk.error) throw new HttpError(502, String(chunk.error.message ?? 'The server reported an error.'))

    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    if (delta) {
      const { text, thinking } = readDelta(delta)
      if (thinking) yield { type: 'thinking', delta: thinking }
      if (text) yield { type: 'text', delta: text }
    }

    if (typeof choice?.finish_reason === 'string') yield { type: 'finish', reason: choice.finish_reason }
  }
}

/**
 * Separates the reply from the reasoning in one piece of a stream. Servers put the reasoning in different places:
 *   reasoning_content: "…"                                LM Studio, llama.cpp
 *   reasoning: "…"                                        Ollama, OpenRouter
 *   reasoning_details: [{ text: "…" }]                    OpenRouter, for some models
 *   content: [{ type: "thinking", thinking: [{ text }] }] Mistral, where `content` becomes a list
 */
function readDelta(delta: NonNullable<NonNullable<StreamChunk['choices']>[number]['delta']>): { text: string; thinking: string } {
  let text = ''
  let thinking = ''

  const named = delta.reasoning_content ?? delta.reasoning
  if (typeof named === 'string') thinking += named
  else if (Array.isArray(delta.reasoning_details)) thinking += textsOf(delta.reasoning_details)

  if (typeof delta.content === 'string') {
    text += delta.content
  } else if (Array.isArray(delta.content)) {
    for (const part of delta.content) {
      if (!isRecord(part)) continue
      if (part['type'] === 'thinking') thinking += textsOf(part['thinking'])
      else if (typeof part['text'] === 'string') text += part['text']
    }
  }
  return { text, thinking }
}

/** Joins the `text` of every item of a list. */
function textsOf(list: unknown): string {
  if (!Array.isArray(list)) return ''
  return list.map((item) => (isRecord(item) && typeof item['text'] === 'string' ? item['text'] : '')).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
