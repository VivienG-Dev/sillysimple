import type { Character, ChatRole, Persona, SceneDirection } from '@shared/types'
import { activateLorebook } from './lorebook'
import { directionCue, GO_ON_CUE, OPEN_CUE } from './direction'
import { applyMacros } from './macros'
import { memorySection } from './memory'
import { storySection, tastesSection, type Tastes } from './notice'
import { steadyNote } from './place'
import { CONTINUE_CUE, lengthInstruction } from './replyLength'
import { sceneHistory, sceneInstructions, type SceneMember, type SceneMessage } from './scene'

export interface LlmMessage {
  role: 'system' | ChatRole
  content: string
}

export interface BuildMessagesInput {
  character: Character
  persona: Pick<Persona, 'name' | 'description'>
  /** The app's own system prompt (Settings > Generation). */
  systemPrompt: string
  history: SceneMessage[]
  /**
   * The other characters of the chat, when it has several. `character` is then the
   * one who speaks now. See scene.ts.
   */
  others?: SceneMember[]
  /** Follow the instructions the card brings, when it has some. Default: yes. */
  useCardPrompts?: boolean
  /** The model's context size. Only used to keep the lorebook to a fair share of it. */
  contextSize?: number
  /** The "Reply length" setting, in tokens: the model is told to aim for it. Left out: it is not told. */
  replyLength?: number
  /** The last reply was cut short and the model is asked to write the rest of it. */
  continuing?: boolean
  /** A stage direction for the reply to write: something happens, the scene moves, time passes. See direction.ts. */
  direction?: SceneDirection
  /** For "something happens": the kinds of thing it may be, drawn by the caller (see `pickEvents`). */
  events?: readonly number[]
  /**
   * What is remembered of the chat's oldest messages (see memory.ts). `history` then
   * holds only the messages that come after them.
   */
  memory?: string
  /** Where the story of this chat seems to be heading, when the app keeps such a note. See notice.ts. */
  story?: string
  /** How the user likes to play, when the app learns it. */
  tastes?: Tastes
  /**
   * Keep the scene where it is (see place.ts): the place it is in, or null when the app
   * does not know it yet. Left out: the model is told nothing about staying put.
   */
  place?: string | null
  /** What the character who speaks is wearing, when the app knows: it is told to keep it on until the story changes it. */
  outfit?: string | null
  /** Lorebook entries of `character` called by what the chat means (see loreMeaning.ts), by their places in its list. */
  loreByMeaning?: ReadonlySet<number>
}

/** A lorebook may take up to this share of the model's context. */
const LORE_SHARE = 0.25

/**
 * Turns a character card and a conversation into the message list sent to the model:
 * one system message (instructions + card + persona), then the conversation.
 */
export function buildMessages(input: BuildMessagesInput): LlmMessage[] {
  const { character, persona, history } = input
  const others = input.others ?? []
  const useCardPrompts = input.useCardPrompts ?? true
  const context = { char: character.name, user: persona.name, persona: persona.description }
  const fill = (text: string): string => applyMacros(text, context)

  // A card can bring its own instructions. They take the place of the app's system
  // prompt; a card that only wants to add to it writes {{original}} where it goes.
  const cardPrompt = useCardPrompts ? character.systemPrompt.trim() : ''
  const instructions = cardPrompt ? cardPrompt.replace(ORIGINAL, () => input.systemPrompt) : input.systemPrompt

  const lore = activateLorebook(
    character.lorebook,
    history.map((message) => message.content),
    { macros: context, tokenBudget: Math.floor((input.contextSize ?? 8192) * LORE_SHARE), byMeaning: input.loreByMeaning },
  )

  const sections = [
    instructions,
    ...lore.before,
    character.description,
    character.personality && `{{char}}'s personality: ${character.personality}`,
    character.scenario && `Scenario: ${character.scenario}`,
    ...lore.after,
    examplesOf(character.exampleMessages),
    persona.description && `About {{user}}: ${persona.description}`,
    others.length > 0 ? sceneInstructions(others, persona.name) : '',
    memorySection(input.memory ?? ''),
    storySection(input.story),
    tastesSection(input.tastes),
    input.replyLength ? lengthInstruction(input.replyLength) : '',
  ]

  const system = sections
    .filter((section): section is string => Boolean(section?.trim()))
    .map((section) => fill(section.trim()))
    .join('\n\n')

  // With one character the conversation is sent as it is. With several it is told from
  // the side of the one who speaks, with the names of the others on their lines.
  const conversation: LlmMessage[] =
    others.length > 0 ? sceneHistory(history, character, others, persona.name) : plainHistory(history)

  // What the reply answers. A model needs a message of the user to answer: when the
  // character spoke last (or no one has yet), a note in brackets stands for it. It says
  // to write the rest of a reply that was cut short, to follow a stage direction, or
  // just to go on. A direction given along with a message of the user goes at its end.
  const direction = input.direction && !input.continuing ? directionCue(input.direction, { events: input.events, tastes: tastesSection(input.tastes) !== '' }) : ''
  const ending = conversation.at(-1)
  if (ending?.role === 'user') {
    if (direction) ending.content = `${ending.content}\n\n${direction}`
  } else {
    const cue = input.continuing ? CONTINUE_CUE : direction || (ending ? GO_ON_CUE : OPEN_CUE)
    conversation.push({ role: 'user', content: cue })
  }

  // The scene stays where it is and the character keeps its clothes: said last, where it
  // weighs most. A reply asked to move the scene is not told to stay put, and one asked
  // to jump ahead in time is told neither (the two would contradict each other); the
  // rest of a reply is already somewhere, dressed somehow.
  if (!input.continuing) {
    const note = steadyNote({
      place: input.direction === 'place' || input.direction === 'time' ? undefined : input.place,
      outfit: input.direction === 'time' ? undefined : input.outfit,
    })
    const asked = conversation.at(-1)!
    if (note) asked.content = `${asked.content}\n\n${note}`
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    ...conversation.map((message) => ({ role: message.role, content: fill(message.content) })),
  ]

  // Some cards want a reminder placed after the conversation, where the model reads
  // it last. It is added to the user's last message and not sent as a message of its
  // own: many local models refuse a system message in the middle of a chat.
  const reminder = useCardPrompts ? fill(character.postHistoryInstructions.replace(ORIGINAL, '')).trim() : ''
  const last = messages.at(-1)
  if (reminder && last?.role === 'user') last.content = `${last.content}\n\n${reminder}`

  return messages
}

/**
 * The conversation as it is. Messages in a row from the same side (the character went on
 * by itself, or the user wrote twice) are joined into one: many local models insist on
 * strict user / assistant turns.
 */
function plainHistory(history: SceneMessage[]): LlmMessage[] {
  const told: LlmMessage[] = []
  for (const message of history) {
    const previous = told.at(-1)
    if (previous?.role === message.role) previous.content = `${previous.content}\n\n${message.content}`
    else told.push({ role: message.role, content: message.content })
  }
  return told
}

const ORIGINAL = /\{\{\s*original\s*\}\}/gi

/** Cards separate their sample dialogues with <START> markers; the model only needs the text. */
function examplesOf(exampleMessages: string): string {
  const examples = exampleMessages
    .split(/<START>/i)
    .map((example) => example.trim())
    .filter(Boolean)
    .join('\n\n')
  return examples && `Examples of how {{char}} talks:\n${examples}`
}
