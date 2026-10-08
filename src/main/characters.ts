import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { applyDraft, applyFavorite, applyVoice, parseCardFile, parseJsonBytes, toCardV2 } from '@core/cards/parseCard'
import { readCardsFromPng, writeCardsToPng, type CardKeyword } from '@core/cards/png'
import { PORTRAIT_SCHEME } from '@shared/ipc'
import type { Character, CharacterDraft, ImportResult, VoiceChoice, VoiceService } from '@shared/types'

// Characters are card files (.png or .json, SillyTavern format) in one folder:
//   macOS    ~/Library/Application Support/SillySimple/characters
//   Windows  %APPDATA%\SillySimple\characters
// The folder is the library: a card dropped into it by hand shows up at the next launch.
// A character's id is its file name without the extension.
//
// A card file is only rewritten when the user edits the character in the app, and
// then only the edited fields change: whatever else the file holds is kept.

const CARD_EXTENSIONS = ['.png', '.json']
const MAX_CARD_BYTES = 30 * 1024 * 1024

let directory = ''

/**
 * Call once at startup. The folder starts empty: the characters the app comes with are
 * the ready-to-play scenarios (see scenarios.ts), which the user picks from.
 */
export async function initCharacters(folder: string): Promise<void> {
  directory = folder
  await mkdir(folder, { recursive: true })
}

export async function listCharacters(): Promise<Character[]> {
  const characters = new Map<string, Character>()

  for (const fileName of await cardFiles()) {
    const id = idOf(fileName)
    if (characters.has(id)) continue // "a.png" and "a.json": the first one wins.

    try {
      characters.set(id, await readCharacter(fileName))
    } catch (error) {
      // A file that is not a card must not hide all the others.
      console.warn(`Skipped ${fileName}:`, error instanceof Error ? error.message : error)
    }
  }

  return [...characters.values()]
}

export async function getCharacter(id: string): Promise<Character | null> {
  const fileName = await fileNameOf(id)
  if (!fileName) return null
  return readCharacter(fileName).catch(() => null)
}

/** Copies card files into the folder. Each file is checked first; bad ones are reported, not copied. */
export async function importCards(paths: string[]): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] }

  for (const path of paths) {
    const file = basename(path)
    try {
      const extension = extname(path).toLowerCase()
      if (!CARD_EXTENSIONS.includes(extension)) throw new Error('Only .png and .json cards can be imported.')
      if ((await stat(path)).size > MAX_CARD_BYTES) throw new Error('This file is too large to be a character card.')

      const card = parseCardFile(file, await readFile(path))
      const fileName = await freeFileName(slugOf(card.name), extension)
      await copyFile(path, join(directory, fileName))
      result.imported.push(await readCharacter(fileName))
    } catch (error) {
      result.failed.push({ file, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return result
}

/**
 * Makes a card file that comes with the app (a ready-to-play scenario) one of the user's
 * characters, under `id`. Done once: when the user already has it, theirs is returned as
 * it is, with whatever they changed.
 */
export async function adoptCard(path: string, id: string): Promise<Character> {
  const existing = await fileNameOf(id)
  if (existing) return readCharacter(existing)

  const extension = extname(path).toLowerCase()
  if (!CARD_EXTENSIONS.includes(extension) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error('This is not a character card.')
  parseCardFile(basename(path), await readFile(path)) // Throws when the file is not a card.
  const fileName = `${id}${extension}`
  await copyFile(path, join(directory, fileName))
  return readCharacter(fileName)
}

/**
 * Writes a new card file. With a picture (PNG bytes) the card is a .png that carries
 * the character inside, as SillyTavern does; without one it is a .json.
 */
export async function createCharacter(draft: CharacterDraft, portrait?: Uint8Array): Promise<Character> {
  checkDraft(draft, portrait)

  const card = toCardV2(draft)
  const fileName = await freeFileName(slugOf(draft.name), portrait ? '.png' : '.json')
  await writeSafely(join(directory, fileName), portrait ? pictureCard(portrait, card) : jsonCard(card))
  return readCharacter(fileName)
}

/**
 * Saves what the editor changed. The file keeps its name, so the character keeps
 * its id and its chats, even when it is renamed. A new picture replaces the old
 * one; a .json card that gets its first picture becomes a .png.
 */
export async function updateCharacter(id: string, draft: CharacterDraft, portrait?: Uint8Array): Promise<Character> {
  checkDraft(draft, portrait)

  const fileName = await fileNameOf(id)
  if (!fileName) throw new Error('This character no longer exists.')
  const path = join(directory, fileName)
  const bytes = await readFile(path)

  if (isPng(fileName)) {
    // A PNG can carry the character twice (V2 and V3): both copies get the changes.
    const cards = new Map<CardKeyword, unknown>()
    for (const [keyword, card] of readCardsFromPng(bytes)) cards.set(keyword, applyDraft(card, draft))
    if (cards.size === 0) throw new Error('This image has no character data inside.')
    await writeSafely(path, writeCardsToPng(portrait ?? bytes, cards))
    return readCharacter(fileName)
  }

  const card = applyDraft(parseJsonBytes(bytes), draft)
  if (!portrait) {
    await writeSafely(path, jsonCard(card))
    return readCharacter(fileName)
  }

  const pictureName = `${id}.png`
  await writeSafely(join(directory, pictureName), pictureCard(portrait, card))
  await rm(path) // Everything it held is now inside the picture.
  return readCharacter(pictureName)
}

/** Where a character's card file is, or null if there is no such character. */
export async function cardFile(id: string): Promise<string | null> {
  const fileName = await fileNameOf(id)
  return fileName ? join(directory, fileName) : null
}

/** The picture of a PNG card, for the card:// address the UI uses. Null for JSON cards. */
/** Marks a character as a favourite, or removes the mark, in its card file. Nothing else in the file changes. */
export async function setFavorite(id: string, favorite: boolean): Promise<Character> {
  return rewriteCard(id, (card) => applyFavorite(card, favorite))
}

/**
 * Gives the character a voice for a voice service, or takes it away (`voice` null: the
 * character then speaks with the voice chosen for everyone in the settings).
 */
export async function setVoice(id: string, service: VoiceService, voice: VoiceChoice | null): Promise<Character> {
  return rewriteCard(id, (card) => applyVoice(card, service, voice))
}

/** Rewrites one thing in a card file, in every copy of the card it holds, and leaves the rest as it is. */
async function rewriteCard(id: string, change: (card: unknown) => Record<string, unknown>): Promise<Character> {
  const fileName = await fileNameOf(id)
  if (!fileName) throw new Error('This character no longer exists.')
  const path = join(directory, fileName)
  const bytes = await readFile(path)

  if (isPng(fileName)) {
    const cards = new Map<CardKeyword, unknown>()
    for (const [keyword, card] of readCardsFromPng(bytes)) cards.set(keyword, change(card))
    if (cards.size === 0) throw new Error('This image has no character data inside.')
    await writeSafely(path, writeCardsToPng(bytes, cards))
  } else {
    await writeSafely(path, jsonCard(change(parseJsonBytes(bytes))))
  }
  return readCharacter(fileName)
}

export async function portraitFile(id: string): Promise<string | null> {
  const file = await cardFile(id)
  return file && isPng(file) ? file : null
}

// --- internals ---------------------------------------------------------------

function checkDraft(draft: CharacterDraft, portrait?: Uint8Array): void {
  if (!draft.name.trim()) throw new Error('A character needs a name.')
  if (portrait && portrait.length > MAX_CARD_BYTES) throw new Error('This picture is too large.')
}

function jsonCard(card: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(card, null, 2))
}

/** A picture with the card inside. V3 cards also go in the chunk V3 readers look for. */
function pictureCard(portrait: Uint8Array, card: Record<string, unknown>): Uint8Array {
  const cards = new Map<CardKeyword, unknown>([['chara', card]])
  if (card['spec'] === 'chara_card_v3') cards.set('ccv3', card)
  return writeCardsToPng(portrait, cards)
}

/** Writes to a temporary file first, so a crash mid-write cannot leave half a card. */
async function writeSafely(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.tmp`
  await writeFile(temporary, bytes)
  await rename(temporary, path)
}

function isPng(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.png')
}

async function cardFiles(): Promise<string[]> {
  const entries = await readdir(directory)
  return entries.filter((name) => CARD_EXTENSIONS.includes(extname(name).toLowerCase())).sort()
}

async function fileNameOf(id: string): Promise<string | null> {
  // Looking the id up in the real folder listing also blocks ids like "../secrets".
  return (await cardFiles()).find((name) => idOf(name) === id) ?? null
}

async function readCharacter(fileName: string): Promise<Character> {
  const path = join(directory, fileName)
  const card = parseCardFile(fileName, await readFile(path))
  const id = idOf(fileName)

  const character: Character = { id, ...card }
  if (isPng(fileName)) {
    // ?v= changes when the file changes, so a replaced picture is not served from cache.
    const version = Math.round((await stat(path)).mtimeMs)
    character.portraitUrl = `${PORTRAIT_SCHEME}://portrait/${encodeURIComponent(id)}?v=${version}`
  }
  return character
}

function idOf(fileName: string): string {
  return basename(fileName, extname(fileName))
}

/** "Elara Voss!" -> "elara-voss". Letters of any alphabet are kept. */
function slugOf(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'character'
}

/** "elara-voss.png", or "elara-voss-2.png" if that character id is taken. */
async function freeFileName(slug: string, extension: string): Promise<string> {
  const taken = new Set((await cardFiles()).map((name) => idOf(name).toLowerCase()))
  let candidate = slug
  for (let number = 2; taken.has(candidate); number++) candidate = `${slug}-${number}`
  return `${candidate}${extension}`
}
