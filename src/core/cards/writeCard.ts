import type { LlmMessage } from '@core/prompt/buildMessages'
import type { Tastes } from '@core/prompt/notice'
import type { MoodPick } from '@shared/types'
import { moodsSection } from './moods'

// Writing a character from one sentence: the user says who they have in mind, and the
// model the app is connected to writes the whole card.
//
// The model answers in plain text cut into sections by headings, not in JSON: local
// models get long JSON wrong (a quote, a line break, and nothing can be read), while
// headings survive almost anything. It also means the answer can be read while it is
// still being written, so the editor fills in under the user's eyes.

/** The sections of the answer, in the order the model writes them. */
const SECTIONS = [
  'NAME',
  'TAGLINE',
  'DESCRIPTION',
  'PERSONALITY',
  'SCENARIO',
  'EXAMPLE DIALOGUE',
  'TAGS',
  'LORE',
  'FIRST MESSAGE',
  'SECOND GREETING',
  // Only written when the idea asks for several greetings.
  'THIRD GREETING',
  'FOURTH GREETING',
  'FIFTH GREETING',
] as const
export type CardSection = (typeof SECTIONS)[number]

/** The sections that hold the greetings after the first message, in order. */
export const OTHER_GREETINGS = ['SECOND GREETING', 'THIRD GREETING', 'FOURTH GREETING', 'FIFTH GREETING'] as const satisfies readonly CardSection[]
/** Whether `section` is one of the greetings: the first message, or one of the others. */
export function isGreeting(section: CardSection | null): boolean {
  return section === 'FIRST MESSAGE' || (OTHER_GREETINGS as readonly (CardSection | null)[]).includes(section)
}

/** How many tokens the model may write: a full card is around a thousand, and each greeting asked for on top adds some two hundred. */
export const CARD_REPLY_TOKENS = 3000
/** A little above the chat's default: a character should not be the most expected one. */
export const CARD_TEMPERATURE = 0.9
const MAX_IDEA_LENGTH = 2000

const INSTRUCTIONS = `You write character cards for a roleplay chat app. The user gives you an idea, sometimes only a few words; you turn it into a complete, vivid character who is fun to talk to. Fill in what the idea leaves open with specific, surprising choices rather than the most expected ones.

Write everything in the language of the user's idea. Keep the headings below exactly as they are, in English.

The person who will chat with the character is written {{user}}: never give them a name, a look or a past. In the example dialogue, the character's own lines start with {{char}}.

Answer with these sections, each heading on its own line, in this order, and nothing before the first one or after the last one:

### NAME
The character's name only.

### TAGLINE
One short line that sums the character up, under ten words.

### DESCRIPTION
120 to 200 words, in the third person and the present tense: who they are, what they look like, where they come from, what they want, how they speak, how they move, and how they behave with {{user}}. Concrete details, no vague praise.

### PERSONALITY
Four to six traits, one per line. Each trait is followed by one concrete thing the character does that shows it: a habit, a reaction, a small scene with {{user}} or with others. Never a bare adjective: the chat learns how to play a trait from what it does. Written like this:
Trait: what they do that shows it, in one sentence.
Then one last line:
Likes: two or three things. Dislikes: two or three things. Wants: what they want most.

### SCENARIO
One or two sentences: where and when the chat begins, and what brings {{user}} there.

### EXAMPLE DIALOGUE
Two short exchanges that show how the character talks and moves. Each begins with a line that says <START>, then lines that start with {{user}}: and {{char}}: In the character's lines, what they do is told between *asterisks* with detail one can picture: the gesture and how it is made, the hands, the look, the things and the place around them. Never a bare *She smiles.* The chat will copy these lines, their detail and their rhythm: they end in different ways, not each on a question.

### TAGS
Three to five tags on one line, separated by commas.

### LORE
Three to five notes on what belongs to the character's life and may come up later in a chat: the people close to them, the places they know, what happened to them, a secret. One of them is their flaw, fear or darker side: what makes them more than nice. The app shows a note to the character only when one of its keywords is said, so each note has to make sense by itself. One note per line, keywords first, written like this:
keyword, keyword, keyword: The note, one or two sentences in the third person.
Keywords are what someone would say when the subject comes up: names and plain nouns, two to four of them ("sister, Lise, family"). Never a word as common as "she" or "home".

### FIRST MESSAGE
The character's opening message, 80 to 150 words, written as the character: speech in "quotes", and between *asterisks* what the character does, told with detail one can picture (the gesture and how it is made, the body, the objects, the light and the sounds of the place). It sets the scene and leaves {{user}} something to react to: a situation, a gesture, a tension. It does not have to end on a question. It never speaks or acts for {{user}}.

### SECOND GREETING
Another opening message, as long, for a different situation or mood.

Stop there, unless the idea asks for several greetings. In that case write as many as it asks for, up to five openings in all: each one as long, each for yet another situation or mood, under these headings in this order: ### THIRD GREETING, ### FOURTH GREETING, ### FIFTH GREETING.`

/**
 * What the model is told to write under a heading, as the instructions above say it.
 * Used again when it is asked for one part of a card only (see reviewCard.ts).
 */
export function sectionGuide(section: CardSection): string {
  const start = INSTRUCTIONS.indexOf(`### ${section}\n`)
  if (start === -1) return ''
  const text = INSTRUCTIONS.slice(start + section.length + 5)
  const end = text.search(/\n\n(### |Stop there)/)
  return (end === -1 ? text : text.slice(0, end)).trim()
}

/**
 * The messages to send to the model for `idea`.
 * `tastes`: how the user likes to play, when they asked for the card to take it into
 * account ("Use my tastes"). The idea always comes first: tastes only fill what it leaves open.
 * `moods`: what the user asked for with a click or three (see moods.ts).
 * Without an idea ("Surprise me"), the model invents the character.
 */
export function cardRequest(idea: string, tastes?: Tastes, moods: readonly MoodPick[] = []): LlmMessage[] {
  const likes = tastes?.likes ?? []
  const dislikes = tastes?.dislikes ?? []
  const about =
    likes.length + dislikes.length > 0
      ? [
          'About the person who will chat with the character, from their earlier chats:',
          likes.length > 0 && `They enjoy: ${likes.join(', ')}.`,
          dislikes.length > 0 && `They do not enjoy: ${dislikes.join(', ')}.`,
          'Where the idea leaves room, lean that way: in the tone, in the scenario, and above all in how the first message and the example dialogue are written. The idea comes first: when it asks for something they are said not to enjoy, follow the idea. Do not mention these tastes in the card.',
        ]
          .filter(Boolean)
          .join('\n')
      : ''
  const text = idea.trim().slice(0, MAX_IDEA_LENGTH)
  const asked = text ? `The idea: ${text}` : NO_IDEA
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: [asked, moodsSection(moods), about].filter(Boolean).join('\n\n') },
  ]
}

/** What stands for the idea when the user has none. */
const NO_IDEA =
  'There is no idea this time: surprise the person who will chat with the character. Invent someone specific and unexpected, not a stock figure, in a situation that makes one want to answer.'

/** A lorebook note as the model wrote it. */
export interface WrittenNote {
  keys: string[]
  content: string
}

/** What was read from the model's answer. A section that is missing or empty is left out. */
export interface WrittenCard {
  name?: string
  tagline?: string
  description?: string
  personality?: string
  scenario?: string
  exampleMessages?: string
  tags?: string[]
  firstMessage?: string
  /** Notes for the character's lorebook: each is shown to the model when one of its keywords comes up. */
  lore?: WrittenNote[]
  /** The greetings after the first message: one as a rule, up to four when the idea asked for several. */
  otherGreetings?: string[]
  /** The section the answer stops in: the one being written, when the answer is not finished. */
  last: CardSection | null
}

/**
 * Reads the model's answer, finished or not. With `partial`, the answer is still being
 * written: a last line that may turn out to be a heading is left out for now.
 */
export function readWrittenCard(text: string, options: { partial?: boolean } = {}): WrittenCard {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (options.partial && !text.endsWith('\n') && mayBecomeHeading(lines.at(-1) ?? '')) lines.pop()

  const found = new Map<CardSection, string[]>()
  let current = -1
  for (const line of lines) {
    const heading = headingOf(line, current)
    if (heading) {
      current = heading.index
      found.set(SECTIONS[current]!, heading.rest ? [heading.rest] : [])
    } else if (current >= 0) {
      found.get(SECTIONS[current]!)!.push(line)
    }
    // Anything before the first heading ("Sure, here is your character!") is dropped.
  }

  const body = (section: CardSection): string => tidy((found.get(section) ?? []).join('\n'))
  const firstLine = (section: CardSection): string => unwrap(body(section).split('\n')[0] ?? '')

  const card: WrittenCard = { last: current >= 0 ? SECTIONS[current]! : null }
  const texts = {
    name: firstLine('NAME').slice(0, 80),
    tagline: firstLine('TAGLINE').slice(0, 90),
    description: body('DESCRIPTION'),
    personality: personalityOf(body('PERSONALITY')),
    scenario: body('SCENARIO'),
    exampleMessages: examplesOf(body('EXAMPLE DIALOGUE')),
    firstMessage: body('FIRST MESSAGE'),
  }
  for (const [key, value] of Object.entries(texts) as [keyof typeof texts, string][]) {
    if (value) card[key] = value
  }
  const tags = listOf(body('TAGS')).map(asTag).filter(Boolean).slice(0, 5)
  if (tags.length > 0) card.tags = tags
  const lore = notesOf(body('LORE'))
  if (lore.length > 0) card.lore = lore
  const greetings = OTHER_GREETINGS.map(body).filter(Boolean)
  if (greetings.length > 0) card.otherGreetings = greetings
  return card
}

// "Lore" is also written "Lorebook" or "Lore notes".
const NAMES = SECTIONS.map((section) => (section === 'LORE' ? 'LORE(?:BOOK)?(?:\\s+(?:NOTES|ENTRIES))?' : section.replace(' ', '\\s+'))).join('|')
// "### NAME", "**Name**", "NAME:", "## First message: text"…
const HEADING = new RegExp(`^\\s*(#{1,6}\\s*)?(\\*\\*|__)?\\s*(${NAMES})(?![a-z])\\s*(\\*\\*|__)?\\s*(:)?\\s*(\\*\\*|__)?\\s*(.*)$`, 'i')

/** The heading a line is, if it is one that can come after section `current`. */
function headingOf(line: string, current: number): { index: number; rest: string } | null {
  const match = HEADING.exec(line)
  if (!match) return null
  const [, hashes, boldBefore, name = '', boldAfter, colon, boldAfterColon, rest = ''] = match
  const index = SECTIONS.indexOf((/^lore/i.test(name) ? 'LORE' : name.toUpperCase().replace(/\s+/g, ' ')) as CardSection)
  if (index <= current) return null // Sections come in order: this is a word of the text, not a heading.

  // "Personality: shy" may be a sentence of the description. It is a heading when it is
  // marked as one, stands alone on its line, shouts, or is the very section expected next.
  const marked = Boolean(hashes || boldBefore || boldAfter || boldAfterColon)
  const alone = rest.trim() === ''
  const inline = Boolean(colon) && (name === name.toUpperCase() || index === current + 1)
  if (!marked && !alone && !inline) return null
  return { index, rest: rest.trim() }
}

/** True when an unfinished last line could still become a heading once the rest of it arrives. */
function mayBecomeHeading(line: string): boolean {
  const start = line.trim().toUpperCase()
  if (start === '') return false
  if (/^(#|\*\*|__)/.test(start)) return true
  return SECTIONS.some((section) => section.startsWith(start) || start.startsWith(section))
}

/** Trims a section, and takes it out of the code fence some models wrap everything in. */
function tidy(text: string): string {
  return text
    .replace(/^\s*```[a-z]*\s*$/gim, '')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

/** "Elara Voss" from "**Elara Voss**", "'Elara Voss'" or "- Elara Voss". */
function unwrap(text: string): string {
  return text
    .trim()
    .replace(/^[-*•]\s+/, '')
    .replace(/^(\*\*|__|["'“”«»])+|(\*\*|__|["'“”«»])+$/g, '')
    .trim()
}

/**
 * The PERSONALITY section: traits each shown by what the character does ("Loyal: stands up
 * for {{user}}…"), kept one per line; or, as older answers and small models write it,
 * a bare list of traits, kept on one line with commas.
 */
function personalityOf(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim().replace(/^([-*•·]|\d+[.)])\s+/, '').replace(/^(\*\*|__)([^*_:]+)(\*\*|__)\s*:/, '$2:'))
    .filter(Boolean)
  const shown = lines.filter((line) => /^[^:]{1,40}:\s*\S+(\s+\S+){3,}/.test(line))
  return shown.length > 0 ? lines.join('\n') : listOf(text).join(', ')
}

/** The items of a list written on one line with commas, or one per line with dashes. */
function listOf(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((item) => unwrap(item).replace(/\.$/, ''))
    .filter(Boolean)
}

const MAX_NOTES = 6
const MAX_KEYS = 5
const KEYS_LABEL = /^(keywords?|keys?|triggers?|mots[- ]cl[ée]s?)$/i
const NOTE_LABEL = /^(note|content|text|entry)$/i

/**
 * The lorebook notes of the LORE section: "keyword, keyword: the note", one per line.
 * Also read: a list with bullets or numbers, keywords in bold, and the two-line form
 * some models prefer ("Keywords: …" then "Note: …"). A line without keywords carries
 * on the note above it.
 */
function notesOf(text: string): WrittenNote[] {
  const notes: WrittenNote[] = []
  const keysOf = (list: string): string[] => {
    const keys = list
      .split(/[,;/|]/)
      .map((key) => unwrap(key).replace(/[.:]$/, '').trim())
      .filter((key) => key && key.length <= 40)
    return [...new Set(keys)].slice(0, MAX_KEYS)
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^([-*•·]|\d+[.)])\s+/, '')
    if (!line) continue
    const last = notes.at(-1)
    const cut = line.search(/[:：]|\s[→—–-]\s/)
    const left = cut === -1 ? '' : unwrap(line.slice(0, cut))
    const right = cut === -1 ? '' : line.slice(cut).replace(/^[:：]|^\s[→—–-]\s/, '').replace(/^\s*(\*\*|__)\s*/, '').trim()

    if (KEYS_LABEL.test(left)) {
      notes.push({ keys: keysOf(right), content: '' })
    } else if (NOTE_LABEL.test(left) && last && !last.content) {
      last.content = right
    } else if (left && left.length <= 120 && keysOf(left).length > 0 && !/[.!?]/.test(left)) {
      notes.push({ keys: keysOf(left), content: right })
    } else if (last && !/[.!?…"”»*)]$/.test(last.content)) {
      last.content = `${last.content} ${line}`.trim() // The note above, going on to the next line.
    }
  }
  return notes.filter((note) => note.keys.length > 0 && note.content.length >= 8).slice(0, MAX_NOTES)
}

/** "Slow burn" from "#slow burn". */
function asTag(text: string): string {
  const tag = text.replace(/^#+/, '').trim().slice(0, 30)
  return tag.charAt(0).toUpperCase() + tag.slice(1)
}

/** Sample dialogue as the card format wants it: each example starts with a <START> line. */
function examplesOf(text: string): string {
  if (!text) return ''
  return /<START>/i.test(text) ? text : `<START>\n${text}`
}
