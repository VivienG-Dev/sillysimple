import type { LlmMessage } from '@core/prompt/buildMessages'
import type { Tastes } from '@core/prompt/notice'
import type { Character, MoodPick } from '@shared/types'
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

/** How many tokens the model may write: a full card is around twelve hundred, and each greeting asked for on top adds some two hundred. */
export const CARD_REPLY_TOKENS = 3500
/** A little above the chat's default: a character should not be the most expected one. */
export const CARD_TEMPERATURE = 0.9
/** How long the idea in "Describe your character" may be: room for a detailed brief (about 2,500 tokens), still small next to the card it asks for. */
export const MAX_IDEA_LENGTH = 8000

const INSTRUCTIONS = `You write character cards for a roleplay chat app. The user gives you an idea, sometimes only a few words; you turn it into a complete, vivid character who is fun to talk to. Fill in what the idea leaves open with specific, surprising choices rather than the most expected ones.

Write everything in the language of the user's idea. Keep the headings below exactly as they are, in English.

The person who will chat with the character is written {{user}}: never give them a name, a look or a past. In the example dialogue, the character's own lines start with {{char}}.

Answer with these sections, each heading on its own line, in this order, and nothing before the first one or after the last one:

### NAME
The character's name only.

### TAGLINE
One short line that sums the character up, under ten words.

### DESCRIPTION
220 to 320 words, in the third person and the present tense, in these parts, each starting on a new line, in this order:
- One first sentence: the name, the age as a number, what they are or do.
- Appearance: then three or four features, one per line, the one noticed first first. Each is written "Feature: what it looks like, and what it does or gives away when they feel something" (hair twisted round a finger when nervous, a scar hidden under a sleeve). The body as it plays in the story, not a list of measurements.
- Voice: how they speak (the words they choose, their rhythm, a habit of speech) and how they move.
- Past: three or four sentences on where they come from and what shaped them, ending on what is still unresolved.
- With {{user}}: how they behave with {{user}}, what they want from them, and one thing they keep from them.
Concrete details, no vague praise. Their traits come in the next section: do not list them here.

### PERSONALITY
Five to seven traits, one per line. Each trait is followed by one concrete thing the character does that shows it: a habit, a reaction, a small scene with {{user}} or with others. Never a bare adjective: the chat learns how to play a trait from what it does. Written like this:
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
 * `greetings`: how many openings the user asked for with the buttons, the first message
 * included (1 to MAX_GREETINGS); without it, two, or as many as the idea asks.
 * `story`: an existing character whose story the new one belongs to. `format`: a card whose
 * layout the new one is written in ("Written like…"); without one, the app's own format.
 */
export function cardRequest(
  idea: string,
  tastes?: Tastes,
  moods: readonly MoodPick[] = [],
  story?: StorySource,
  format?: FormatSource,
  greetings?: number,
): LlmMessage[] {
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
  const asked = text ? `The idea: ${text}` : story ? noIdeaIn(story.name) : NO_IDEA
  return [
    { role: 'system', content: withGreetings(format ? instructionsLike(format) : INSTRUCTIONS, greetings) },
    {
      role: 'user',
      content: [format && formatSection(format), story && storySection(story), asked, moodsSection(moods), about, greetingsSection(greetings)]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

// --- "Part of someone's story" ------------------------------------------------------
// A new character written from the story of one the user already has: her mother, his
// rival, the friend she keeps mentioning. The model gets that character's card (what makes
// the story: who they are, the situation, the opening, the lorebook) and writes someone
// else who lives in it, without contradicting it.

/** What is read of the existing character. Their {{char}} is already their name. */
export interface StorySource {
  name: string
  tagline: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  /** Their lorebook notes, the ones in use. */
  notes: string[]
}

/** Room for each part of the card, in characters: about 2,500 tokens in all, so the request still fits an 8k model. */
const STORY_ROOM = { description: 3000, personality: 1000, scenario: 800, firstMessage: 1000, notes: 2000 }

/** The parts of `character` a related character is written from. */
export function storyOf(character: Pick<Character, 'name' | 'tagline' | 'description' | 'personality' | 'scenario' | 'firstMessage' | 'lorebook'>): StorySource {
  const name = character.name.trim() || 'the other character'
  const named = (text: string): string => text.replace(/\{\{\s*(char|bot)\s*\}\}|<(BOT|CHAR)>/gi, name).trim()
  return {
    name,
    tagline: named(character.tagline),
    description: named(character.description),
    personality: named(character.personality),
    scenario: named(character.scenario),
    firstMessage: named(character.firstMessage),
    notes: (character.lorebook?.entries ?? []).filter((entry) => entry.enabled && entry.content.trim()).map((entry) => named(entry.content)),
  }
}

const cut = (text: string, room: number): string => (text.length > room ? `${text.slice(0, room).trimEnd()}…` : text)

/** The existing character's card, and what the new one must do with it. */
export function storySection(story: StorySource): string {
  const { name } = story
  const parts = [
    story.tagline && `In one line: ${story.tagline}`,
    story.description && `Description:\n${cut(story.description, STORY_ROOM.description)}`,
    story.personality && `Personality:\n${cut(story.personality, STORY_ROOM.personality)}`,
    story.scenario && `Scenario:\n${cut(story.scenario, STORY_ROOM.scenario)}`,
    story.firstMessage && `How their chats open:\n${cut(story.firstMessage, STORY_ROOM.firstMessage)}`,
    story.notes.length > 0 && `What else is known of their life:\n${cut(story.notes.map((note) => `- ${note}`).join('\n'), STORY_ROOM.notes)}`,
  ].filter(Boolean)
  return [
    `This new character belongs to the story of a character who already exists: ${name}. Here is ${name}'s card.`,
    `<${name}'s card>\n${parts.join('\n\n')}\n</${name}'s card>`,
    [
      `Write someone else, who lives in that same story: a different person from ${name}, with a voice of their own.`,
      `Keep every fact of ${name}'s story as it is: names, places, the past, and how things stand between ${name} and {{user}}. Add to it, never contradict it, and do not move it on: the new character's scenario and first message happen in the same world, at a time that fits it.`,
      `Call ${name} by name everywhere: {{char}} is the new character, never ${name}. {{user}} is the same person as in ${name}'s story, unless the idea says otherwise.`,
      `Say in the description who the new character is to ${name}, and how each sees the other. One of the lorebook notes is about ${name}, with "${name}" among its keywords, as the new character knows them.`,
      `Write in the language of ${name}'s card, unless the idea is written in another one, and in a style that sits well next to it, without copying its sentences.`,
      `When either character is under 18, nothing romantic or sexual between the two of them, nor involving the younger one with anyone.`,
    ].join(' '),
  ].join('\n\n')
}

/** What stands for the idea, in someone's story, when the user has none. */
const noIdeaIn = (name: string): string =>
  `There is no idea this time: choose someone from ${name}'s story who would be good to meet, someone their card mentions or hints at, and make them specific and unexpected.`

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

// --- "Written like…": the format of a card the user likes --------------------------
// Card writers have their own layouts: bracketed lists ("Hair: ("Brunette" + "long")"),
// W++, plain prose, headed sections. The user picks a card whose layout they like and
// the new character is written in it, field by field: the same labels, brackets and
// lengths, nothing of what the card says. A field the example leaves empty is written
// the app's own way. The answer keeps the app's headings, so it is read as any other.

/** A card's fields, as the format to follow. Its character's name is replaced by {{char}}. */
export interface FormatSource {
  description: string
  personality: string
  scenario: string
  exampleMessages: string
  firstMessage: string
  /** The greetings after the first one, for their layout too. Only whether there are some matters. */
  hasOtherGreetings: boolean
  notes: string[]
}

/** Room for each field of the example, in characters: enough to see its layout, about 3,000 tokens in all. */
const FORMAT_ROOM = { description: 4000, personality: 1500, scenario: 600, exampleMessages: 1800, firstMessage: 1800, notes: 1000 }

/** The parts of `character` a card is written like. Their name, and first name, become {{char}}: never copied. */
export function formatOf(
  character: Pick<Character, 'name' | 'description' | 'personality' | 'scenario' | 'exampleMessages' | 'firstMessage' | 'alternateGreetings' | 'lorebook'>,
): FormatSource {
  const names = [character.name.trim(), ...character.name.trim().split(/\s+/).filter((word) => word.length > 2)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = names.length > 0 ? new RegExp(`\\b(?:${names.join('|')})\\b`, 'g') : null
  const unnamed = (text: string): string => {
    const trimmed = text.replace(/<(BOT|CHAR)>/gi, '{{char}}').trim()
    return pattern ? trimmed.replace(pattern, '{{char}}') : trimmed
  }
  return {
    description: unnamed(character.description),
    personality: unnamed(character.personality),
    scenario: unnamed(character.scenario),
    exampleMessages: unnamed(character.exampleMessages),
    firstMessage: unnamed(character.firstMessage),
    hasOtherGreetings: character.alternateGreetings.some((text) => text.trim()),
    notes: (character.lorebook?.entries ?? []).filter((entry) => entry.content.trim()).map((entry) => unnamed(entry.content)),
  }
}

/** The example card, under the names its parts have in the answer. */
export function formatSection(format: FormatSource): string {
  const part = (heading: string, text: string, room: number): string | false =>
    Boolean(text) && `[${heading}]\n${text.length > room ? `${text.slice(0, room).trimEnd()}\n[…]` : text}`
  const parts = [
    part('DESCRIPTION', format.description, FORMAT_ROOM.description),
    part('PERSONALITY', format.personality, FORMAT_ROOM.personality),
    part('SCENARIO', format.scenario, FORMAT_ROOM.scenario),
    part('EXAMPLE DIALOGUE', format.exampleMessages, FORMAT_ROOM.exampleMessages),
    part('LORE', format.notes.slice(0, 4).join('\n'), FORMAT_ROOM.notes),
    part('FIRST MESSAGE', format.firstMessage, FORMAT_ROOM.firstMessage),
  ].filter(Boolean)
  return [
    'The example card, for its format only. Its character is someone else: nothing of who they are goes into the new card.',
    `<example card>\n${parts.join('\n\n')}\n</example card>`,
  ].join('\n\n')
}

/** What the example has in each part: the system message says to follow it there, and the app's way elsewhere. */
function instructionsLike(format: FormatSource): string {
  const head = INSTRUCTIONS.slice(0, INSTRUCTIONS.indexOf('Answer with these sections'))
  const like = (field: string, text: string, section: CardSection): string =>
    text
      ? `Laid out and written like the example's ${field}: the same labels, brackets, lists or prose, the same kind of detail, about as long. Only the layout and the way of writing are the example's.`
      : sectionGuide(section)
  const sections: [CardSection, string][] = [
    ['NAME', sectionGuide('NAME')],
    ['TAGLINE', sectionGuide('TAGLINE')],
    ['DESCRIPTION', like('description', format.description, 'DESCRIPTION')],
    ['PERSONALITY', like('personality', format.personality, 'PERSONALITY')],
    ['SCENARIO', like('scenario', format.scenario, 'SCENARIO')],
    ['EXAMPLE DIALOGUE', like('example dialogue', format.exampleMessages, 'EXAMPLE DIALOGUE')],
    ['TAGS', sectionGuide('TAGS')],
    [
      'LORE',
      `${sectionGuide('LORE')}${format.notes.length > 0 ? ' The note itself is written like the example\'s notes.' : ''}`,
    ],
    ['FIRST MESSAGE', like('first message', format.firstMessage, 'FIRST MESSAGE')],
    ['SECOND GREETING', format.firstMessage ? 'Another opening message, written the same way and as long, for a different situation or mood.' : sectionGuide('SECOND GREETING')],
  ]
  return `${head}This time the card follows the format of an example card, given with the idea: write each part the way the same part of the example is laid out and written. Take nothing of what it says: the new character is someone else, with their own name, looks, past, people and places. Where the example says {{char}}, it means its own character: write the new character's details there.

Answer with these sections, each heading on its own line, in this order, and nothing before the first one or after the last one:

${sections.map(([section, guide]) => `### ${section}\n${guide}`).join('\n\n')}

${INSTRUCTIONS.slice(INSTRUCTIONS.indexOf('Stop there'))}`
}

// --- How many openings -------------------------------------------------------------

/** The most openings a written card can have: the first message and four more (SECOND to FIFTH GREETING). */
export const MAX_GREETINGS = 5
const GREETING_HEADINGS = ['FIRST MESSAGE', 'SECOND GREETING', 'THIRD GREETING', 'FOURTH GREETING', 'FIFTH GREETING']

/** The line that says how many openings to write, when the user chose. It goes last, where it is read last. */
export function greetingsSection(greetings?: number): string {
  if (greetings === undefined || !Number.isInteger(greetings)) return ''
  const count = Math.min(MAX_GREETINGS, Math.max(1, greetings))
  if (count === 1) return 'Openings: write the first message only, and no other greeting: end the answer after ### FIRST MESSAGE.'
  const headings = GREETING_HEADINGS.slice(0, count).map((heading) => `### ${heading}`)
  return `Openings: write exactly ${count} of them, whatever the idea says: ${headings.join(', ')}. Each one as long as the first, each for another situation or mood.`
}

/**
 * The instructions with the openings the user chose written into them: the list of
 * headings ends with exactly that many, and "stop there unless the idea asks for more"
 * is gone, so the two never pull against each other. Without a choice, as they are.
 */
function withGreetings(instructions: string, greetings?: number): string {
  if (greetings === undefined || !Number.isInteger(greetings)) return instructions
  const count = Math.min(MAX_GREETINGS, Math.max(1, greetings))
  const start = instructions.lastIndexOf('### SECOND GREETING')
  if (start === -1) return instructions
  const others = GREETING_HEADINGS.slice(1, count).map(
    (heading) => `### ${heading}\nAnother opening message, written like the first one and as long, for a different situation or mood than the ones before.`,
  )
  const end =
    count === 1
      ? 'Stop after the first message: this card has no other greeting.'
      : `Stop after ### ${GREETING_HEADINGS[count - 1]}: the card has exactly ${count} openings, the first message included.`
  return `${instructions.slice(0, start)}${[...others, end].join('\n\n')}`
}

/** Room for the answer: a full card, and some two hundred tokens more for each opening past the second. */
export function cardReplyTokens(greetings?: number): number {
  const count = greetings === undefined ? 2 : Math.min(MAX_GREETINGS, Math.max(1, greetings))
  return CARD_REPLY_TOKENS + Math.max(0, count - 2) * 300
}
