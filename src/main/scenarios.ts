import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { creatorNotes, parseCard, readCardJson } from '@core/cards/parseCard'
import { PORTRAIT_SCHEME } from '@shared/ipc'
import type { Scenario } from '@shared/types'

// Ready-to-play scenarios: a few characters that come with the app, written with care,
// so that anyone can start a story in the first minute without importing or writing
// anything. The first launch offers them, and so does the Library. They are ordinary
// card files (the `scenarios` folder at the root of the project, copied next to the app
// when it is packaged). Nothing here changes them: "Play" copies one into the user's own
// characters (see `adoptCard` in characters.ts), and from then on it is theirs to edit.

const CARD_EXTENSIONS = ['.png', '.json']
const MAX_CARD_BYTES = 30 * 1024 * 1024
/** A scenario's id is its file name without the extension: lowercase words and dashes. */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

let directory = ''

/** Call once at startup, with the folder the scenarios are read from. */
export function initScenarios(folder: string): void {
  directory = folder
}

/** The folder the scenarios are read from (the partner authors are in it too, see authors.ts). */
export function scenariosFolder(): string {
  return directory
}

/**
 * The scenarios the app comes with: those that have a picture first, then by name.
 * A file that cannot be read is left out.
 */
export async function listScenarios(): Promise<Scenario[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const scenarios = new Map<string, Scenario>()

  // Pictures first: of "a.png" and "a.json", the one with a picture is the scenario.
  const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  names.sort((a, b) => Number(isJson(a)) - Number(isJson(b)) || a.localeCompare(b))

  for (const name of names) {
    const extension = extname(name).toLowerCase()
    const id = name.slice(0, name.length - extension.length)
    if (!CARD_EXTENSIONS.includes(extension) || scenarios.has(id)) continue
    if (!ID.test(id)) {
      // Easy to miss when adding a card: say why it is not in the gallery.
      console.warn(`[scenarios] ${name} skipped: its name must be lowercase words and dashes (for instance "ayaka.png").`)
      continue
    }

    try {
      const path = join(directory, name)
      const info = await stat(path)
      if (info.size > MAX_CARD_BYTES) continue
      const json = readCardJson(name, await readFile(path))
      const card = parseCard(json)
      scenarios.set(id, {
        id,
        name: card.name,
        tagline: card.tagline,
        pitch: pitchOf(card.scenario, creatorNotes(json), card.tagline, card.description),
        tags: card.tags,
        greetings: [card.firstMessage, ...card.alternateGreetings].filter((text) => text.trim()).length,
        pictureUrl: extension === '.png' ? `${PORTRAIT_SCHEME}://scenario/${encodeURIComponent(id)}?v=${Math.round(info.mtimeMs)}` : undefined,
        ...(card.creator && { creator: card.creator }),
      })
    } catch {
      // Not a card: it does not belong in the gallery.
    }
  }
  return [...scenarios.values()].sort(
    (a, b) => Number(!a.pictureUrl) - Number(!b.pictureUrl) || a.name.localeCompare(b.name),
  )
}

/**
 * What the story starts on, in a few sentences: the card's scenario; else what its author
 * wrote to present it (cards shared online, past the line already shown as the tagline);
 * else the beginning of its description.
 */
function pitchOf(scenario: string, notes: string[], tagline: string, description: string): string {
  const sentences = (text: string, count: number): string =>
    text.trim().split(/(?<=[.!?])\s+/).slice(0, count).join(' ')
  if (scenario.trim()) return scenario.trim()
  const presented = (notes[0] === tagline ? notes.slice(1) : notes).join(' ')
  if (presented.trim()) return sentences(presented, 3)
  return sentences(description, 2)
}

const isJson = (name: string): boolean => extname(name).toLowerCase() === '.json'

/**
 * The card file of a scenario, or null when there is no such scenario. The id is only
 * ever looked up among the files of the folder: it cannot point anywhere else.
 */
export async function scenarioFile(id: string): Promise<string | null> {
  if (!ID.test(id)) return null
  const entries: string[] = await readdir(directory).catch(() => [])
  const name = CARD_EXTENSIONS.map((extension) => `${id}${extension}`).find((file) => entries.includes(file))
  return name ? join(directory, name) : null
}
