import { cleanSentence, loreScores, rawSentences, saysSomething, type LoreMethod } from './loreMeaning'

// Exact memory: old moments of a chat brought back, word for word, when the chat comes
// back to them.
//
// When a chat grows past what the model can read, its oldest messages are summed up
// (memory.ts). A summary keeps the story, not the details: the name of the kitten found
// by the clock tower, the exact promise, the gift and who it came from. When the user
// comes back to one of those ("do you still have the compass I gave you?"), the app's
// embedding model (the one that reads moods) finds the old messages closest to what the
// latest messages mean, and the closest is given to the model again, as it was written,
// with the message it answers or that answers it (the exchange), in a note at the end of
// the user's message. A name said again ("how is Mochi?") weighs extra: the model reads
// names poorly.
//
// The note goes at the end and not in the system message: the start of what the model
// reads then stays the same from one reply to the next, and Ollama does not have to read
// the whole chat again (it keeps what it already read when the start has not changed).
//
// This file only does the arithmetic and the wording: it never talks to a model (see
// src/main/recall.ts). The choices marked "lab" are measured with the real model:
// `pnpm recall:lab` (lab/recall), which reads long chats written for it.

/**
 * What of an old message is turned into a point:
 * - `message`: the whole of it;
 * - `pair`: each two sentences that follow each other (a message is as close as its closest pair);
 * - `sentence`: each sentence, the short ones joined to the one before.
 */
export type RecallForm = 'message' | 'pair' | 'sentence'

export interface RecallSettings {
  form: RecallForm
  method: LoreMethod
  /** How many of the latest messages are read to know what the chat is about now. */
  depth: number
  /** An old message is brought back from this score up. */
  threshold: number
  /** At most this many old messages are brought back for one reply. */
  most: number
}

/**
 * What the app uses. Lab, 9 October 2026 (`pnpm recall:lab` on Vivien's Mac, EmbeddingGemma 2,
 * 3 long chats, 40 later lines): pairs of sentences, `margin`, the latest message only, one
 * exchange at most, with the name bonus. It then brings back the right moment for 23 of the
 * 28 lines that come back to one, and something in 2 of the 12 lines that should bring
 * nothing; in 2 lines it brings back a wrong moment instead (a word game for "train station"
 * against the homework about trains; the repairman of the boiler for the one on the phone).
 * Without the exchange and the names: 18 to 21. Mind that the threshold was chosen on those
 * same lines: real chats will do a little worse.
 */
export const RECALL: RecallSettings = {
  form: 'pair',
  method: 'margin',
  depth: 1,
  threshold: 0.085,
  most: 1,
}

/** Added to the score of an old message that holds a name the latest message says (lab). */
export const NAME_BONUS = 0.1
/** A name counts when it is rare in the chat: in at most this many old messages. */
const NAME_RARE = 2
/** Words written with a capital in the middle of a sentence that are not names. */
const NOT_NAMES = new Set(
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december'.split(' '),
)

/** An old message brought back is cut to about this many words, around what was found in it. */
export const RECALL_WORDS = 80
/** Below this context, one old message at most: the room is better left to the chat. */
const SMALL_CONTEXT = 4096
/** A sentence of fewer words is joined to the one before it. */
const SHORT_SENTENCE = 4

/** A piece of an old message that is turned into a point. */
export interface RecallPassage {
  /** Its message, as a place in the list given to `recallPassages`. */
  message: number
  /** Its sentences in that message, from `from` up to `to` (not included), as `rawSentences` cuts it. */
  from: number
  to: number
  text: string
}

/** The pieces of the old messages, in the form asked. */
export function recallPassages(messages: readonly string[], form: RecallForm): RecallPassage[] {
  const passages: RecallPassage[] = []
  messages.forEach((content, message) => {
    const units = sentenceUnits(content)
    if (units.length === 0) return
    if (form === 'message') {
      passages.push({
        message,
        from: 0,
        to: units.at(-1)!.to,
        text: units.map((unit) => unit.text).join(' '),
      })
    } else if (form === 'sentence' || units.length === 1) {
      for (const unit of units) passages.push({ message, ...unit })
    } else {
      for (let index = 0; index + 1 < units.length; index++) {
        passages.push({
          message,
          from: units[index]!.from,
          to: units[index + 1]!.to,
          text: `${units[index]!.text} ${units[index + 1]!.text}`,
        })
      }
    }
  })
  return passages
}

/** The sentences of a message, cleaned, the short ones joined to the one before (or, first, to the one after). */
function sentenceUnits(content: string): { from: number; to: number; text: string }[] {
  const units: { from: number; to: number; text: string }[] = []
  let carried: { from: number; to: number; text: string } | null = null
  rawSentences(content).forEach((raw, index) => {
    const clean = cleanSentence(raw)
    if (!saysSomething(clean)) return
    const unit = carried ? { from: carried.from, to: index + 1, text: `${carried.text} ${clean}` } : { from: index, to: index + 1, text: clean }
    carried = null
    if (unit.text.split(' ').length >= SHORT_SENTENCE) units.push(unit)
    else if (units.length > 0) {
      const last = units.at(-1)!
      last.to = unit.to
      last.text = `${last.text} ${unit.text}`
    } else carried = unit
  })
  if (carried) units.push(carried)
  return units
}

/**
 * The bonus of each old message: `NAME_BONUS` when it holds a name of the latest messages
 * (a word with a capital in the middle of a sentence) that few old messages hold. The names
 * of the chat's own people (`ownNames`) are everywhere and count for nothing.
 */
export function nameBonuses(old: readonly string[], latest: readonly string[], ownNames: readonly string[] = []): number[] {
  const own = new Set(ownNames.flatMap((name) => name.toLowerCase().split(/\s+/)))
  const asked = new Set(latest.flatMap(namesIn).filter((name) => !own.has(name)))
  if (asked.size === 0) return old.map(() => 0)
  const words = old.map((content) => new Set((content.toLowerCase().match(/[\p{L}'’]{3,}/gu) ?? []).map((word) => word.replace(/['’]s$/, ''))))
  const rare = [...asked].filter((name) => words.filter((held) => held.has(name)).length <= NAME_RARE)
  return words.map((held) => (rare.some((name) => held.has(name)) ? NAME_BONUS : 0))
}

/** The names of a text: words of three letters or more written with a capital, not first in their sentence. */
function namesIn(text: string): string[] {
  return rawSentences(text).flatMap((sentence) =>
    (cleanSentence(sentence).match(/[\p{L}'’]+/gu) ?? [])
      .slice(1)
      .filter((word) => word.length >= 3 && /^\p{Lu}/u.test(word))
      .map((word) => word.toLowerCase().replace(/['’]s$/, ''))
      .filter((word) => !NOT_NAMES.has(word)),
  )
}

/**
 * The exchange an old message belongs to, as places in the chat: a message of the user
 * with the reply that follows it, a reply with the message of the user before it. A
 * question alone ("what did the pawnbroker tell you?") says little; its answer does.
 */
export function recallExchange(message: number, roles: readonly ('user' | 'assistant')[]): number[] {
  if (roles[message] === 'user') return roles[message + 1] === 'assistant' ? [message, message + 1] : [message]
  return roles[message - 1] === 'user' ? [message - 1, message] : [message]
}

export interface RecallCall {
  /** The old message, as a place in the list given to `recallPassages`. */
  message: number
  /** Its passage that was closest. */
  passage: RecallPassage
  score: number
}

/**
 * The old messages to bring back: each scored by its closest passage, from `threshold`
 * up, the closest first, `most` at most (one with a small context).
 * `passageVectors[i]` and `pieceVectors[j]` as the model gave them; the pieces are the
 * sentences of the latest messages (`lorePieces`).
 */
export function pickRecalls(
  passages: readonly RecallPassage[],
  passageVectors: readonly ArrayLike<number>[],
  pieceVectors: readonly ArrayLike<number>[],
  settings: Pick<RecallSettings, 'method' | 'threshold' | 'most'>,
  contextSize = 8192,
  /** Per old message, added to its score (`nameBonuses`). */
  bonus: readonly number[] = [],
): RecallCall[] {
  const scores = loreScores(passageVectors, pieceVectors, settings.method)
  const best = new Map<number, RecallCall>()
  passages.forEach((passage, index) => {
    const score = scores[index]! + (bonus[passage.message] ?? 0)
    const known = best.get(passage.message)
    if (!known || score > known.score) best.set(passage.message, { message: passage.message, passage, score })
  })
  const most = contextSize < SMALL_CONTEXT ? Math.min(1, settings.most) : settings.most
  return [...best.values()]
    .filter((call) => call.score >= settings.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, most)
}

/**
 * What is given of an old message: all of it when it is short, otherwise the passage found
 * and the sentences around it, up to about `words` words, with "…" where it was cut.
 */
export function recallExcerpt(content: string, passage: Pick<RecallPassage, 'from' | 'to'>, words = RECALL_WORDS): string {
  const sentences = rawSentences(content).map((sentence) => sentence.trim())
  const count = (from: number, to: number): number => sentences.slice(from, to).join(' ').split(/\s+/).filter(Boolean).length
  if (count(0, sentences.length) <= words) return content.trim()
  let from = Math.max(0, Math.min(passage.from, sentences.length - 1))
  let to = Math.max(from + 1, Math.min(passage.to, sentences.length))
  // Around the passage, a sentence after then one before, while there is room.
  let growing = true
  while (growing) {
    growing = false
    if (to < sentences.length && count(from, to + 1) <= words) {
      to++
      growing = true
    }
    if (from > 0 && count(from - 1, to) <= words) {
      from--
      growing = true
    }
  }
  const text = sentences.slice(from, to).join(' ')
  return `${from > 0 ? '… ' : ''}${text}${to < sentences.length ? ' …' : ''}`
}

/** One old message brought back: who said it and what was said. */
export interface Recalled {
  name: string
  text: string
}

/** The note added at the end of the user's message, with the old messages in the order they were said. */
export function recallNote(recalled: readonly Recalled[]): string {
  if (recalled.length === 0) return ''
  const lines = recalled.map((item) => `${item.name}: ${item.text.replace(/\s*\n+\s*/g, ' ')}`).join('\n')
  return `[Said earlier in this chat, long ago (older messages are no longer shown); use it if it matters now:\n${lines}\nDo not mention this note.]`
}
