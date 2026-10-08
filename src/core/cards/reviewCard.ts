import type { LlmMessage } from '@core/prompt/buildMessages'
import type { ReviewedCard } from '@shared/types'
import { CARD_TEMPERATURE, sectionGuide, type CardSection } from './writeCard'

// Advice on a character that already exists. Two halves:
//
// - reviewCard looks at a card and says what would make it better, in plain words.
//   No model is asked: it is a handful of checks on what the card holds, so the
//   advice is instant and shows as the user types.
// - improveRequest has the model write the one part a piece of advice is about, so
//   that it fits the rest of the card. The answer comes in the same headed format as
//   a whole card (see writeCard.ts) and is read by readWrittenCard.

export type { ReviewedCard }

export const TIP_IDS = [
  'greeting-missing',
  'description-missing',
  'description-short',
  'examples-missing',
  'greeting-short',
  'greeting-question',
  'lore-missing',
  'description-long',
  'greeting-single',
] as const
export type TipId = (typeof TIP_IDS)[number]

export function isTipId(value: unknown): value is TipId {
  return TIP_IDS.includes(value as TipId)
}

export interface CardTip {
  id: TipId
  /** "important": the character does not work well without it. "idea": it would be better with it. */
  level: 'important' | 'idea'
  title: string
  detail: string
  /** What the button that has the model do it says. Missing when there is nothing for the model to write. */
  fixLabel?: string
}

/** Below this many words a description gives the model too little to go on… */
const THIN_DESCRIPTION = 60
/** …and below this many, hardly anything at all: that one matters. */
const BARE_DESCRIPTION = 20
/** Above this many, it weighs on every reply. */
const LONG_DESCRIPTION = 700
const SHORT_GREETING = 25
/** What the size of a long description is compared with: a common context, in words. */
const COMMON_CONTEXT_WORDS = 5300

/**
 * How long a text is, in words. Chinese, Japanese and Korean are written without
 * spaces: each of their characters counts for a good half word.
 */
export function wordsIn(text: string): number {
  const dense = text.match(/[぀-ヿ㐀-鿿가-힯]/g)?.length ?? 0
  const spaced = text.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return Math.round(spaced + dense * 0.6)
}

/** True when a message ends on a question, whatever closes it afterwards (a quote, an asterisk…). */
function endsOnQuestion(text: string): boolean {
  return /[?？][\s"'”’»*)_\]]*$/.test(text.trim())
}

/** What would make this card better, the most important first. Empty when nothing stands out. */
export function reviewCard(card: ReviewedCard): CardTip[] {
  const name = card.name.trim() || 'the character'
  const tips: CardTip[] = []
  const description = wordsIn(card.description)
  const greeting = wordsIn(card.firstMessage)

  if (greeting === 0) {
    tips.push({
      id: 'greeting-missing',
      level: 'important',
      title: 'No opening message',
      detail: `Every chat with ${name} starts blank, and you have to speak first. An opening message also sets the tone and the length of the replies.`,
      fixLabel: 'Write one',
    })
  }
  if (description === 0) {
    tips.push({
      id: 'description-missing',
      level: 'important',
      title: 'No description',
      detail: `The description is what the model reads first to know who ${name} is. Without one, it makes the character up as it goes.`,
      fixLabel: 'Write one',
    })
  } else if (description < THIN_DESCRIPTION) {
    tips.push({
      id: 'description-short',
      level: description < BARE_DESCRIPTION ? 'important' : 'idea',
      title: 'The description is thin',
      detail: `About ${description} words. With so little to go on, the model fills the gaps differently from one chat to the next.`,
      fixLabel: 'Write a fuller one',
    })
  }

  if (!card.exampleMessages.trim()) {
    tips.push({
      id: 'examples-missing',
      level: 'idea',
      title: 'No example dialogue',
      detail: `A few sample lines are the surest way to set how ${name} talks and moves: the model copies their style.`,
      fixLabel: 'Write some',
    })
  }
  if (greeting > 0 && greeting < SHORT_GREETING) {
    tips.push({
      id: 'greeting-short',
      level: 'idea',
      title: 'The opening message is very short',
      detail: `About ${greeting} words. Replies tend to copy the length of the first message.`,
      fixLabel: 'Write a fuller one',
    })
  } else if (greeting > 0 && endsOnQuestion(card.firstMessage)) {
    tips.push({
      id: 'greeting-question',
      level: 'idea',
      title: 'The opening message ends on a question',
      detail: `Replies copy the habits of the first message: ${name} will tend to end every reply on a question.`,
      fixLabel: 'Rewrite the ending',
    })
  }
  if (card.loreCount === 0) {
    tips.push({
      id: 'lore-missing',
      level: 'idea',
      title: 'No lorebook notes',
      detail: `The people, places and past of ${name} are made up on the spot, and can change from one chat to the next. A few notes keep them the same, and the model only reads one when the chat comes to it.`,
      fixLabel: 'Write a few',
    })
  }
  if (description > LONG_DESCRIPTION) {
    const share = Math.round((description / COMMON_CONTEXT_WORDS) * 100)
    tips.push({
      id: 'description-long',
      level: 'idea',
      title: 'The description is very long',
      detail: `About ${description} words, sent with every reply: roughly ${share}% of what a model with an 8k context can read. Facts that only matter now and then can move to lorebook notes.`,
    })
  }
  if (greeting > 0 && card.alternateGreetings.every((text) => !text.trim())) {
    tips.push({
      id: 'greeting-single',
      level: 'idea',
      title: 'Only one opening',
      detail: 'A second opening message lets a new chat start somewhere else. You pick between them with the arrows under the first message.',
      fixLabel: 'Write another',
    })
  }

  return [...tips.filter((tip) => tip.level === 'important'), ...tips.filter((tip) => tip.level === 'idea')]
}

// --- Having the model write the missing part ---------------------------------------

/** What the model writes for a piece of advice, and what it is told about why. */
const FIXES: Partial<Record<TipId, { sections: CardSection[]; why: string }>> = {
  'greeting-missing': { sections: ['FIRST MESSAGE'], why: 'The card has no opening message. Write one.' },
  'description-missing': {
    sections: ['DESCRIPTION'],
    why: 'The card has no description. Write one from what the rest of the card shows: the name, the greetings, the examples.',
  },
  'description-short': {
    sections: ['DESCRIPTION'],
    why: 'The description is thin. Write a fuller one: keep every fact it gives, and add what is missing in the same spirit.',
  },
  'examples-missing': { sections: ['EXAMPLE DIALOGUE'], why: 'The card has no example dialogue. Write some.' },
  'greeting-short': {
    sections: ['FIRST MESSAGE'],
    why: 'The opening message is very short, and the chat copies its length. Write it again, fuller: the same scene, and its own words where they still fit.',
  },
  'greeting-question': {
    sections: ['FIRST MESSAGE'],
    why: 'The opening message ends on a question, and the chat copies that habit. Write it again: the same scene and the same content, but ending on an action, a statement or a silence.',
  },
  'lore-missing': {
    sections: ['LORE'],
    why: 'The card has no lorebook. Write its notes from what the card says and implies; invent only what fits.',
  },
  'greeting-single': {
    sections: ['SECOND GREETING'],
    why: 'The card has a single opening message. Write a second one, for a different situation or mood than the first.',
  },
}

/** The parts of a card the model writes for this piece of advice. Empty when there is nothing for it to write. */
export function fixSections(tip: TipId): CardSection[] {
  return FIXES[tip]?.sections ?? []
}

/** How many tokens the model may write for a fix: one part of a card, with room to end it. */
export const IMPROVE_REPLY_TOKENS = 800
export const IMPROVE_TEMPERATURE = CARD_TEMPERATURE

const MAX_FIELD_LENGTH = 6000

/** The request that has the model write the part of `card` a piece of advice is about. Null when there is none. */
export function improveRequest(card: ReviewedCard, tip: TipId): LlmMessage[] | null {
  const fix = FIXES[tip]
  if (!fix) return null

  const instructions = `You improve character cards for a roleplay chat app. You are given a card as it is, and asked for one part of it. Write only that part, so that it belongs with the rest: the same character, the same facts, the same tone. Never contradict the card.

Write in the language of the card. Keep the heading below exactly as it is, in English.

The person who will chat with the character is written {{user}}: never give them a name, a look or a past. In an example dialogue, the character's own lines start with {{char}}.

Answer with ${fix.sections.length === 1 ? 'this section, its heading' : 'these sections, each heading'} on its own line, and nothing before or after:

${fix.sections.map((section) => `### ${section}\n${sectionGuide(section)}`).join('\n\n')}`

  const field = (label: string, text: string, inline = false): string => {
    const value = text.trim().slice(0, MAX_FIELD_LENGTH) || '(none)'
    return inline || value === '(none)' ? `${label}: ${value}` : `${label}:\n${value}`
  }
  const others = card.alternateGreetings.filter((text) => text.trim()).length
  const known = [
    field('Name', card.name, true),
    field('Tagline', card.tagline, true),
    field('Description', card.description),
    field('Personality', card.personality, true),
    field('Scenario', card.scenario, true),
    field('Example dialogue', card.exampleMessages),
    field('First message', card.firstMessage),
    `Other opening messages: ${others}`,
    `Lorebook: ${card.loreKeys?.length ? `notes about ${card.loreKeys.slice(0, 30).join(', ')}` : card.loreCount > 0 ? `${card.loreCount} notes` : '(none)'}`,
  ]

  return [
    { role: 'system', content: instructions },
    { role: 'user', content: `The card as it is:\n\n${known.join('\n\n')}\n\nWhat to do: ${fix.why}` },
  ]
}
