// What is read aloud is not what is written. Roleplay prose is full of signs meant for
// the eye: *asterisks* around what a character does, quotes around what they say, the
// odd bit of Markdown. A voice reads all of that out, or stumbles on it.
//
// speechText turns a message into what a voice should say, and speechChunks cuts it so
// that the first sound comes quickly: the first piece is short, the next ones longer,
// each ending where a sentence does. A piece is one request to the voice service.

/** A first piece of about this many characters is heard within a second or two. */
export const FIRST_CHUNK = 220
/** The following pieces: long enough for the voice to keep its flow, well within what any service takes at once. */
export const NEXT_CHUNK = 700

const QUOTED = /"([^"\n]+)"|“([^”\n]+)”|«\s*([^»\n]+?)\s*»/g
const BETWEEN_ASTERISKS = /\*([^*\n]*)\*/g

/** What is never read out: code, links' addresses, macros that were not filled in, the signs that open a line. */
function prepare(message: string): string {
  return message
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\{\{[^}\n]*\}\}/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+])\s+/gm, '')
}

/** Takes the last signs meant for the eye out of a text, and puts its spaces in order. */
function tidy(text: string): string {
  return text
    .replace(/(\*\*|__|~~)/g, '')
    .replace(/[*_]/g, '')
    .replace(/["“”«»]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ +([.,!?;:…])/g, '$1')
    .trim()
}

/** A line of dialogue reads as a sentence: it gets its full stop if it has no ending of its own. */
const asSentence = (line: string): string => (/[.!?…,;:]$/.test(line) ? line : `${line}.`)

/**
 * The text a voice should say for a message.
 * `all`: everything, without the signs. `speech`: only what the character says aloud,
 * that is the text in quotes; a message without any quotes is taken as all speech,
 * minus what stands between asterisks. May be empty: there is then nothing to read.
 */
export function speechText(message: string, read: 'all' | 'speech' = 'all'): string {
  let text = prepare(message)
  if (read === 'speech') {
    const said = [...text.matchAll(QUOTED)].map((match) => (match[1] ?? match[2] ?? match[3] ?? '').trim()).filter(Boolean)
    text = said.length > 0 ? said.map(asSentence).join(' ') : text.replace(BETWEEN_ASTERISKS, ' ')
  }
  return tidy(text)
}

/** A stretch of a message, and who says it: the character (what is said aloud) or a narrator (the rest). */
export interface SpeechPart {
  by: 'character' | 'narrator'
  text: string
}

/**
 * A message cut into what the character says and what a narrator tells, in order, for
 * reading with two voices. What is said is the text in quotes, and the narrator has
 * everything else. In a message without any quotes, the narrator has what stands
 * between asterisks and the character the rest. Stretches without a single letter
 * (a stray comma between two lines of dialogue) are dropped.
 */
export function speechParts(message: string): SpeechPart[] {
  const text = prepare(message)
  const quoted = QUOTED.test(text)
  QUOTED.lastIndex = 0
  const marks = quoted ? QUOTED : BETWEEN_ASTERISKS
  const [inside, outside] = quoted ? (['character', 'narrator'] as const) : (['narrator', 'character'] as const)

  const parts: SpeechPart[] = []
  const add = (by: SpeechPart['by'], raw: string): void => {
    // A stretch does not open on what was left of the one before: a comma, a dash, an ellipsis.
    const said = tidy(raw).replace(/^[\s.,;:!?…—–-]+/, '')
    if (!/[\p{L}\p{N}]/u.test(said)) return
    const last = parts.at(-1)
    if (last?.by === by) last.text = `${last.text} ${said}`
    else parts.push({ by, text: said })
  }

  let from = 0
  for (const match of text.matchAll(marks)) {
    add(outside, text.slice(from, match.index))
    const held = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    add(inside, inside === 'character' && held ? asSentence(held) : held)
    from = match.index + match[0].length
  }
  add(outside, text.slice(from))
  return parts
}

/**
 * Cuts `text` into the pieces to ask the voice for, one after the other. Cuts fall at
 * the end of a sentence when there is one in reach, at a comma or a space otherwise.
 */
export function speechChunks(text: string, first = FIRST_CHUNK, next = NEXT_CHUNK): string[] {
  const chunks: string[] = []
  let rest = text.replace(/\s*\n\s*/g, ' ').trim()

  while (rest) {
    const room = chunks.length === 0 ? first : next
    if (rest.length <= room) {
      chunks.push(rest)
      break
    }
    const cut = cutPoint(rest, room)
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  return chunks.filter(Boolean)
}

/** Where to cut `text` within its first `room` characters: after the last sentence, else the last comma, else the last space. */
function cutPoint(text: string, room: number): number {
  const reach = text.slice(0, room)
  // A sentence ends on . ! ? or …, maybe followed by a closing bracket, then a space.
  let sentence = -1
  for (const match of reach.matchAll(/[.!?…]+[)\]]?(?=\s)/g)) sentence = match.index + match[0].length
  // Not too early: a piece of three words would sound chopped.
  if (sentence >= room * 0.4) return sentence

  const comma = Math.max(reach.lastIndexOf(', '), reach.lastIndexOf('; '), reach.lastIndexOf(': '))
  if (comma >= room * 0.4) return comma + 1
  if (sentence > 0) return sentence

  const space = reach.lastIndexOf(' ')
  return space > 0 ? space : room
}
