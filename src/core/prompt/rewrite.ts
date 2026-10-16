import type { Rewrite, RewriteKind } from '@shared/types'
import { replyWords } from './replyLength'

// Writing a reply again, the way the user asks (Vivien, 15 October: "la régénération
// guidée, 100 % d'accord").
//
// "Write another version" starts over: the model never sees the version on screen, so it
// may write something else entirely. When the reply was right but too long, too flat or
// all description, that loses what was good in it. A rewrite shows the model the version
// on screen and asks for the same reply, changed in one way: shorter, longer, more
// feeling, more spoken words, or what the user wrote. What happens in it stays.
//
// The note goes at the end of what the model reads, like a stage direction, in brackets.
// The length is said in the note, not in the system prompt, which stays the same from one
// reply to the next (a local server can then reuse what it already read of it).

export const REWRITE_KINDS: readonly RewriteKind[] = ['shorter', 'longer', 'feeling', 'dialogue', 'own']

/** The user's own words are cut to this many characters: a request, not a second chat. */
export const NOTE_LIMIT = 300
/** The version on screen is shown up to this many characters, so a very long one does not crowd the context. */
export const SHOWN_LIMIT = 6000

export function isRewrite(value: unknown): value is Rewrite {
  if (!value || typeof value !== 'object') return false
  const { kind, note } = value as Rewrite
  if (!REWRITE_KINDS.includes(kind)) return false
  if (kind === 'own') return typeof note === 'string' && note.trim().length > 0
  return note === undefined || typeof note === 'string'
}

/** How many words a text has, roughly (CJK characters count one each). */
export function countWords(text: string): number {
  const cjk = text.match(/[぀-ヿ㐀-鿿가-힯]/g)?.length ?? 0
  const words = text.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').match(/\S+/g)?.length ?? 0
  return words + cjk
}

/**
 * How many words the new version should have, or null when its length is not the point.
 * Shorter: about half of the version on screen. Longer: about two thirds more, and never
 * less than the "Reply length" setting asks for.
 */
export function rewriteWords(kind: RewriteKind, shownWords: number, maxTokens: number): number | null {
  const round = (words: number): number => Math.max(20, Math.round(words / 10) * 10)
  if (kind === 'shorter') return round(Math.min(shownWords * 0.5, replyWords(maxTokens)))
  if (kind === 'longer') return round(Math.max(shownWords * 1.7, replyWords(maxTokens)))
  return null
}

/** The length limit for the new version, in tokens: room enough for what it is asked to be. */
export function rewriteMaxTokens(kind: RewriteKind, shownWords: number, maxTokens: number): number {
  const words = rewriteWords(kind, shownWords, maxTokens)
  if (kind === 'longer' && words) return Math.max(maxTokens, Math.ceil(words / 0.65))
  // Saying it again in other words may take as long as it did, or a little more.
  return Math.max(maxTokens, Math.ceil((shownWords * 1.2) / 0.65))
}

/** What is asked, completing "{{user}} wants it written again: …". */
function asked(rewrite: Rewrite, words: number | null): string {
  switch (rewrite.kind) {
    case 'shorter':
      return `shorter, about ${words} words. Keep what matters most and drop the rest.`
    case 'longer':
      return `longer, about ${words} words. Stay in the same moment and go further into it, with more detail, without repeating anything.`
    case 'feeling':
      return "with more of what {{char}} feels, shown through gestures, voice and the thoughts that show through, rather than named."
    case 'dialogue':
      return 'with more of what {{char}} says out loud and less description.'
    case 'own':
      return `following this request from {{user}}: "${cleanNote(rewrite.note ?? '')}".`
  }
}

/** The user's words, on one line, without what could close the note early. */
export function cleanNote(note: string): string {
  return note.replace(/\s+/g, ' ').replace(/[[\]"]/g, "'").trim().slice(0, NOTE_LIMIT).trim()
}

/**
 * The note that asks for the rewrite. `shown`: the version on screen. `{{char}}` and
 * `{{user}}` are filled in by the caller.
 */
export function rewriteCue(rewrite: Rewrite, shown: string, maxTokens: number): string {
  const text = shown.trim()
  const quoted = text.length > SHOWN_LIMIT ? `${text.slice(0, SHOWN_LIMIT).trimEnd()} […]` : text
  const words = rewriteWords(rewrite.kind, countWords(text), maxTokens)
  const keep =
    rewrite.kind === 'own'
      ? "Keep the rest of it as it was, unless the request changes it, and keep {{char}}'s voice."
      : "Keep what happens in it, in the same order, and keep {{char}}'s voice."
  return (
    `[{{char}} already answered this. Here is that reply:\n<<<\n${quoted}\n>>>\n` +
    `{{user}} wants it written again, ${asked(rewrite, words)} ${keep} ` +
    "Write only the new reply, as {{char}}. Do not write {{user}}'s words or actions, and do not mention this note.]"
  )
}
