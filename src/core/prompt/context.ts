import type { GenerationSettings } from '@shared/types'
import type { LlmMessage } from './buildMessages'

// A model can only read a limited number of tokens at once (its "context").
// When a conversation grows past it, the oldest messages are left out so that the
// instructions, the character card and the recent messages always fit.

/** Roughly what a message costs on top of its text (role markers, separators). */
const TOKENS_PER_MESSAGE = 4

/** Kept free so that an estimate that runs a little low does not overflow the model. */
const SAFETY_MARGIN = 0.05

// With thinking on, the reasoning counts against max_tokens. This extra room
// keeps "Reply length" meaning the length of the visible reply.
export const THINKING_TOKEN_ALLOWANCE = 2000

/**
 * In automatic mode the context is never larger than this, whatever the model allows.
 * Models that read a million tokens exist, but sending them a whole long chat with
 * every message would be slow on a local model and costly on an online one.
 */
export const AUTO_CONTEXT_LIMIT = 32768

/**
 * The context size to work with.
 * - Automatic: what the model server reports (`detected`), up to AUTO_CONTEXT_LIMIT.
 *   When the server does not say, the size chosen by hand is used.
 * - Otherwise: the size chosen by hand.
 */
export function effectiveContextSize(
  generation: Pick<GenerationSettings, 'autoContext' | 'contextSize'>,
  detected: number | null,
): number {
  if (!generation.autoContext || !detected || detected <= 0) return generation.contextSize
  return Math.min(detected, AUTO_CONTEXT_LIMIT)
}

/**
 * "Reply length" is what the model is asked to aim for (see replyLength.ts). The hard
 * limit sits this much above it, so that a reply running a little long can still end
 * on its own instead of being cut in the middle of a sentence.
 */
export const REPLY_HEADROOM = 1.5

/** How many tokens the model is allowed to write: the reply with its headroom, plus room to think if that is on. */
export function replyTokens(generation: Pick<GenerationSettings, 'maxTokens' | 'thinking'>): number {
  return Math.ceil(generation.maxTokens * REPLY_HEADROOM) + (generation.thinking ? THINKING_TOKEN_ALLOWANCE : 0)
}

/**
 * Estimates how many tokens a text takes. The exact count depends on each model's
 * tokenizer, which the app does not have, so this errs on the high side:
 * about 3.3 characters per token for alphabetic text, more than one token per Chinese,
 * Japanese or Korean character.
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0
  return Math.ceil((text.length - cjk) / 3.3 + cjk * 1.2)
}

export interface ContextFit {
  /** The messages to send: the system message, then the recent messages that fit. */
  messages: LlmMessage[]
  /** Estimated tokens of `messages`. */
  usedTokens: number
  /** How many tokens `messages` may take: the context size minus the room kept for the reply. */
  budgetTokens: number
  /** How many of the oldest messages were left out. */
  droppedCount: number
}

/**
 * Keeps the system message and as many of the most recent messages as fit.
 * The last message is always kept, even if it is too long on its own:
 * sending nothing would be worse than a small overflow.
 */
export function fitToContext(
  messages: LlmMessage[],
  options: { contextSize: number; replyTokens: number },
): ContextFit {
  const budgetTokens = Math.max(0, Math.floor(options.contextSize * (1 - SAFETY_MARGIN)) - options.replyTokens)
  const cost = (message: LlmMessage): number => estimateTokens(message.content) + TOKENS_PER_MESSAGE

  const system = messages.filter((message) => message.role === 'system')
  const conversation = messages.filter((message) => message.role !== 'system')

  let usedTokens = system.reduce((total, message) => total + cost(message), 0)
  const kept: LlmMessage[] = []

  // Walk back from the newest message and stop at the first one that does not fit.
  for (let index = conversation.length - 1; index >= 0; index--) {
    const message = conversation[index]!
    const isNewest = index === conversation.length - 1
    if (!isNewest && usedTokens + cost(message) > budgetTokens) break
    kept.unshift(message)
    usedTokens += cost(message)
  }

  return {
    messages: [...system, ...kept],
    usedTokens,
    budgetTokens,
    droppedCount: conversation.length - kept.length,
  }
}
