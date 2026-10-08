import { keyedEntries } from '@core/prompt/lorebook'
import { LORE_MEANING, loreEntryText, lorePieces, loreScores, meaningCandidates, pickByMeaning } from '@core/prompt/loreMeaning'
import { applyMacros } from '@core/prompt/macros'
import type { Character } from '@shared/types'
import type { SenseService } from './sense'

// Which lorebook notes the latest messages call by what they mean, for the reply about to
// be written (the arithmetic is in src/core/prompt/loreMeaning.ts). The model is the one
// that reads moods (sense.ts): nothing more to download.
//
// It never holds a reply up for long: past `PATIENCE_MS` the keywords answer alone, as
// they always did. The notes' own vectors are kept: a note is only asked about once, as
// long as its text does not change.

/** How long a reply waits for the meaning. The first question of a session loads the model (about 0.6 s). */
const PATIENCE_MS = 1200
/** Notes whose vectors are kept, all characters together. */
const KEPT = 2000

export type LoreByMeaning = (character: Character, messages: readonly string[], userName: string) => Promise<ReadonlySet<number> | undefined>

export function createLoreByMeaning(sense: Pick<SenseService, 'embed'>, log: (line: string) => void = () => {}): LoreByMeaning {
  const kept = new Map<string, number[]>()

  return async (character, messages, userName) => {
    const book = character.lorebook
    if (!book) return undefined
    const candidates = meaningCandidates(book.entries)
    const macros = { char: character.name, user: userName }
    const keyed = new Set(keyedEntries(book, messages, macros))
    const skip = new Set(candidates.flatMap((entryIndex, index) => (keyed.has(book.entries[entryIndex]!) ? [index] : [])))
    // Nothing the keywords leave to call.
    if (candidates.length === 0 || skip.size === candidates.length) return undefined
    const pieces = lorePieces(messages, LORE_MEANING.depth).map((piece) => piece.text)
    if (pieces.length === 0) return undefined

    const fill = (text: string): string => applyMacros(text, macros)
    const notes = candidates.map((entryIndex) => loreEntryText(book.entries[entryIndex]!, LORE_MEANING.form, fill))
    const missing = [...new Set(notes.filter((note) => !kept.has(note)))]
    const started = Date.now()
    const answer = await sense.embed([...missing, ...pieces], PATIENCE_MS)
    if (!answer) return undefined
    missing.forEach((note, index) => kept.set(note, answer[index]!))
    while (kept.size > KEPT) kept.delete(kept.keys().next().value!)

    const scores = loreScores(
      notes.map((note) => kept.get(note)!),
      answer.slice(missing.length),
      LORE_MEANING.method,
    )
    const calls = pickByMeaning(scores, LORE_MEANING, skip)
    const name = (index: number): string => {
      const entry = book.entries[candidates[index]!]!
      return entry.name.trim() || entry.keys[0]?.trim() || `note ${candidates[index]! + 1}`
    }
    // One line per reply: the notes and their scores, never a word of the chat.
    const closest = scores
      .map((score, index) => ({ score, index }))
      .filter((item) => !skip.has(item.index) && !calls.some((call) => call.index === item.index))
      .sort((a, b) => b.score - a.score)[0]
    log(
      `[lore] ${character.name}: by meaning ${calls.map((call) => `"${name(call.index)}" ${call.score.toFixed(3)}`).join(', ') || 'nothing'}` +
        `${closest ? ` (next: "${name(closest.index)}" ${closest.score.toFixed(3)}, from ${LORE_MEANING.threshold})` : ''} · ${Date.now() - started} ms`,
    )
    return new Set(calls.map((call) => candidates[call.index]!))
  }
}
