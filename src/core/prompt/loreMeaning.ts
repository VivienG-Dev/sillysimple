import type { LorebookEntry } from '@shared/types'

// Lorebook notes called by what the chat means, not only by their keywords.
//
// A note is sent to the model when one of its keywords appears in the latest messages
// (lorebook.ts). That misses a note about "Tomoe, Suzu's grandmother" when the user
// writes "do you still see your granny?". The app's own embedding model (the one that
// reads moods) turns each note and each sentence of the latest messages into a point;
// a note whose point is close enough to one of those sentences is sent too.
//
// The keywords still come first: a note they call is sent whatever the meaning says,
// and the notes called by meaning only take the room that is left. A few at most, so
// that a vague line does not bring half the lorebook in.
//
// This file only does the arithmetic: it never talks to a model. The vectors come from
// src/main (the same model as the moods, see sense.ts), which lets all of it be tested
// with made-up vectors. The choices marked "lab" are measured with the real model:
// `pnpm lore:lab` (lab/lore), which reads the notes of the eight stories that come with
// the app against chat lines written for it.

/** What of a note is turned into a point. */
export type LoreForm = 'content' | 'keys' | 'both'
/**
 * How close a note is to a sentence:
 * - `raw`: their cosine;
 * - `margin`: their cosine, less the average cosine of that sentence with every note of
 *   the lorebook. A sentence close to everything (a long, general one) calls nothing.
 */
export type LoreMethod = 'raw' | 'margin'

export interface LoreMeaningSettings {
  form: LoreForm
  method: LoreMethod
  /** How many of the latest messages are read (the newest first). */
  depth: number
  /** A note is called from this score up. */
  threshold: number
  /** At most this many notes are called by meaning for one reply. */
  most: number
}

/**
 * What the app uses. Lab, 9 October 2026 (`pnpm lore:lab` on Vivien's Mac, EmbeddingGemma 2,
 * 72 lines on the 49 notes of the eight stories): the note read alone (`content`; with its
 * keys it reads worse), `margin` (far ahead of `raw`), the last two messages, one note at
 * most. It then calls 34 of the 49 notes the keywords miss, and 2 it should not, both in
 * lines close to a note's subject without being about it (a grandfather who mended watches
 * calls the city's great clock; a brother who sang in a choir, the voices of the desert);
 * none in the ordinary lines, none in place of the right note.
 * Mind that the threshold was chosen on those same lines: real chats will do a little worse.
 */
export const LORE_MEANING: LoreMeaningSettings = {
  form: 'content',
  method: 'margin',
  depth: 2,
  threshold: 0.055,
  most: 1,
}

/** Below this many notes, `margin` has too few to average: `raw` is used. */
const MARGIN_NEEDS = 4
/** A sentence of fewer words is joined to the one before it: "Yes." means little alone. */
const SHORT_PIECE = 4
/** The most sentences read per message: the last ones, which are what the reply answers. */
const PIECES_PER_MESSAGE = 8

/** The notes the meaning may call: in use, with something to say, not sent always anyway. */
export function meaningCandidates(entries: readonly LorebookEntry[]): number[] {
  return entries.flatMap((entry, index) => (entry.enabled && !entry.constant && entry.content.trim() ? [index] : []))
}

/** The text of a note that is turned into a point. `fill` replaces {{char}} and {{user}}. */
export function loreEntryText(entry: LorebookEntry, form: LoreForm, fill: (text: string) => string = (text) => text): string {
  const content = fill(entry.content).replace(/\s+/g, ' ').trim()
  // Regular expressions say nothing to a model: only plain keys are kept.
  const keys = entry.keys.filter((key) => key.trim() && !/^\/.+\/[a-z]*$/s.test(key.trim())).map((key) => fill(key.trim()))
  if (form === 'content' || keys.length === 0) return content
  if (form === 'keys') return keys.join(', ')
  return `${keys.join(', ')}: ${content}`
}

export interface LorePiece {
  text: string
  /** 0 for the latest message, 1 for the one before… */
  age: number
}

/**
 * The sentences of the latest `depth` messages, the newest message first. Asterisks and
 * quotes go: a model reads "*she smiles*" and "she smiles" alike.
 */
export function lorePieces(messages: readonly string[], depth: number): LorePiece[] {
  const pieces: LorePiece[] = []
  const latest = messages.slice(-Math.max(1, depth)).reverse()
  latest.forEach((message, age) => {
    const sentences = sentencesOf(message)
    // A short sentence goes with the one before it, or, first of its message, with the one after.
    const joined: string[] = []
    let carried = ''
    for (const sentence of sentences) {
      const text = carried ? `${carried} ${sentence}` : sentence
      carried = ''
      if (text.split(' ').length >= SHORT_PIECE) joined.push(text)
      else if (joined.length > 0) joined[joined.length - 1] += ` ${text}`
      else carried = text
    }
    if (carried) joined.push(carried)
    for (const text of joined.slice(-PIECES_PER_MESSAGE)) pieces.push({ text, age })
  })
  return pieces
}

/** The sentences of a message, without asterisks or quotes. Also used by recall.ts. */
export function sentencesOf(message: string): string[] {
  return rawSentences(message).map(cleanSentence).filter(saysSomething)
}

/** A message cut into its sentences as they are written, asterisks and quotes kept. */
export function rawSentences(message: string): string[] {
  return message.match(/[^.!?…。！？\n]+[.!?…。！？]*["”»」』*]*/g) ?? []
}

/** A sentence as the model reads it: without asterisks or quotes. */
export function cleanSentence(sentence: string): string {
  return sentence.replace(/[*"“”«»„「」『』]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Whether a piece of text has a letter or a figure in it. */
export function saysSomething(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

/**
 * How close each note is to the latest messages: for each note, its best score over the
 * sentences. `entryVectors[i]` and `pieceVectors[j]` as the model gave them.
 */
export function loreScores(entryVectors: readonly ArrayLike<number>[], pieceVectors: readonly ArrayLike<number>[], method: LoreMethod): number[] {
  const entries = entryVectors.map(unit)
  const pieces = pieceVectors.map(unit)
  const useMargin = method === 'margin' && entries.length >= MARGIN_NEEDS
  const best = entries.map(() => -Infinity)
  for (const piece of pieces) {
    const cosines = entries.map((entry) => dot(entry, piece))
    const average = useMargin ? cosines.reduce((sum, value) => sum + value, 0) / cosines.length : 0
    cosines.forEach((cosine, index) => {
      const score = cosine - average
      if (score > best[index]!) best[index] = score
    })
  }
  return best
}

export interface LoreCall {
  /** Its place in the list given to `pickByMeaning`. */
  index: number
  score: number
}

/**
 * The notes called: from `threshold` up, the closest first, `most` at most. `skip`: the
 * ones the keywords call already, which take no place among them.
 */
export function pickByMeaning(
  scores: readonly number[],
  settings: Pick<LoreMeaningSettings, 'threshold' | 'most'>,
  skip: ReadonlySet<number> = new Set(),
): LoreCall[] {
  return scores
    .map((score, index) => ({ index, score }))
    .filter((call) => call.score >= settings.threshold && !skip.has(call.index))
    .sort((a, b) => b.score - a.score)
    .slice(0, settings.most)
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0
  for (let index = 0; index < a.length; index++) sum += a[index]! * b[index]!
  return sum
}

function unit(vector: ArrayLike<number>): number[] {
  const length = Math.sqrt(dot(vector, vector)) || 1
  return Array.from(vector, (value) => value / length)
}
