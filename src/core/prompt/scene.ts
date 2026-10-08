import type { Character, ChatRole } from '@shared/types'
import { applyMacros } from './macros'
import type { LlmMessage } from './buildMessages'

// A scene is a chat with several characters. The model still writes one reply at a
// time, as one character (the "speaker"), with that character's whole card. What
// changes is how the rest of the cast reaches it:
//
// - The other characters are introduced in one line each, so the model knows who is
//   in the room without reading (and mixing up) several full cards.
// - The conversation is told from the speaker's side. Its own past lines are the
//   "assistant" turns. Everything else, the user's lines and the other characters',
//   goes in the "user" turns with the name of who said it. That keeps the strict
//   user / assistant alternation that many local models insist on.

/** What the speaker is told about another character of the scene. */
export type SceneMember = Pick<Character, 'id' | 'name' | 'tagline' | 'description'>

export interface SceneMessage {
  role: ChatRole
  content: string
  /** The name it was written under. */
  author?: string
  /** For replies: the character who wrote it. */
  characterId?: string
}

const SUMMARY_MAX = 200

/** One line about a character: its tagline, or else the start of its description. */
export function summarize(member: SceneMember, userName: string): string {
  const source = member.tagline.trim() || member.description.trim().split(/\r?\n/)[0] || ''
  const text = applyMacros(source, { char: member.name, user: userName }).trim()
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : text
}

/** The paragraph of the system message that sets the scene. `{{char}}` and `{{user}}` are filled in by the caller. */
export function sceneInstructions(others: SceneMember[], userName: string): string {
  const cast = others.map((member) => {
    const summary = summarize(member, userName)
    return summary ? `- ${member.name}: ${summary}` : `- ${member.name}`
  })
  return [
    'This is a scene with several characters. Also present:',
    ...cast,
    "Write only {{char}}'s next reply. Do not write lines or actions for {{user}} or for the other characters.",
  ].join('\n')
}

/**
 * Tells the conversation from the speaker's side: its own lines as "assistant", all the
 * others as "user" with the name of who said them. Lines in a row from the same side
 * are joined into one message.
 */
export function sceneHistory(
  messages: SceneMessage[],
  speaker: SceneMember,
  others: SceneMember[],
  userName: string,
): LlmMessage[] {
  const nameOf = (message: SceneMessage): string => {
    if (message.role === 'user') return message.author ?? userName
    return others.find((member) => member.id === message.characterId)?.name ?? message.author ?? 'Someone'
  }

  const told: LlmMessage[] = []
  for (const message of messages) {
    const own = message.role === 'assistant' && message.characterId === speaker.id
    const turn: LlmMessage = own
      ? { role: 'assistant', content: message.content }
      : { role: 'user', content: `${nameOf(message)}: ${message.content}` }

    const previous = told.at(-1)
    if (previous?.role === turn.role) previous.content = `${previous.content}\n\n${turn.content}`
    else told.push(turn)
  }
  // When the speaker spoke last, this ends on its own line: buildMessages adds what it answers.
  return told
}

/**
 * What stops the model when it starts writing someone else's lines: a new line that
 * begins with another name. Servers accept a handful of these at most.
 */
export function sceneStops(others: SceneMember[], userName: string): string[] {
  return [userName, ...others.map((member) => member.name)].slice(0, 4).map((name) => `\n${name}:`)
}

/**
 * Removes the speaker's own name from the start of a reply ("Elara: …"), which models
 * often add when the other lines carry names. Works on a stream: feed it each piece,
 * it holds back the first few characters until it knows whether they are the name.
 */
export function createNameFilter(name: string): { push(delta: string): string; flush(): string } {
  const prefix = `${name}:`.toLowerCase()
  let held = ''
  let state: 'undecided' | 'after-name' | 'passing' = 'undecided'

  return {
    push(delta) {
      if (state === 'passing') return delta

      if (state === 'undecided') {
        held += delta
        const start = held.trimStart()
        const lower = start.toLowerCase()
        if (lower.length < prefix.length && prefix.startsWith(lower)) return '' // Could still be the name: wait.

        if (!lower.startsWith(prefix)) {
          state = 'passing'
          return held
        }
        state = 'after-name'
        delta = start.slice(prefix.length)
      }

      // The name is gone: so are the spaces that followed it, which may come in later pieces.
      const text = delta.trimStart()
      if (text) state = 'passing'
      return text
    },
    /** What was still held back when the reply ended. */
    flush() {
      const rest = state === 'undecided' ? held : ''
      state = 'passing'
      return rest
    },
  }
}
