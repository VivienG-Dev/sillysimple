import type { LlmMessage } from '@core/prompt/buildMessages'
import type { ChangedCard } from '@shared/types'

// "Change it": the user says in a few words what should be different about a character
// they have (a woman instead of a man, another century, shyer, a new name) and the model
// rewrites only the parts of the card that change touches. Everything else stays word for
// word, and the parts it rewrites keep all that the change does not reach.
//
// The card goes to the model under the same headings it answers with, so the format is
// shown rather than described. Only rewritten parts come back: a small change costs a
// short answer, and a part the model does not mention cannot be damaged.

/** A part of the card, as it is called in the request and in the answer. */
export type ChangeField = 'NAME' | 'TAGLINE' | 'DESCRIPTION' | 'PERSONALITY' | 'SCENARIO' | 'EXAMPLE DIALOGUE' | 'TAGS' | 'FIRST MESSAGE'

const FIELDS: readonly ChangeField[] = ['NAME', 'TAGLINE', 'DESCRIPTION', 'PERSONALITY', 'SCENARIO', 'EXAMPLE DIALOGUE', 'TAGS', 'FIRST MESSAGE']

/** A lorebook note changed by the model. `index`: its place in the card, from 0; null for a new note. */
export interface LoreChange {
  index: number | null
  /** The note is to be removed. */
  remove?: boolean
  keys: string[]
  content: string
}

/** What the model rewrote. A part it did not write is absent. */
export interface CardChange {
  fields: Partial<Record<ChangeField, string>>
  /** Other opening messages by their place among them (0 is "GREETING 2", the one after the first message). */
  greetings: Map<number, string>
  lore: LoreChange[]
  /** The part the answer stops in: the one being written while the answer is not finished. */
  last: string | null
}

/** How many tokens the model may write: a change that touches every part of a long card is long too. */
export const CHANGE_REPLY_TOKENS = 6000
/** Low: the model is to change what is asked, not to rewrite with fresh ideas. */
export const CHANGE_TEMPERATURE = 0.4
export const MAX_CHANGE_LENGTH = 2000

const INSTRUCTIONS = `You edit character cards for a roleplay chat app. You are given a card, under headings, and a change the person wants. Make that change everywhere in the card where it shows, and nothing else.

Rewrite a part only when the change touches it. Then write that part again in full, and keep everything in it that the change does not reach exactly as it was: the same sentences, the same length, the same layout, the same *asterisks* and "quotes", {{char}} and {{user}} where they were. Never shorten a part or sum it up. A part the change does not touch is left out of your answer.

Answer with the parts you rewrite only, each under its heading on a line of its own, written as in the card: ### NAME, ### TAGLINE, ### DESCRIPTION, ### PERSONALITY, ### SCENARIO, ### EXAMPLE DIALOGUE, ### TAGS (one line, separated by commas), ### LORE, ### FIRST MESSAGE, ### GREETING 2, ### GREETING 3 and so on. Nothing before the first heading and nothing after the last part: no comment, no summary of what you changed.

Under ### LORE, write one line for each note you change: its number, a period, its keywords separated by commas, a colon, then the whole note, as in the card. To add a note, start the line with + instead of a number. To remove one, write its number, a period, and the word remove. Notes you do not list stay as they are.

Write in the language of the card, unless the change asks for another. The person who chats with the character is {{user}}: never give them a name, a look or a past unless the change asks for it.

When the character is under 18, or the change makes them so, the card holds nothing romantic or sexual.

If nothing in the card needs to change, answer with the single line ### NOTHING.`

/** The card as the model reads it: the headings of its answer, with what is under each now. */
function cardText(card: ChangedCard): string {
  const parts: string[] = [
    `### NAME\n${card.name.trim()}`,
    `### TAGLINE\n${card.tagline.trim()}`,
    `### DESCRIPTION\n${card.description.trim()}`,
    `### PERSONALITY\n${card.personality.trim()}`,
    `### SCENARIO\n${card.scenario.trim()}`,
    `### EXAMPLE DIALOGUE\n${card.exampleMessages.trim()}`,
    `### TAGS\n${card.tags.join(', ')}`,
  ]
  if (card.lore.length > 0) {
    parts.push(`### LORE\n${card.lore.map((note, index) => `${index + 1}. ${note.keys.join(', ')}: ${note.content.trim().replace(/\s*\n\s*/g, ' ')}`).join('\n')}`)
  }
  parts.push(`### FIRST MESSAGE\n${card.firstMessage.trim()}`)
  card.alternateGreetings.forEach((text, index) => parts.push(`### GREETING ${index + 2}\n${text.trim()}`))
  return parts.join('\n\n')
}

/** The messages that ask the model to apply `change` to `card`. */
export function changeRequest(card: ChangedCard, change: string): LlmMessage[] {
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: `The card:\n\n${cardText(card)}\n\nThe change: ${change.trim().slice(0, MAX_CHANGE_LENGTH)}` },
  ]
}

const HEADING = /^\s*#{2,4}\s*([A-Za-z][A-Za-z ]*?)(?:\s+(\d+))?\s*:?\s*$/

/**
 * Reads the model's answer, finished or not. `unfinished`: the answer stopped before its
 * end (stopped, cut by the limit, still arriving); its last part may be incomplete, and is
 * read as it is while `partial`, or left out for good otherwise (pass `drop: true`).
 */
export function readChange(text: string, options: { partial?: boolean; drop?: boolean } = {}): CardChange {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  // A last line still being written may turn out to be a heading: not shown yet.
  if (options.partial && !text.endsWith('\n') && /^\s*#/.test(lines.at(-1) ?? '')) lines.pop()

  const sections: { name: string; number: number | null; body: string[] }[] = []
  for (const line of lines) {
    const heading = line.match(HEADING)
    const name = heading?.[1]?.trim().toUpperCase()
    if (heading && name && (FIELDS.includes(name as ChangeField) || name === 'LORE' || name === 'GREETING' || name === 'NOTHING')) {
      sections.push({ name, number: heading[2] ? Number(heading[2]) : null, body: [] })
    } else {
      sections.at(-1)?.body.push(line)
    }
  }
  if (options.drop) sections.pop()

  const change: CardChange = { fields: {}, greetings: new Map(), lore: [], last: sections.at(-1)?.name ?? null }
  for (const section of sections) {
    const body = section.body.join('\n').trim()
    if (section.name === 'GREETING') {
      // GREETING 2 is the first of the other greetings; "GREETING 1" would be the first message.
      if (section.number === 1 && body) change.fields['FIRST MESSAGE'] = body
      else if (section.number !== null && section.number >= 2 && body) change.greetings.set(section.number - 2, body)
    } else if (section.name === 'LORE') {
      change.lore.push(...loreChanges(section.body))
    } else if (section.name !== 'NOTHING') {
      const field = section.name as ChangeField
      // An empty name or first message is not a change anyone asks for: a slip of the model.
      if (body || (field !== 'NAME' && field !== 'FIRST MESSAGE')) change.fields[field] = field === 'NAME' ? (body.split('\n')[0] ?? '').trim() : body
    }
  }
  return change
}

/** True when the model said there is nothing to change. */
export function saidNothing(text: string): boolean {
  return /^\s*#{2,4}\s*NOTHING\s*$/im.test(text)
}

/** The lines under ### LORE: "3. keys: note", "+ keys: note", "3. remove". */
function loreChanges(lines: string[]): LoreChange[] {
  const changes: LoreChange[] = []
  for (const raw of lines) {
    const line = raw.replace(/^\s*[-*]\s+(?=\d|\+)/, '').replace(/\*\*/g, '').trim()
    const found = line.match(/^(?:(\d+)[.)]|\+)\s*(.*)$/)
    if (!found) {
      // A note written over two lines: the second belongs to the one before.
      const previous = changes.at(-1)
      if (previous && !previous.remove && line) previous.content = `${previous.content} ${line}`.trim()
      continue
    }
    const index = found[1] ? Number(found[1]) - 1 : null
    const rest = (found[2] ?? '').trim()
    if (index !== null && /^remove\.?$/i.test(rest)) {
      changes.push({ index, remove: true, keys: [], content: '' })
      continue
    }
    const colon = rest.indexOf(':')
    if (colon <= 0) continue
    const keys = rest
      .slice(0, colon)
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
      .slice(0, 8)
    const content = rest.slice(colon + 1).trim()
    if (keys.length > 0 && content) changes.push({ index, keys, content })
  }
  return changes
}

/** The parts a change rewrote, as the editor names them: "the description, the first message and 2 notes". */
export function describeChange(change: CardChange): string[] {
  const names: Record<ChangeField, string> = {
    NAME: 'the name',
    TAGLINE: 'the tagline',
    DESCRIPTION: 'the description',
    PERSONALITY: 'the personality',
    SCENARIO: 'the scenario',
    'EXAMPLE DIALOGUE': 'the example dialogue',
    TAGS: 'the tags',
    'FIRST MESSAGE': 'the first message',
  }
  const parts = FIELDS.filter((field) => change.fields[field] !== undefined).map((field) => names[field])
  const greetings = change.greetings.size
  if (greetings > 0) parts.push(greetings === 1 ? 'another opening' : `${greetings} other openings`)
  const notes = change.lore.length
  if (notes > 0) parts.push(notes === 1 ? 'a lorebook note' : `${notes} lorebook notes`)
  return parts
}
