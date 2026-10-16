import type { RewriteKind, SceneDirection } from '@shared/types'
import type { Mood } from './detectMood'

// What the waiting row says before a reply starts (Vivien, 15 October: "l'indicateur,
// j'aime bien"). Three dots said nothing; a line such as "Lyra hesitates…" says who is
// about to speak and how they are, and makes a slow local model feel like a pause in
// the scene rather than a machine at work.
//
// How the character is: the mood read for their last reply (src/core/mood/detectMood.ts),
// the only thing the app knows before the new reply exists. It is a guess, so it colours
// the first line only; the lines after it, while the wait goes on, are plain ones.
// A stage direction ("Something happens"…) or a rewrite ("shorter"…) speaks first: that
// is what the user asked for.
//
// The lines never use a pronoun (the app does not know the character's) and never say
// what the user does. Sober on purpose: one gesture, no adverbs, no jokes.

/** How long each line stays before the next one, in milliseconds. */
export const WAITING_STEP = 3200

/** What a character may be doing before speaking, by the mood of their last reply. */
export const MOOD_LINES: Record<Mood, readonly string[]> = {
  joy: ['{{char}} smiles…', '{{char}} lights up…'],
  playful: ['{{char}} grins…', '{{char}} is up to something…'],
  love: ['{{char}} softens…', '{{char}} lingers on your words…'],
  shy: ['{{char}} hesitates…', '{{char}} looks away for a second…'],
  anger: ['{{char}} bristles…', '{{char}} takes a sharp breath…'],
  surprise: ['{{char}} blinks…', '{{char}} takes it in…'],
  question: ['{{char}} wonders…', '{{char}} considers it…'],
  sad: ['{{char}} goes quiet…', '{{char}} searches for words…'],
  nervous: ['{{char}} fidgets…', '{{char}} swallows…'],
  sigh: ['{{char}} sighs…', '{{char}} lets out a breath…'],
  fear: ['{{char}} freezes…', '{{char}} holds a breath…'],
  sleepy: ['{{char}} yawns…', '{{char}} stirs…'],
  thinking: ['{{char}} ponders…', '{{char}} turns it over…'],
}

/** Lines that fit any mood: the first one when none is known, and the ones after it. */
export const PLAIN_LINES: readonly string[] = [
  '{{char}} is writing…',
  '{{char}} takes a moment…',
  '{{char}} is choosing the words…',
  '{{char}} thinks it over…',
]

/** The first line when the reply follows a stage direction. */
export const DIRECTION_LINES: Record<SceneDirection, string> = {
  event: 'Something is about to happen…',
  place: 'The scene moves…',
  time: 'Time passes…',
}

/** The first line when the reply is written again the way the user asked (see src/core/prompt/rewrite.ts). */
export const REWRITE_LINES: Record<RewriteKind, string> = {
  shorter: '{{char}} keeps it short…',
  longer: '{{char}} takes more time…',
  feeling: '{{char}} lets it show…',
  dialogue: '{{char}} finds more to say…',
  own: '{{char}} tries again…',
}

export interface WaitingFor {
  /** The name of the character about to speak. */
  name: string
  /** The mood of their last reply, if one was read. */
  mood?: Mood | null
  /** The stage direction the reply is written under, if any. */
  direction?: SceneDirection
  /** The reply is written again the way the user asked: that comes first. */
  rewrite?: RewriteKind
  /** For the tests, and to draw the same lines again for the same reply. */
  random?: () => number
}

/**
 * The lines to show, in order: the first one says the most (the direction, or the mood),
 * the others are plain ones in an order of their own. The row goes through them and
 * then keeps going through the plain ones (see `lineAt`).
 */
export function waitingLines({ name, mood, direction, rewrite, random = Math.random }: WaitingFor): string[] {
  const who = name.trim()
  if (!who) return ['Writing…']
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length]!

  const first = rewrite ? REWRITE_LINES[rewrite] : direction ? DIRECTION_LINES[direction] : mood ? pick(MOOD_LINES[mood]) : pick(PLAIN_LINES)
  const rest = shuffle(PLAIN_LINES.filter((line) => line !== first), random)
  return [first, ...rest].map((line) => line.replaceAll('{{char}}', who))
}

/** The line for the `step`-th turn of the wait: the first one once, then the others in a loop. */
export function lineAt(lines: readonly string[], step: number): string {
  if (lines.length === 0) return ''
  if (step <= 0 || lines.length === 1) return lines[0]!
  return lines[1 + ((step - 1) % (lines.length - 1))]!
}

/** A draw that gives the same numbers for the same seed: a reply keeps its lines while it is written. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index++) state = Math.imul(state ^ seed.charCodeAt(index), 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other]!, copy[index]!]
  }
  return copy
}
