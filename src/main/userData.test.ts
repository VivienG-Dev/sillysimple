import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { ChatMessage } from '@shared/types'
import { openChatDatabase, openSwappableDatabase } from './chatDatabase'
import {
  BACKGROUND,
  BACKUP_FORMAT,
  countCharacters,
  eraseData,
  extractBackup,
  isWebp,
  measureData,
  readBackupInfo,
  replaceData,
  writeBackup,
} from './userData'
import { createZip } from './zip'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'silly-data-'))
const message = (role: ChatMessage['role'], content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: Date.now(),
})

/** A data folder like the app's, with two characters and one chat of three messages. */
function dataFolder(secret = 'the lighthouse secret') {
  const folder = scratch()
  mkdirSync(join(folder, 'characters'))
  writeFileSync(join(folder, 'characters', 'elara.json'), '{"name":"Elara"}')
  writeFileSync(join(folder, 'characters', 'quill.png'), Buffer.from([1, 2, 3, 4]))
  writeFileSync(join(folder, 'characters', 'notes.txt'), 'not a card')
  writeFileSync(join(folder, 'settings.json'), '{}')
  writeFileSync(join(folder, 'keys.json'), '{"openrouter":"encrypted"}')

  const db = openSwappableDatabase(join(folder, 'chats.db'))
  const chat = db.createChat('elara', message('assistant', 'You are late.'))
  db.addMessage(chat.id, message('user', secret))
  db.addMessage(chat.id, message('assistant', 'I know.'))
  return { folder, db, chat }
}

async function backupOf(data: ReturnType<typeof dataFolder>, name = 'backup.zip'): Promise<string> {
  const file = join(scratch(), name)
  await writeBackup(
    file,
    {
      folder: data.folder,
      settings: { ...DEFAULT_SETTINGS, onboardingDone: true },
      counts: data.db.counts(),
      snapshotChats: (target) => data.db.snapshot(target),
    },
    1_700_000_000_000,
  )
  return file
}

describe('the data folder', () => {
  it('counts the characters and measures what is kept', async () => {
    const { folder, db } = dataFolder()
    expect(await countCharacters(folder)).toBe(2) // The text file is not a card.
    expect(db.counts()).toEqual({ chats: 1, messages: 3 })
    expect(await measureData(folder)).toBeGreaterThan(4096)
    db.close()
  })

  it('erases everything, keys included', async () => {
    const { folder, db } = dataFolder()
    await db.swap(() => eraseData(folder))
    expect(readdirSync(folder).filter((name) => !name.startsWith('chats.db'))).toEqual([])
    expect(db.counts()).toEqual({ chats: 0, messages: 0 }) // A new, empty database.
    db.close()
  })
})

describe('deleting every chat', () => {
  it('leaves no trace of the text in the file', () => {
    const { folder, db } = dataFolder('a very recognisable sentence')
    db.deleteAllChats()
    expect(db.counts()).toEqual({ chats: 0, messages: 0 })
    db.close()
    for (const name of readdirSync(folder).filter((item) => item.startsWith('chats.db'))) {
      expect(readFileSync(join(folder, name)).includes('a very recognisable sentence')).toBe(false)
    }
  })
})

describe('backups', () => {
  it('writes one file that says what it holds, without the keys', async () => {
    const data = dataFolder()
    const file = await backupOf(data, 'My backup.zip')

    expect(await readBackupInfo(file)).toEqual({
      fileName: 'My backup.zip',
      createdAt: 1_700_000_000_000,
      characters: 2,
      chats: 1,
      messages: 3,
    })
    const bytes = readFileSync(file)
    expect(bytes.includes('keys.json')).toBe(false)
    expect(bytes.includes('notes.txt')).toBe(false)
    expect(readdirSync(data.folder)).not.toContain('backup-snapshot.db') // Nothing left behind.
    expect(existsSync(`${file}.part`)).toBe(false)
    data.db.close()
  })

  it('brings everything back on another computer', async () => {
    const original = dataFolder('the lighthouse secret')
    const file = await backupOf(original)
    original.db.close()

    // Another data folder, with other things in it.
    const other = dataFolder('something else entirely')
    writeFileSync(join(other.folder, 'characters', 'mara.json'), '{"name":"Mara"}')

    const staging = join(other.folder, 'restore-staging')
    await extractBackup(file, staging)
    await other.db.swap(() => replaceData(other.folder, staging))

    expect(readdirSync(join(other.folder, 'characters')).sort()).toEqual(['elara.json', 'quill.png'])
    expect(JSON.parse(readFileSync(join(other.folder, 'settings.json'), 'utf8'))).toMatchObject({ onboardingDone: true })
    expect(readFileSync(join(other.folder, 'keys.json'), 'utf8')).toContain('openrouter') // Keys are not touched.
    const [chat] = other.db.listChats('elara')
    expect(other.db.getMessages(chat!.id).map((item) => item.content)).toEqual(['You are late.', 'the lighthouse secret', 'I know.'])
    expect(readdirSync(other.folder)).not.toContain('restore-staging')
    expect(readdirSync(other.folder)).not.toContain('replaced-by-restore')
    other.db.close()
  })

  describe("the user's own chat background", () => {
    /** The first bytes of a WebP file, and enough after them. */
    const webp = (mark: string): Buffer => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 '), Buffer.from(mark)])

    it('is told from anything else by its first bytes', () => {
      expect(isWebp(webp('a picture'))).toBe(true)
      expect(isWebp(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe(false) // A PNG.
      expect(isWebp(Buffer.from('RIFF'))).toBe(false)
      expect(isWebp(Buffer.alloc(0))).toBe(false)
    })

    it('travels with a backup and comes back with it', async () => {
      const original = dataFolder()
      const withoutPicture = await measureData(original.folder)
      writeFileSync(join(original.folder, BACKGROUND), webp('the harbour at dusk'))
      expect(await measureData(original.folder)).toBe(withoutPicture + webp('the harbour at dusk').length) // Counted in the size.
      const file = await backupOf(original)
      original.db.close()

      const other = dataFolder()
      writeFileSync(join(other.folder, BACKGROUND), webp('another place'))
      const staging = join(other.folder, 'restore-staging')
      await extractBackup(file, staging)
      await other.db.swap(() => replaceData(other.folder, staging))
      expect(readFileSync(join(other.folder, BACKGROUND)).includes('the harbour at dusk')).toBe(true)
      other.db.close()
    })

    it('is removed by a backup that has none, and by erasing everything', async () => {
      const original = dataFolder()
      const file = await backupOf(original)
      original.db.close()

      const other = dataFolder()
      writeFileSync(join(other.folder, BACKGROUND), webp('another place'))
      const staging = join(other.folder, 'restore-staging')
      await extractBackup(file, staging)
      await other.db.swap(() => replaceData(other.folder, staging))
      expect(existsSync(join(other.folder, BACKGROUND))).toBe(false) // The settings that came back know of none.

      writeFileSync(join(other.folder, BACKGROUND), webp('a third place'))
      await other.db.swap(() => eraseData(other.folder))
      expect(existsSync(join(other.folder, BACKGROUND))).toBe(false)
      other.db.close()
    })

    it('is left out of a restore when it is not a picture', async () => {
      const data = dataFolder()
      const good = await backupOf(data)
      data.db.close()

      // The same backup, with something else under the background's name.
      const { openZip } = await import('./zip')
      const source = await openZip(good)
      const forged = join(scratch(), 'forged.zip')
      const zip = await createZip(forged)
      for (const entry of source.entries) await zip.add(entry.name, await source.read(entry.name))
      await zip.add(BACKGROUND, Buffer.from('#!/bin/sh\necho not a picture'))
      await zip.close()
      await source.close()

      const staging = join(scratch(), 'staging')
      await extractBackup(forged, staging)
      expect(existsSync(join(staging, BACKGROUND))).toBe(false)
      expect(existsSync(join(staging, 'chats.db'))).toBe(true)
    })
  })

  it('upgrades the chats of a backup made by an older version', async () => {
    const data = dataFolder()
    const file = join(scratch(), 'old.zip')
    // A database as the first version of the app made it.
    const oldDb = join(scratch(), 'old.db')
    const raw = new DatabaseSync(oldDb)
    raw.exec(`
      CREATE TABLE chats (id TEXT PRIMARY KEY, character_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, position INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL, created_at INTEGER NOT NULL, model TEXT, duration_ms INTEGER, UNIQUE (chat_id, position));
      INSERT INTO chats VALUES ('c1', 'elara', 1, 2);
      INSERT INTO messages VALUES ('m1', 'c1', 1, 'assistant', 'From long ago.', 1, NULL, NULL);
      PRAGMA user_version = 1;
    `)
    raw.close()
    const zip = await createZip(file)
    await zip.add('backup.json', Buffer.from(JSON.stringify({ app: 'SillySimple', format: 1, createdAt: 1, characters: 0, chats: 1, messages: 1 })))
    await zip.add('chats.db', readFileSync(oldDb))
    await zip.close()

    const staging = join(data.folder, 'restore-staging')
    await extractBackup(file, staging)
    await data.db.swap(() => replaceData(data.folder, staging))

    const [chat] = data.db.listChats('elara')
    expect(chat?.members).toEqual([{ characterId: 'elara', quiet: false }])
    expect(data.db.getMessages(chat!.id)[0]?.content).toBe('From long ago.')
    expect(existsSync(join(data.folder, 'settings.json'))).toBe(false) // The backup had none: defaults apply.
    data.db.close()
  })

  describe('files that are not good backups change nothing', () => {
    async function attempt(build: (zip: Awaited<ReturnType<typeof createZip>>) => Promise<void>): Promise<{ error: string; folder: string }> {
      const data = dataFolder()
      data.db.close()
      const file = join(scratch(), 'bad.zip')
      const zip = await createZip(file)
      await build(zip)
      await zip.close()

      const staging = join(data.folder, 'restore-staging')
      const error = await extractBackup(file, staging).then(
        () => '',
        (caught: Error) => caught.message,
      )
      expect(existsSync(staging)).toBe(false)
      expect(readdirSync(join(data.folder, 'characters')).sort()).toEqual(['elara.json', 'notes.txt', 'quill.png'])
      return { error, folder: data.folder }
    }
    const manifest = (format = BACKUP_FORMAT): Buffer => Buffer.from(JSON.stringify({ app: 'SillySimple', format }))

    it('any other zip', async () => {
      expect((await attempt((zip) => zip.add('holiday.txt', Buffer.from('hi')))).error).toBe('This file is not a SillySimple backup.')
    })

    it('a backup from a newer version', async () => {
      expect((await attempt((zip) => zip.add('backup.json', manifest(BACKUP_FORMAT + 1)))).error).toContain('newer version')
    })

    it('a backup without chats', async () => {
      expect((await attempt((zip) => zip.add('backup.json', manifest()))).error).toContain('chats are missing')
    })

    it('a backup whose chats are not a database', async () => {
      const result = await attempt(async (zip) => {
        await zip.add('backup.json', manifest())
        await zip.add('chats.db', Buffer.from('definitely not sqlite'))
      })
      expect(result.error).toBe('The chats in this backup cannot be read.')
    })

    it('a backup whose chats come from a newer version', async () => {
      const newer = join(scratch(), 'newer.db')
      openChatDatabase(newer).close()
      const raw = new DatabaseSync(newer)
      raw.exec('PRAGMA user_version = 999')
      raw.close()
      const result = await attempt(async (zip) => {
        await zip.add('backup.json', manifest())
        await zip.add('chats.db', readFileSync(newer))
      })
      expect(result.error).toContain('newer version')
    })
  })

  it('only takes card files out, and only into the characters folder', async () => {
    const data = dataFolder()
    const good = join(scratch(), 'good.db')
    openChatDatabase(good).close()
    const file = join(scratch(), 'sneaky.zip')
    const zip = await createZip(file)
    await zip.add('backup.json', Buffer.from(JSON.stringify({ app: 'SillySimple', format: 1 })))
    await zip.add('chats.db', readFileSync(good))
    await zip.add('characters/fine.json', Buffer.from('{}'))
    await zip.add('characters/../../escaped.json', Buffer.from('{}'))
    await zip.add('characters/deep/inside.json', Buffer.from('{}'))
    await zip.add('characters/script.sh', Buffer.from('#!/bin/sh'))
    await zip.add('characters/.hidden.json', Buffer.from('{}'))
    await zip.add('keys.json', Buffer.from('{"stolen":"x"}'))
    await zip.add('../outside.txt', Buffer.from('x'))
    await zip.close()

    const staging = join(data.folder, 'restore-staging')
    await extractBackup(file, staging)

    expect(readdirSync(staging).sort()).toEqual(['characters', 'chats.db'])
    expect(readdirSync(join(staging, 'characters'))).toEqual(['fine.json'])
    expect(existsSync(join(data.folder, 'escaped.json'))).toBe(false)
    expect(existsSync(join(data.folder, '..', 'escaped.json'))).toBe(false)
    data.db.close()
  })
})
