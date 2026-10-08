import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { BackupInfo, Settings } from '@shared/types'
import { checkChatFile } from './chatDatabase'
import { createZip, openZip } from './zip'

// Everything the user owns is in the app's data folder:
//
//   characters/     the card files, one per character
//   chats.db        every chat (SQLite; "chats.db-wal" and "chats.db-shm" are its journal)
//   settings.json   settings and personas
//   keys.json       API keys of online services, encrypted for this computer only
//   background.webp the picture the user chose to put behind their chats, if any
//
// A backup is a .zip of all but the keys, plus a small "backup.json" that says what it
// holds. Keys are left out on purpose: they could not be read on another computer, and
// a file that travels should not carry them.
//
// Nothing here knows about Electron, so all of it can be tested with plain folders.

const CHARACTERS = 'characters'
const CHATS = 'chats.db'
const SETTINGS = 'settings.json'
const KEYS = 'keys.json'
const MANIFEST = 'backup.json'
/** The user's own chat background (Settings › Appearance). The renderer makes it a WebP of a sensible size. */
export const BACKGROUND = 'background.webp'
export const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024
/** What a backup replaces when it is restored. */
const RESTORED = [CHARACTERS, CHATS, SETTINGS, BACKGROUND]

/** True for the bytes of a WebP picture: the only thing accepted as a background. */
export function isWebp(bytes: Uint8Array): boolean {
  const text = (from: number): string => String.fromCharCode(...bytes.subarray(from, from + 4))
  return bytes.length > 12 && text(0) === 'RIFF' && text(8) === 'WEBP'
}

/** Raised by one when the layout of a backup changes in a way older versions cannot read. */
export const BACKUP_FORMAT = 1

const CARD_EXTENSIONS = ['.png', '.json']
const MAX_CARD_BYTES = 30 * 1024 * 1024

interface Manifest {
  app: 'SillySimple'
  format: number
  createdAt: number
  characters: number
  chats: number
  messages: number
}

/** The card files of a characters folder. Anything else in it is not the app's and is left alone. */
async function cardFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isFile() && isCardName(entry.name))
    .map((entry) => entry.name)
    .sort()
}

function isCardName(name: string): boolean {
  return !name.startsWith('.') && !/[\\/]/.test(name) && CARD_EXTENSIONS.includes(extname(name).toLowerCase())
}

export async function countCharacters(folder: string): Promise<number> {
  return (await cardFiles(join(folder, CHARACTERS))).length
}

/** How much space the user's data takes, in bytes. */
export async function measureData(folder: string): Promise<number> {
  const sizeOf = (file: string): Promise<number> => stat(file).then((info) => info.size, () => 0)
  const cards = await cardFiles(join(folder, CHARACTERS))
  const sizes = await Promise.all([
    ...cards.map((name) => sizeOf(join(folder, CHARACTERS, name))),
    ...[CHATS, `${CHATS}-wal`, SETTINGS, KEYS, BACKGROUND].map((name) => sizeOf(join(folder, name))),
  ])
  return sizes.reduce((total, size) => total + size, 0)
}

/**
 * Writes a backup of the data folder to `file`.
 * `snapshotChats` writes a consistent copy of the chat database to the path it is given.
 */
export async function writeBackup(
  file: string,
  source: {
    folder: string
    settings: Settings
    counts: { chats: number; messages: number }
    snapshotChats(target: string): void
  },
  now = Date.now(),
): Promise<BackupInfo> {
  const cards = await cardFiles(join(source.folder, CHARACTERS))
  const manifest: Manifest = {
    app: 'SillySimple',
    format: BACKUP_FORMAT,
    createdAt: now,
    characters: cards.length,
    ...source.counts,
  }

  // Written under another name first: a backup that failed halfway never looks like a good one.
  const unfinished = `${file}.part`
  const snapshot = join(source.folder, 'backup-snapshot.db')
  await rm(snapshot, { force: true })
  try {
    source.snapshotChats(snapshot)

    const zip = await createZip(unfinished)
    try {
      await zip.add(MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
      await zip.add(SETTINGS, Buffer.from(JSON.stringify(source.settings, null, 2), 'utf8'))
      await zip.add(CHATS, await readFile(snapshot))
      const background = await readFile(join(source.folder, BACKGROUND)).catch(() => null)
      if (background) await zip.add(BACKGROUND, background, { compress: false })
      for (const name of cards) {
        const isPicture = extname(name).toLowerCase() === '.png'
        await zip.add(`${CHARACTERS}/${name}`, await readFile(join(source.folder, CHARACTERS, name)), { compress: !isPicture })
      }
    } finally {
      await zip.close()
    }
    await rename(unfinished, file)
  } finally {
    await rm(snapshot, { force: true })
    await rm(unfinished, { force: true })
  }

  return describe(file, manifest)
}

/** Reads what a backup file says about itself. Throws, with a message for the user, if it is not one. */
export async function readBackupInfo(file: string): Promise<BackupInfo> {
  const zip = await openZip(file)
  try {
    return describe(file, await readManifest(zip))
  } finally {
    await zip.close()
  }
}

async function readManifest(zip: Awaited<ReturnType<typeof openZip>>): Promise<Manifest> {
  if (!zip.entries.some((entry) => entry.name === MANIFEST)) throw new Error('This file is not a SillySimple backup.')

  let manifest: Partial<Manifest>
  try {
    manifest = JSON.parse((await zip.read(MANIFEST)).toString('utf8')) as Partial<Manifest>
  } catch {
    throw new Error('This file is not a SillySimple backup.')
  }
  if (manifest.app !== 'SillySimple' || typeof manifest.format !== 'number') {
    throw new Error('This file is not a SillySimple backup.')
  }
  if (manifest.format > BACKUP_FORMAT) {
    throw new Error('This backup was made by a newer version of SillySimple. Update the app, then restore it.')
  }
  return {
    app: 'SillySimple',
    format: manifest.format,
    createdAt: Number(manifest.createdAt) || 0,
    characters: Number(manifest.characters) || 0,
    chats: Number(manifest.chats) || 0,
    messages: Number(manifest.messages) || 0,
  }
}

function describe(file: string, manifest: Manifest): BackupInfo {
  const { createdAt, characters, chats, messages } = manifest
  return { fileName: basename(file), createdAt, characters, chats, messages }
}

/**
 * Takes a backup apart into `staging` (an empty folder is made for it) and checks it:
 * only the files a backup is made of are taken out, under the names the app gives them,
 * and the chats and settings must be readable. Nothing in the data folder changes.
 */
export async function extractBackup(file: string, staging: string): Promise<void> {
  await rm(staging, { recursive: true, force: true })
  await mkdir(join(staging, CHARACTERS), { recursive: true })

  const zip = await openZip(file)
  try {
    await readManifest(zip)
    const names = new Set(zip.entries.map((entry) => entry.name))
    if (!names.has(CHATS)) throw new Error('This backup is incomplete: its chats are missing.')

    await writeFile(join(staging, CHATS), await zip.read(CHATS))
    checkChatFile(join(staging, CHATS))
    // Opening the copy to check it may have left a journal beside it.
    await rm(join(staging, `${CHATS}-wal`), { force: true })
    await rm(join(staging, `${CHATS}-shm`), { force: true })

    if (names.has(SETTINGS)) {
      const settings = await zip.read(SETTINGS)
      try {
        const parsed: unknown = JSON.parse(settings.toString('utf8'))
        if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
      } catch {
        throw new Error('The settings in this backup cannot be read.')
      }
      await writeFile(join(staging, SETTINGS), settings)
    }

    const background = zip.entries.find((entry) => entry.name === BACKGROUND)
    if (background && background.size <= MAX_BACKGROUND_BYTES) {
      const bytes = await zip.read(BACKGROUND)
      if (isWebp(bytes)) await writeFile(join(staging, BACKGROUND), bytes) // Anything else is left out.
    }

    for (const entry of zip.entries) {
      // A name is only trusted when it is a card directly in "characters/": a file made
      // by hand cannot write anywhere else.
      const name = entry.name.startsWith(`${CHARACTERS}/`) ? entry.name.slice(CHARACTERS.length + 1) : ''
      if (!name || !isCardName(name) || entry.size > MAX_CARD_BYTES) continue
      await writeFile(join(staging, CHARACTERS, name), await zip.read(entry.name))
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  } finally {
    await zip.close()
  }
}

/**
 * Puts what `extractBackup` prepared in the place of the current data. The database
 * must be closed. If anything fails on the way, what was there is put back.
 */
export async function replaceData(folder: string, staging: string): Promise<void> {
  const aside = join(folder, 'replaced-by-restore')
  await rm(aside, { recursive: true, force: true })
  await mkdir(aside, { recursive: true })

  const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false)
  const moved: string[] = []
  try {
    for (const name of RESTORED) {
      if (await exists(join(folder, name))) {
        await rename(join(folder, name), join(aside, name))
        moved.push(name)
      }
    }
    await removeJournal(folder)
    for (const name of RESTORED) {
      if (await exists(join(staging, name))) await rename(join(staging, name), join(folder, name))
    }
  } catch (error) {
    // Back to how it was.
    for (const name of RESTORED) await rm(join(folder, name), { recursive: true, force: true })
    for (const name of moved) await rename(join(aside, name), join(folder, name))
    throw error
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  await rm(aside, { recursive: true, force: true })
}

/** Removes everything the app keeps: characters, chats, settings, background and keys. The database must be closed. */
export async function eraseData(folder: string): Promise<void> {
  for (const name of [...RESTORED, KEYS]) await rm(join(folder, name), { recursive: true, force: true })
  await removeJournal(folder)
}

async function removeJournal(folder: string): Promise<void> {
  await rm(join(folder, `${CHATS}-wal`), { force: true })
  await rm(join(folder, `${CHATS}-shm`), { force: true })
}
