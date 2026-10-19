import type { LlmMessage } from './buildMessages'
import { estimateTokens } from './context'

// Long memory. A model can only read so much at once (its context). When a chat grows
// past that, its oldest messages no longer fit. Instead of dropping them, the app has
// the model sum them up, and sends that summary, the chat's "memory", in their place.
//
// The memory belongs to a chat: a text, and how many of the chat's first messages it
// covers. It is updated by folding more messages into it, a batch at a time: the model
// is given the memory so far and the next old messages, and writes the memory anew.
//
// Folding costs a request to the model, so it is not done at every message: when the
// messages stop fitting, enough of them are folded to leave room for a good while.

/** The memory may take up to this share of the context… */
const MEMORY_SHARE = 0.15
/** …never less than this, in tokens: enough to be useful… */
const MEMORY_MIN_TOKENS = 200
/**
 * …and never more than a ceiling that grows with the context: 700 tokens up to 8k (a
 * small local model, where the chat itself needs the room), then a sixteenth of the
 * context, up to 2000 at 32k (an online model: a long story is summed up less tightly).
 */
const MEMORY_CEILING = { least: 700, most: 2000, share: 1 / 16 }

/** After a fold, the messages kept as they are fill at most this share of the room for messages. */
const KEEP_SHARE = 0.5
/** The last messages are never folded: the model needs them word for word to answer. */
const KEEP_AT_LEAST = 2
/** Roughly what a message costs on top of its text (see context.ts). */
const TOKENS_PER_MESSAGE = 4
const WORDS_PER_TOKEN = 0.65

/** How many tokens the memory of a chat may take, for a model that reads `contextSize`. */
export function memoryTokens(contextSize: number): number {
  const ceiling = Math.min(MEMORY_CEILING.most, Math.max(MEMORY_CEILING.least, contextSize * MEMORY_CEILING.share))
  return Math.round(Math.min(ceiling, Math.max(MEMORY_MIN_TOKENS, contextSize * MEMORY_SHARE)))
}

/**
 * How many of the oldest messages to fold into the memory.
 * `contents`: the messages not in the memory yet, oldest first. `room`: the tokens
 * available for messages, once the instructions, the card and the memory are counted.
 * 0 when they all fit: there is nothing to do.
 */
export function planFold(contents: string[], room: number): number {
  const costs = contents.map((content) => estimateTokens(content) + TOKENS_PER_MESSAGE)
  if (costs.reduce((total, cost) => total + cost, 0) <= room) return 0

  // Keep the newest messages, up to half the room; everything before them is folded.
  let kept = 0
  let used = 0
  for (let index = costs.length - 1; index >= 0; index--) {
    if (kept >= KEEP_AT_LEAST && used + costs[index]! > room * KEEP_SHARE) break
    used += costs[index]!
    kept++
  }
  return costs.length - kept
}

/** A line of the chat, as the model reads it when it sums the chat up. */
export interface TranscriptLine {
  name: string
  content: string
}

/**
 * Cuts the messages to fold into batches the model can read in one request each.
 * `room`: tokens available for the messages of one request. A single message longer
 * than that is shortened: its beginning is what gets remembered.
 */
export function foldBatches(lines: TranscriptLine[], room: number): TranscriptLine[][] {
  const limit = Math.max(200, room)
  const batches: TranscriptLine[][] = []
  let batch: TranscriptLine[] = []
  let used = 0

  for (const line of lines) {
    let content = line.content
    if (estimateTokens(content) > limit) content = `${content.slice(0, limit * 3)} […]`
    const cost = estimateTokens(`${line.name}: ${content}`) + TOKENS_PER_MESSAGE

    if (batch.length > 0 && used + cost > limit) {
      batches.push(batch)
      batch = []
      used = 0
    }
    batch.push({ name: line.name, content })
    used += cost
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

/** The request that has the model fold `lines` into the memory. */
export function memoryRequest(input: { summary: string; lines: TranscriptLine[]; contextSize: number }): LlmMessage[] {
  const words = Math.round((memoryTokens(input.contextSize) * WORDS_PER_TOKEN) / 10) * 10
  const instructions = `You keep the memory of a roleplay chat. Its oldest messages are about to be put away, and what you write will stand in for them: later, the story must be able to go on from your notes alone.

You are given the memory so far, then the next messages of the chat. Write the memory anew, with those messages added to it.

Keep what the story needs: who the characters are to each other and how that changed, what happened and in what order, what was decided or promised, what was learned or revealed, where everyone is and what they have with them, and how things stand at the end. Keep names, places and objects exact. When the memory grows too long, shorten the oldest events first, never the latest.

Write plain sentences in the third person and the past tense, in the language of the chat. No list of messages, no opinion, no heading, nothing before or after the memory itself. ${words} words at most.`

  const transcript = input.lines.map((line) => `${line.name}: ${line.content}`).join('\n\n')
  return [
    { role: 'system', content: instructions },
    {
      role: 'user',
      content: `Memory so far:\n${input.summary.trim() || '(nothing yet: this is the beginning of the chat)'}\n\nNext messages of the chat:\n${transcript}\n\nWrite the memory anew.`,
    },
  ]
}

/** How many tokens the model may write for a memory: its size, with room to end its sentence. */
export function memoryReplyTokens(contextSize: number): number {
  return Math.ceil(memoryTokens(contextSize) * 1.3)
}

/** The memory as the model wrote it, without the wrapping some models add around it. */
export function cleanMemory(text: string): string {
  return text
    .replace(/^\s*```[a-z]*\s*$/gim, '')
    .trim()
    .replace(/^(\*\*|#+\s*)?(updated |new )?(memory|summary)( so far)?(\*\*)?\s*:?\s*(\*\*)?\s*\n+/i, '')
    .trim()
}

/** The part of the system message that gives the model its memory of the chat. */
export function memorySection(summary: string): string {
  const text = summary.trim()
  return text && `What happened earlier in this chat (the older messages are no longer shown, this is what is remembered of them):\n${text}`
}
