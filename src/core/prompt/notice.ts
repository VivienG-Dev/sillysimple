import type { ChatRole } from '@shared/types'
import type { LlmMessage } from './buildMessages'
import { estimateTokens } from './context'
import type { TranscriptLine } from './memory'

// The app adapts to its user (beta, off by default). Two things, each with its own switch:
//
// - Tastes: short tags about how the user likes to play ("slow burn", "dry humour"),
//   and what they do not enjoy. They belong to the user, not to a chat: every character
//   is told about them.
// - The story note: two or three sentences on where one chat's story seems to be heading.
//   It belongs to that chat, and sits next to its memory.
//
// Both are written by the model the app is connected to. Every so often, after a reply,
// it is given the latest messages and answers under headings (### STORY, ### LIKES,
// ### DISLIKES), the format that works for writing cards (see cards/writeCard.ts).
//
// The user stays in charge. The model only ever proposes new tags, a few at a time: it
// never removes or rewords one. The user removes and adds tags, and a tag they removed
// is never proposed again. Tags are about stories and writing, never about the person.

/** What is noted about how the user likes to play. */
export interface Tastes {
  likes: string[]
  dislikes: string[]
}

/** The latest messages are read once the user has written this many since the last time. */
export const NOTICE_AFTER = 8
/** A list of tags never grows past this: beyond it, the user has to make room. */
export const MAX_TAGS = 20
/** At most this many new tags per list each time: tastes are learned little by little. */
export const MAX_NEW_TAGS = 3
export const NOTICE_REPLY_TOKENS = 320
/** Noticing is a matter of fact: little room for invention. */
export const NOTICE_TEMPERATURE = 0.3

const TOKENS_PER_MESSAGE = 4
const STORY_MAX_LENGTH = 600
const TAG_MAX_LENGTH = 32
const TAG_MAX_WORDS = 4

/** Whether the messages written since the last time are enough to read: `roles`, oldest first. */
export function dueForNotice(roles: ChatRole[]): boolean {
  return roles.filter((role) => role === 'user').length >= NOTICE_AFTER
}

/**
 * The newest of `lines` that fit in `room` tokens, in their order. A single message
 * longer than a quarter of the room is shortened: its beginning is what is read.
 */
export function latestLines(lines: TranscriptLine[], room: number): TranscriptLine[] {
  const limit = Math.max(200, room)
  const kept: TranscriptLine[] = []
  let used = 0
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!
    let content = line.content
    if (estimateTokens(content) > limit / 4) content = `${content.slice(0, Math.floor((limit / 4) * 3))} […]`
    const cost = estimateTokens(`${line.name}: ${content}`) + TOKENS_PER_MESSAGE
    if (kept.length > 0 && used + cost > limit) break
    kept.unshift({ name: line.name, content })
    used += cost
  }
  return kept
}

export interface NoticeInput {
  /** The latest messages of the chat, oldest first. */
  lines: TranscriptLine[]
  userName: string
  /** Write the note on where this story is heading. `story`: the note so far. */
  wantStory: boolean
  story: string
  /** Propose new tags. `tastes`: those already noted. `removed`: those the user took out. */
  wantTastes: boolean
  tastes: Tastes
  removed: string[]
}

/** The request that has the model read the latest messages. */
export function noticeRequest(input: NoticeInput): LlmMessage[] {
  const user = input.userName
  const list = (tags: string[]): string => (tags.length > 0 ? tags.join(', ') : '(nothing yet)')

  const sections: string[] = []
  const known: string[] = []

  if (input.wantStory) {
    sections.push(
      `### STORY\nTwo or three plain sentences, in the language of the chat: where this story seems to be heading, and what ${user} seems to want from it now. It is a guess: say it as one. If there is a note so far, bring it up to date rather than starting over.`,
    )
    known.push(`The note on this story so far:\n${input.story.trim() || '(none yet)'}`)
  }

  if (input.wantTastes) {
    sections.push(
      `### LIKES\nUp to ${MAX_NEW_TAGS} tags, separated by commas: what ${user} clearly enjoys, shown by several of their messages. Write "none" when nothing new is clear, which is often the case.`,
      `### DISLIKES\nUp to ${MAX_NEW_TAGS} tags, separated by commas: what ${user} clearly does not enjoy, because they cut it short, complain about it or steer away from it. Write "none" when nothing new is clear.`,
    )
    known.push(
      `Already noted as liked: ${list(input.tastes.likes)}`,
      `Already noted as disliked: ${list(input.tastes.dislikes)}`,
      `Taken out by ${user}, never to be proposed again: ${list(input.removed)}`,
    )
  }

  const aboutTags = input.wantTastes
    ? `\n\nA tag is one to three words, in lowercase, in the language ${user} writes in. It is about the kind of story and of writing they like: tone, pace, genre, kinds of scenes, length and style of replies ("slow burn", "dry humour", "short replies", "mystery"). Never about who ${user} is in real life, and never a fact of this one story, such as a name or a place. Only new tags: none of those already noted, none of those ${user} took out, and nothing that says the same as one of them in other words.`
    : ''

  const instructions = `You watch a roleplay chat from the outside, to help its stories suit the player, ${user}. You are given the latest messages of the chat. ${user}'s own messages matter most: what they ask for, what they come back to, what they cut short or steer away from.

Answer with ${sections.length === 1 ? 'this section, its heading' : 'these sections, each heading'} on its own line, and nothing before or after:

${sections.join('\n\n')}${aboutTags}`

  const transcript = input.lines.map((line) => `${line.name}: ${line.content}`).join('\n\n')
  return [
    { role: 'system', content: instructions },
    { role: 'user', content: `${known.join('\n')}\n\nLatest messages of the chat:\n${transcript}` },
  ]
}

/** What the model answered. A section that is missing or empty gives nothing. */
export interface Noticed {
  story: string
  likes: string[]
  dislikes: string[]
}

type Section = 'STORY' | 'LIKES' | 'DISLIKES'

// A heading: "### LIKES", "**Likes:**", or the bare word in capitals. A sentence that
// merely starts with "Likes" or "Story" is not one.
const MARKED_HEADING = /^\s*(?:#{1,6}\s*|\*\*\s*)(STORY|LIKES|DISLIKES)\b\s*:?\s*(?:\*\*)?\s*:?\s*(.*)$/i
const BARE_HEADING = /^\s*(STORY|LIKES|DISLIKES)\s*:?\s*(.*)$/

/** Reads the model's answer. */
export function readNotice(text: string): Noticed {
  const found: Record<Section, string[]> = { STORY: [], LIKES: [], DISLIKES: [] }
  let current: Section | null = null

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) continue
    const heading = MARKED_HEADING.exec(line) ?? BARE_HEADING.exec(line)
    if (heading) {
      current = heading[1]!.toUpperCase() as Section
      if (heading[2]?.trim()) found[current].push(heading[2])
    } else if (current) {
      found[current].push(line)
    }
  }

  const tagsOf = (lines: string[]): string[] => {
    const tags = lines.flatMap((line) => line.split(/[,;\n]|\s[-•·]\s/)).map(cleanTag)
    return [...new Set(tags.filter(Boolean))]
  }

  let story = found.STORY.join('\n').replace(/\n{2,}/g, '\n').trim()
  if (/^\(?(none|nothing)( yet)?\)?\.?$/i.test(story)) story = ''
  if (story.length > STORY_MAX_LENGTH) story = `${story.slice(0, STORY_MAX_LENGTH - 1).trimEnd()}…`

  return { story, likes: tagsOf(found.LIKES), dislikes: tagsOf(found.DISLIKES) }
}

const NOT_A_TAG = /^(none|nothing|nothing new|n\/?a|no new tags?|aucun|aucune|rien|-+)$/

/** A tag as it is kept: lowercase, without the bullet, quotes or full stop around it. Empty when it is not one. */
export function cleanTag(raw: string): string {
  const tag = raw
    .trim()
    .replace(/^[-*•·\d.)\s]+/, '')
    .replace(/^["'“”‘’«»(\s]+|["'“”‘’«»).\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (!tag || NOT_A_TAG.test(tag)) return ''
  if (tag.length > TAG_MAX_LENGTH || tag.split(' ').length > TAG_MAX_WORDS) return '' // A sentence, not a tag.
  return tag
}

/**
 * Adds what the model proposed to what is noted. A tag already noted on either side, or
 * taken out by the user, is left alone; so is everything past the limits.
 * `added`: what is new, to tell the user.
 */
export function addTastes(current: Tastes & { removed: string[] }, proposed: Tastes): Tastes & { added: Tastes } {
  const taken = new Set([...current.likes, ...current.dislikes, ...current.removed].map((tag) => tag.toLowerCase()))

  const grow = (list: string[], candidates: string[]): { list: string[]; added: string[] } => {
    const added: string[] = []
    for (const candidate of candidates) {
      const tag = cleanTag(candidate)
      if (!tag || taken.has(tag)) continue
      if (added.length >= MAX_NEW_TAGS || list.length + added.length >= MAX_TAGS) break
      taken.add(tag)
      added.push(tag)
    }
    return { list: [...list, ...added], added }
  }

  const likes = grow(current.likes, proposed.likes)
  const dislikes = grow(current.dislikes, proposed.dislikes)
  return { likes: likes.list, dislikes: dislikes.list, added: { likes: likes.added, dislikes: dislikes.added } }
}

/** The part of the system message that tells a character how the user likes to play. */
export function tastesSection(tastes: Tastes | undefined): string {
  const likes = tastes?.likes ?? []
  const dislikes = tastes?.dislikes ?? []
  if (likes.length === 0 && dislikes.length === 0) return ''
  return [
    'How {{user}} likes to play, noticed over earlier chats. Take it into account without forcing it, and keep surprising them.',
    likes.length > 0 && `Enjoys: ${likes.join(', ')}.`,
    dislikes.length > 0 && `Does not enjoy: ${dislikes.join(', ')}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** The part of the system message that says where the story of this chat seems to be heading. */
export function storySection(note: string | undefined): string {
  const text = note?.trim() ?? ''
  return text && `Where this story seems to be heading (a guess: if {{user}} goes another way, follow them):\n${text}`
}
