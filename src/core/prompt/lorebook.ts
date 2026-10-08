import type { Lorebook, LorebookEntry } from '@shared/types'
import { estimateTokens } from './context'
import { applyMacros, type MacroContext } from './macros'

// A lorebook is a set of notes about a character's world. Each note has keys:
// it is added to the prompt only while one of them appears in the recent messages,
// so the model reads about the harbor when the harbor comes up, and not otherwise.
//
// What is not handled (yet): entries that trigger each other ("recursive scanning"),
// probabilities, and the placements other than before / after the description.

/** How many of the latest messages are searched, when the lorebook does not say. */
const DEFAULT_SCAN_DEPTH = 4

export interface ActiveLore {
  /** Entry texts to place before the character's description, in order. */
  before: string[]
  /** Entry texts to place after it. */
  after: string[]
}

export interface LoreOptions {
  macros: MacroContext
  /** The most tokens the entries may take together. */
  tokenBudget: number
  /**
   * Entries called by what the chat means (see loreMeaning.ts), as their places in
   * `book.entries`. They come after the ones the keywords call: they only take the room
   * those leave.
   */
  byMeaning?: ReadonlySet<number>
}

/** Picks the entries of `book` that the latest `messages` call for. */
export function activateLorebook(book: Lorebook | null, messages: string[], options: LoreOptions): ActiveLore {
  const lore: ActiveLore = { before: [], after: [] }
  if (!book) return lore

  const keyed = keyedEntries(book, messages, options.macros)
  const meant = book.entries.filter(
    (entry, index) => options.byMeaning?.has(index) && entry.enabled && entry.content.trim() !== '' && !keyed.includes(entry),
  )
  const called = [...keyed, ...meant]

  // When there is not room for everything, the entries with the highest order stay; the
  // ones the keywords call before the ones the meaning calls.
  const budget = Math.min(book.tokenBudget ?? Infinity, options.tokenBudget)
  const kept = new Set<LorebookEntry>()
  let used = 0
  const byOrder = (a: LorebookEntry, b: LorebookEntry): number => b.insertionOrder - a.insertionOrder
  for (const entry of [...[...keyed].sort(byOrder), ...[...meant].sort(byOrder)]) {
    const cost = estimateTokens(entry.content)
    if (used + cost > budget) continue
    used += cost
    kept.add(entry)
  }

  for (const entry of called.filter((item) => kept.has(item)).sort((a, b) => a.insertionOrder - b.insertionOrder)) {
    lore[entry.position === 'after_char' ? 'after' : 'before'].push(entry.content.trim())
  }
  return lore
}

/** The entries sent always, and those one of whose keys appears in the latest `messages`. */
export function keyedEntries(book: Lorebook, messages: readonly string[], macros: MacroContext): LorebookEntry[] {
  const depth = Math.max(1, book.scanDepth ?? DEFAULT_SCAN_DEPTH)
  const recent = messages.slice(-depth).join('\n')
  return book.entries.filter((entry) => {
    if (!entry.enabled || !entry.content.trim()) return false
    if (entry.constant) return true
    const mentions = (key: string): boolean => keyMatches(applyMacros(key, macros), recent, entry.caseSensitive)
    if (!entry.keys.some(mentions)) return false
    return !entry.selective || entry.secondaryKeys.length === 0 || entry.secondaryKeys.some(mentions)
  })
}

const SPACELESS_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u

/**
 * Whether `key` appears in `text`.
 * - "/harbou?r/i" is a regular expression.
 * - A plain key must stand as a whole word ("cat" is not found in "category"),
 *   except in scripts written without spaces, where it only has to be there.
 */
export function keyMatches(key: string, text: string, caseSensitive: boolean): boolean {
  const trimmed = key.trim()
  if (!trimmed) return false

  const regex = /^\/(.+)\/([a-z]*)$/s.exec(trimmed)
  if (regex) {
    try {
      return new RegExp(regex[1]!, regex[2]).test(text)
    } catch {
      return false // A broken expression in a card must not break the chat.
    }
  }

  const flags = caseSensitive ? 'u' : 'iu'
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = SPACELESS_SCRIPTS.test(trimmed) ? escaped : `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`
  return new RegExp(pattern, flags).test(text)
}
