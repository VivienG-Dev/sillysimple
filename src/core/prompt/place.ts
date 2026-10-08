import { compareVersions } from '../engine/release'
import type { LlmMessage } from './buildMessages'
import type { TranscriptLine } from './memory'

// Where the scene is and what the character wears, and keeping both as they are.
//
// Models change a scene without warning: two characters talk in the kitchen and the next
// reply has them on the sofa; a skirt becomes trousers three replies later (Vivien,
// 7 October: "very, very common, and stressful"). Nothing in the last messages said
// "kitchen" or "skirt" any more, so the model wrote whatever its sentence called for.
//
// Two things are done about it:
//
//   - Every reply is asked to keep things as they are: a note in brackets at the end of
//     what the model reads (where it weighs most) says where the scene is and what the
//     character wears. The place stays until the user moves; the clothes stay until the
//     story changes them (something taken off, put on, changed), which it is free to do.
//   - The app keeps track of both. After each reply the model is asked one short question,
//     "where are they, and what is the character wearing, now?", and its answer is what
//     the next note says. The user can read and correct both (Memory tab of the chat), or
//     write them first and let the app follow from there.
//
// Both are kept with the chat, each along with what it was before the last reply: another
// version of that reply is told how things were before it, not what it may have wrongly
// changed. The place belongs to the chat; clothes belong to each character of it.
//
// How the question is asked was settled by trials with the real model (`pnpm scene:lab`,
// lab/scene, Gemma 4 e2b, 7 and 8 October 2026: 23 scene endings, the clothes right and
// the place right for each way of asking):
//
//   - Apart from the conversation, with the last messages only (`sceneFromLines`): 19
//     and 23. The only way that followed the scene every time it moved, and the fastest.
//   - In the conversation the reply was written in (`sceneAfter`): 15 and 22 at best. The
//     note that keeps things as they are is in that conversation, and a small model
//     answers with the note: shoes taken off stay on, a scene that went to the bakery
//     stays in the hallway. Asked there without saying how things were: 9 of 20.
//   - What is still read wrong apart: clothes that did not change are sometimes left out
//     when something else changes (the skirt, when a coat goes on): 4 scenes of the 23.
//
// The question was first asked in the conversation for one reason: a model on this
// computer has the conversation in memory, and a question asked apart was thought to make
// it read everything again for the next reply. Measured, it does not, with the Ollama the
// app brings: 169 ms for the next reply after three questions asked apart, 180 without,
// 3596 from nothing (6100 tokens). Of other servers nothing is known: see `asksApart`.

/** A place is a few words: "the kitchen of Suzu's flat". Longer is not a place, it is a sentence. */
export const PLACE_MAX_LENGTH = 80
/** Clothes take a few more: "a white blouse, a navy pleated skirt, knee socks, no shoes". */
export const OUTFIT_MAX_LENGTH = 160
/** What the model may write to answer: two short lines, and room for a model that adds some. */
export const PLACE_REPLY_TOKENS = 90
/** A question of fact. */
export const PLACE_TEMPERATURE = 0

/**
 * What the model is told at the end of the conversation. `{{char}}` and `{{user}}` are
 * filled in by the caller.
 * - `place`: where the scene is. Null: the app does not know, and the scene stays wherever
 *   the last messages have it. Left out: nothing is said about the place (the reply is
 *   asked to move the scene).
 * - `outfit`: what the character wears, when the app knows.
 * Empty when there is nothing to say.
 */
export function steadyNote(known: { place?: string | null; outfit?: string | null }): string {
  const place = known.place?.trim()
  const outfit = known.outfit?.trim()
  const parts: string[] = []
  if (known.place !== undefined) {
    parts.push(
      `${place ? `Where the scene is now: ${place}. The scene stays in this place` : 'The scene stays in the place where the last messages are'}: ` +
        '{{char}} does not leave it, and nothing is told as happening somewhere else, until {{user}} goes somewhere else or asks to.',
    )
  }
  if (outfit) {
    parts.push(
      `What {{char}} is wearing now: ${outfit}. These clothes stay exactly as they are from one reply to the next: ` +
        'they only change when the story tells it happening (something is taken off, put on, or changed).',
    )
  }
  return parts.length > 0 ? `[${parts.join(' ')} Do not mention this note.]` : ''
}

/** How many of the last messages a question asked apart is given: the reply, what it answers, and a little before. */
export const SCENE_LINES = 4

/** The first Ollama known to keep a conversation in memory while it is asked something else (it runs llama.cpp's own server). */
const KEEPS_MEMORY_FROM = '0.40.0'

/**
 * Whether the question is asked apart from the conversation, which reads the scene best.
 * It is, wherever that costs nothing: an online service keeps nothing in memory and is
 * paid by the word; the Ollama measured keeps the conversation in memory meanwhile; a
 * conversation that no longer fits with one more turn cannot be asked in. Another server
 * on this computer (LM Studio, KoboldCpp…) is asked in the conversation: it may hold one
 * conversation only, and the next reply would then read everything again.
 * `ollama`: the version of the Ollama that answers, null when it is not an Ollama.
 */
export function asksApart(where: { cloud: boolean; fits: boolean; ollama: string | null }): boolean {
  if (where.cloud || !where.fits) return true
  // "0.0.0" is an Ollama built by hand: taken for a recent one.
  return where.ollama !== null && (where.ollama === '0.0.0' || compareVersions(where.ollama, KEEPS_MEMORY_FROM) >= 0)
}

/**
 * The question asked apart. Every other wording tried in its place read the scenes worse:
 * the two lines shown as a form to fill in, what changed asked first, how things were said
 * in the question and not before the messages (8 to 11 scenes of 23, against 19).
 * `{{char}}` is filled in by the caller.
 */
const QUESTION_APART =
  '[Pause the story for two questions about this very moment, at the end of the last message. Answer on two lines and write nothing else:\n' +
  'Place: where the scene is, in a few words, like "the kitchen of the flat" or "a forest path at night"\n' +
  'Wearing: what {{char}} has on right now, in a few words, like "a white shirt, jeans, barefoot"; what was taken off is no longer worn\n' +
  'Write "unknown" for one that cannot be told.]'

/**
 * The question, asked apart from the conversation: how things were as far as the app
 * knows (`before`), the last messages (`SCENE_LINES` of them), the question. `name`: the
 * character who just spoke. The first words of the question are what the stand-in model
 * of the tests knows it by.
 */
export function sceneFromLines(lines: readonly TranscriptLine[], name: string, before: { place: string | null; outfit: string | null }): LlmMessage[] {
  const told = lines.map((line) => `${line.name}: ${line.content}`).join('\n\n')
  const earlier = [before.place && `Earlier, the scene was here: ${before.place}`, before.outfit && `Earlier, ${name} was wearing: ${before.outfit}`]
    .filter(Boolean)
    .join('\n')
  return [
    {
      role: 'system',
      content: 'You read the end of a roleplay scene and say where it takes place and what a character is wearing. You answer in a few words.',
    },
    { role: 'user', content: `${earlier ? `${earlier}\n\n` : ''}The last messages:\n\n${told}\n\n${QUESTION_APART.replaceAll('{{char}}', name)}` },
  ]
}

/**
 * The question as it is asked in the conversation the reply was written in. It says how
 * things were and asks what the last message changed: asked only what the character
 * wears, a small model recites the note it was given ("these clothes stay exactly as they
 * are"). `before`: what the app knew, which is what the reply was told.
 */
export function sceneQuestion(name: string, before: { place: string | null; outfit: string | null } = { place: null, outfit: null }): string {
  const was = [before.place?.trim() && `the scene was here: ${before.place.trim()}`, before.outfit?.trim() && `${name} was wearing: ${before.outfit.trim()}`].filter(Boolean)
  return (
    '[Pause the story for two questions about this very moment, at the end of the last message. Answer on two lines and write nothing else:\n' +
    'Place: where the scene is now, in a few words, like "the kitchen of the flat" or "a forest path at night"\n' +
    `Wearing: what ${name} has on now, in a few words, like "a white shirt, jeans, barefoot"\n` +
    (was.length > 0
      ? `Before the last message, ${was.join(', and ')}. Start from that and change only what the last message changed: what was taken off is left out, what was put on is added.\n`
      : '') +
    'Write "unknown" for one that cannot be told.]'
  )
}

/**
 * The question, asked in the conversation the reply was just written in: the same
 * messages, the reply, the question. For a server on this computer that may hold one
 * conversation in memory and no more (see `asksApart`): it has all of it in memory
 * already, only the question is read, and the next reply still finds the conversation
 * there. The note has to stay in those messages: without it a small model makes up a
 * place and clothes from the character's card.
 */
export function sceneAfter(messages: readonly LlmMessage[], reply: string, name: string, before?: { place: string | null; outfit: string | null }): LlmMessage[] {
  return [...messages, { role: 'assistant', content: reply }, { role: 'user', content: sceneQuestion(name, before) }]
}

/** "I cannot tell", in the ways models say it. */
const UNKNOWN = /^(?:(?:unknown|unclear|unspecified|undefined|n\/?a)(?![\p{L}\p{N}])|not (?:specified|clear|stated|mentioned|known|given|sure|described)|i (?:do not|don't|cannot|can't) )/iu
/** "Casual clothes": an answer that names no piece of clothing says nothing. */
const NO_OUTFIT = /^(?:(?:casual|regular|normal|ordinary|everyday|usual|typical|simple|comfortable|her|his|their)\s+)*(?:clothes|clothing|attire|outfit|wear)$/i
/** For a place only: "nothing" and "no clothes" are things one can be wearing. */
const NO_PLACE = /^(?:none|nowhere|no (?:specific |particular )?(?:place|location))\b/i
const PLACE_LABEL = /^(?:place|location|scene|where)\s*[:=-]\s*/i
const OUTFIT_LABEL = /^(?:wearing|wears|clothes|clothing|outfit)\s*[:=-]\s*/i

/** A line of the answer, without what a model wraps things in: brackets, quotes, asterisks, a list mark. */
function unwrap(line: string): string {
  return line.replace(/^[\s[("'“«*_`>-]+|[\s\])"'”»*_`]+$/g, '')
}

function tidy(text: string, maxLength: number, unknown: RegExp[] = [UNKNOWN]): string | null {
  let value = unwrap(text).replace(/^[\s"'“«*]+|[\s"'”»*.!]+$/g, '')
  // A sentence after the answer: the answer is what comes first.
  const stop = value.search(/[.;!?]\s/)
  if (stop > 0) value = value.slice(0, stop)
  value = value.replace(/\s+/g, ' ').trim()
  if (!value || !/\p{L}/u.test(value) || unknown.some((pattern) => pattern.test(value)) || value.length > maxLength) return null
  return value
}

/** What a line that is not a list of clothes has in it: someone doing something, someone speaking, a question. */
const TOLD = /["“”«»*?!]|\b(?:she|he|they|you|we|i|her|his)\b/i
/** Someone doing something, or speaking: no place reads like that ("her bedroom" does). */
const DOING = /["“”*]|\b(?:she|he|they|you|we|i)\b/i
/** A line that says what it is about, whatever that is: "Changed: nothing". */
const LABELLED = /^[\p{L}][\p{L} ]{0,18}\s*[:=]\s/u

/** What goes on saying where, after a comma: "Suzu's bedroom, on the bed". */
const WHERE = /^(?:on|in|at|by|near|under|behind|beside|inside|outside|above|below|across|along|over|next to|in front of)\b/i

/**
 * "Living room, oversized t-shirt, pyjama shorts, bare feet": both answers on one line,
 * as Gemma 4 e2b writes now and then when asked apart. Cut in two lines at the first
 * comma when what comes after it is a list and not more of the place; when it is one
 * thing only ("Park bench, casual clothes") the place alone is kept, no telling what the
 * rest is. Anything else is left as it is.
 */
function oneLine(line: string): string[] {
  const comma = line.indexOf(',')
  if (comma < 0 || TOLD.test(line)) return [line]
  const head = line.slice(0, comma).trim()
  const rest = line.slice(comma + 1).trim()
  if (!head || !rest || WHERE.test(rest) || head.split(/\s+/).length > 6) return [line]
  return rest.includes(',') ? [head, rest] : [head]
}

/**
 * What the model answered: the place and the clothes, each null when it gave none
 * ("unknown", nothing, or a paragraph: a model that went on with the story instead).
 * A model does not always write "Place:" and "Wearing:" before its two lines. The place
 * is then the first line. The clothes are the second, when the answer is two lines and
 * no more and that line reads as a list of clothes, not as the story going on.
 */
export function readScene(answer: string): { place: string | null; outfit: string | null } {
  let raw = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (raw.length === 1 && !LABELLED.test(unwrap(raw[0]!))) raw = oneLine(raw[0]!)
  const lines = raw.map(unwrap)
  const labelled = lines.some((line) => OUTFIT_LABEL.test(line) || PLACE_LABEL.test(line))
  const bare = !labelled && lines.length === 2 && !lines.some((line) => LABELLED.test(line)) && !TOLD.test(raw[1]!) ? lines[1] : undefined
  const outfitLine = lines.find((line) => OUTFIT_LABEL.test(line)) ?? bare
  const first = lines[0] && !OUTFIT_LABEL.test(lines[0]) && !(LABELLED.test(lines[0]) && !PLACE_LABEL.test(lines[0])) ? lines[0] : undefined
  const placeLine = lines.find((line) => PLACE_LABEL.test(line)) ?? first
  const named = placeLine !== undefined && PLACE_LABEL.test(placeLine)

  const place = placeLine
    ? tidy(
        placeLine
          .replace(PLACE_LABEL, '')
          .replace(/^(?:answer)\s*[:=-]\s*/i, '')
          .replace(/^(?:they|we|the (?:two|characters|scene))\s+(?:are|is)\s+(?:still\s+)?(?:taking place\s+)?(?=in |at |on |inside |outside |by |near )/i, ''),
        PLACE_MAX_LENGTH,
        // A line without its name that tells someone doing something is the story going on.
        named ? [UNKNOWN, NO_PLACE] : [UNKNOWN, NO_PLACE, DOING],
      )
    : null
  const outfit = outfitLine ? tidy(outfitLine.replace(OUTFIT_LABEL, ''), OUTFIT_MAX_LENGTH, [UNKNOWN, NO_OUTFIT]) : null
  return { place, outfit }
}

/**
 * Whether the answer being written already holds what was asked: a line for the place and
 * a line for the clothes, both ended. What a model writes after them (a question to the
 * user, the story going on) is not waited for.
 */
export function sceneAnswered(written: string): boolean {
  const ended = written.slice(0, written.lastIndexOf('\n') + 1)
  const lines = ended.split('\n').map(unwrap).filter(Boolean)
  return lines.length >= 2 && lines.some((line) => OUTFIT_LABEL.test(line)) && lines.some((line) => !OUTFIT_LABEL.test(line))
}

/** A place or clothes typed by the user, tidied; null when they emptied the field. */
export function cleanNote(typed: unknown, maxLength: number): string | null {
  const text = String(typed ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
  return text || null
}

/** What a chat keeps of one thing that should stay as it is: the place, or what one character wears. */
export interface Kept {
  /** How it is after the last reply it was read after. Null: not known. */
  now: string | null
  /** How it was before that reply. */
  before: string | null
  /** That reply. */
  messageId: string | null
}

/**
 * What to tell the model for the reply it is about to write. `rewriting`: the id of the
 * reply being written again (another version, or its rest); that one is told how things
 * were before it.
 */
export function whatToTell(kept: Kept | null | undefined, rewriting: string | null): string | null {
  if (!kept) return null
  return rewriting !== null && rewriting === kept.messageId ? kept.before : kept.now
}
