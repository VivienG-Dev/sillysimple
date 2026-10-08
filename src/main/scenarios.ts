import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { parseCardFile } from '@core/cards/parseCard'
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
    if (!CARD_EXTENSIONS.includes(extension) || !ID.test(id) || scenarios.has(id)) continue

    try {
      const path = join(directory, name)
      const info = await stat(path)
      if (info.size > MAX_CARD_BYTES) continue
      const card = parseCardFile(name, await readFile(path))
      scenarios.set(id, {
        id,
        name: card.name,
        tagline: card.tagline,
        // What the story starts on: the card's scenario, or else the beginning of its description.
        pitch: card.scenario.trim() || card.description.trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(' '),
        tags: card.tags,
        greetings: [card.firstMessage, ...card.alternateGreetings].filter((text) => text.trim()).length,
        pictureUrl: extension === '.png' ? `${PORTRAIT_SCHEME}://scenario/${encodeURIComponent(id)}?v=${Math.round(info.mtimeMs)}` : undefined,
      })
    } catch {
      // Not a card: it does not belong in the gallery.
    }
  }
  return [...scenarios.values()].sort(
    (a, b) => Number(!a.pictureUrl) - Number(!b.pictureUrl) || a.name.localeCompare(b.name),
  )
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
