import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, EARLIER_SYSTEM_PROMPTS } from '@shared/defaults'
import type { Persona, Settings, SettingsPatch } from '@shared/types'

// Settings live in one JSON file in the app's data folder:
//   macOS    ~/Library/Application Support/SillySimple/settings.json
//   Windows  %APPDATA%\SillySimple\settings.json

let cache: Settings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache

  let stored: StoredSettings = {}
  try {
    stored = JSON.parse(await readFile(settingsPath(), 'utf8')) as StoredSettings
  } catch {
    // First launch, or an unreadable file: start from the defaults.
  }

  cache = merge(DEFAULT_SETTINGS, upgrade(stored))
  return cache
}

/** Forgets what was read: the next call reads the file again. For when the file was replaced or removed. */
export function forgetSettings(): void {
  cache = null
}

/** What a settings file may hold, including the layout of earlier versions of the app. */
type StoredSettings = SettingsPatch & { persona?: Partial<Persona> }

/** Brings a settings file written by an earlier version of the app up to date. */
export function upgrade(stored: StoredSettings): SettingsPatch {
  const { persona, ...rest } = stored

  // A system prompt that is word for word an earlier default was never changed by the
  // user: it is left out, so that today's default applies.
  if (rest.generation?.systemPrompt !== undefined && EARLIER_SYSTEM_PROMPTS.includes(rest.generation.systemPrompt)) {
    const { systemPrompt: _earlier, ...generation } = rest.generation
    rest.generation = generation
  }

  // Early versions had a single persona, saved as `persona`. It becomes the first of the list.
  if (!persona || rest.personas) return rest
  const only: Persona = { ...DEFAULT_SETTINGS.personas[0]!, ...persona }
  return { ...rest, personas: [only], activePersonaId: only.id }
}

// Saves run one after the other, so two quick changes cannot write the file at the same time.
let saveQueue: Promise<void> = Promise.resolve()

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const next = merge(await getSettings(), patch)
  cache = next
  saveQueue = saveQueue.then(() => save(next)).catch((error) => console.error('Could not save settings', error))
  await saveQueue
  return next
}

/** One-level-deep merge: sections are merged key by key, plain values and lists are replaced. */
export function merge(base: Settings, patch: SettingsPatch): Settings {
  // There is always at least one persona, and the one in use is always one of the list.
  const personas = patch.personas?.length ? patch.personas : base.personas
  const wanted = patch.activePersonaId ?? base.activePersonaId
  const activePersonaId = personas.some((persona) => persona.id === wanted) ? wanted : personas[0]!.id

  return {
    onboardingDone: patch.onboardingDone ?? base.onboardingDone,
    tourDone: patch.tourDone ?? base.tourDone,
    connection: { ...base.connection, ...patch.connection },
    generation: { ...base.generation, ...patch.generation },
    appearance: { ...base.appearance, ...patch.appearance },
    adapt: { ...base.adapt, ...patch.adapt },
    voice: { ...base.voice, ...patch.voice },
    updates: { ...base.updates, ...patch.updates },
    personas,
    activePersonaId,
  }
}

async function save(settings: Settings): Promise<void> {
  const file = settingsPath()
  const temporary = `${file}.tmp`
  await mkdir(dirname(file), { recursive: true })
  // Write to a temporary file first, so a crash mid-write cannot corrupt the settings.
  await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8')
  await rename(temporary, file)
}
