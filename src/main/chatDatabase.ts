import { DatabaseSync } from 'node:sqlite'
import { isDirection } from '@core/prompt/direction'
import type { Kept } from '@core/prompt/place'
import type { ChatMember, ChatMemory, ChatMessage, ChatSummary, TurnMode } from '@shared/types'

// Conversations live in one SQLite file (chats.db in the app's data folder).
// `node:sqlite` is built into Node, so there is no native module to compile.
// Its API is synchronous: fine here, every query touches a handful of rows.

/** One version of a reply. A reply with several versions keeps them all ("swipes"). */
interface Swipe {
  content: string
  createdAt: number
  meta?: ChatMessage['meta']
  /** This version ran into the length limit: see ChatMessage.cut. */
  cut?: boolean
}

export interface ChatDatabase {
  /**
   * Starts a chat with its first message, the character's greeting (null when the card has none).
   * `alternatives` are the card's other greetings: they become versions of that first message.
   */
  createChat(characterId: string, greeting: ChatMessage | null, alternatives?: string[]): ChatSummary
  /**
   * Gives a chat nothing was said in yet the greetings its character has now. `was`: the
   * greetings the character had before, the main one first. The chat is only changed when
   * it holds exactly those (or nothing, when there were none): a chat someone wrote in, or
   * whose greeting was changed by hand, is left as it is. True when the chat was changed.
   */
  refreshGreeting(chatId: string, was: string[], greeting: ChatMessage | null, alternatives?: string[]): boolean
  /** The chats with one character, most recently used first. */
  listChats(characterId: string): ChatSummary[]
  getChat(chatId: string): ChatSummary | null
  deleteChat(chatId: string): void
  /** Deletes every chat with a character. Returns how many there were. */
  deleteChatsOf(characterId: string): number
  /**
   * Saves who takes part in a chat besides its own character (`guests`), and who answers the user.
   * Returns the chat, or null if it does not exist.
   */
  setScene(chatId: string, guests: ChatMember[], turnMode: TurnMode, ownerQuiet: boolean): ChatSummary | null
  /** Takes a character out of every chat it was added to (it is being deleted). */
  removeGuest(characterId: string): void

  getMessages(chatId: string): ChatMessage[]
  addMessage(chatId: string, message: ChatMessage): void
  /** Replaces the text of a message (of the version on screen, if it has several). */
  editMessage(messageId: string, content: string): ChatMessage | null
  /**
   * Replaces the text of a reply by a longer one, after the model wrote the rest of it
   * (in the version on screen, if it has several). `cut`: it ran into the limit again.
   */
  extendMessage(messageId: string, content: string, cut: boolean): ChatMessage | null
  /**
   * Removes a message and every message after it in the chat. Returns how many were removed.
   * The greeting (a chat's first message, when it is the character's) cannot be removed: 0.
   */
  deleteMessagesFrom(messageId: string): number
  /** Adds another version to a reply and shows it. */
  addSwipe(messageId: string, swipe: Swipe): ChatMessage | null
  /** Shows the version at `index` of a reply that has several. */
  selectSwipe(messageId: string, index: number): ChatMessage | null

  /** When each character was last talked to: character id -> timestamp. */
  lastActivity(): Map<string, number>

  /**
   * Saves what is remembered of a chat's oldest messages. A count of 0 forgets it all:
   * the model reads every message again, as far as they fit.
   */
  setMemory(chatId: string, memory: ChatMemory): ChatSummary | null
  /** Replaces the note on where the chat's story is heading. An empty note removes it. */
  setStory(chatId: string, note: string): ChatSummary | null
  /** Where the chat's scene is, as far as the app knows. Null when the chat is gone. */
  placeOf(chatId: string): Kept | null
  setPlace(chatId: string, place: Kept): ChatSummary | null
  /** What a character of the chat is wearing, as far as the app knows. Null when nothing was noted. */
  outfitOf(chatId: string, characterId: string): Kept | null
  setOutfit(chatId: string, characterId: string, outfit: Kept): ChatSummary | null
  /** How many of the chat's first messages the model has read for the story note and the user's tastes. */
  noticedCount(chatId: string): number
  setNoticedCount(chatId: string, count: number): void

  /** How much is in the file. */
  counts(): { chats: number; messages: number }
  /** Writes a complete, tidy copy of the database to `file`, which must not exist yet. For backups. */
  snapshot(file: string): void
  /**
   * Deletes every chat, then rewrites the file without them: deleted text would
   * otherwise stay readable in the file until something is written over it.
   */
  deleteAllChats(): void
  close(): void
}

/** A database whose file can be replaced while the app runs. */
export interface SwappableDatabase extends ChatDatabase {
  /** Closes the file, runs `change` (which may replace or remove it), then opens it again. */
  swap(change: () => Promise<void>): Promise<void>
}

/**
 * Opens the database behind a stand-in that always points at the file as it is
 * now, so the rest of the app can keep its reference when a backup is restored.
 */
export function openSwappableDatabase(file: string): SwappableDatabase {
  let current = openChatDatabase(file)

  async function swap(change: () => Promise<void>): Promise<void> {
    current.close()
    try {
      await change()
    } finally {
      current = openChatDatabase(file) // Whatever happened, the app needs a database.
    }
  }

  return new Proxy({} as SwappableDatabase, {
    get: (_target, key) => (key === 'swap' ? swap : current[key as keyof ChatDatabase]),
  })
}

/**
 * Checks that `file` is a chat database this version of the app can open.
 * Throws with a message for the user when it is not.
 */
export function checkChatFile(file: string): void {
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    const version = Number(db.prepare('PRAGMA user_version').get()?.['user_version'] ?? 0)
    const hasChats = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chats'").get()
    if (version > MIGRATIONS.length) throw new NewerVersionError()
    if (version < 1 || !hasChats) throw new Error('not a chat database')
  } catch (error) {
    if (error instanceof NewerVersionError) throw error
    throw new Error('The chats in this backup cannot be read.')
  } finally {
    db?.close()
  }
}

class NewerVersionError extends Error {
  constructor() {
    super('This backup was made by a newer version of SillySimple. Update the app, then restore it.')
  }
}

// Each entry upgrades the file by one version. To change the schema later,
// add an entry at the end; never edit one that has shipped.
const MIGRATIONS = [
  `
  CREATE TABLE chats (
    id           TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX chats_by_character ON chats (character_id, updated_at DESC);

  CREATE TABLE messages (
    id          TEXT PRIMARY KEY,
    chat_id     TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    model       TEXT,
    duration_ms INTEGER,
    UNIQUE (chat_id, position)
  );
  `,
  // Swipes: every version of a reply, as a JSON list, and which one is shown.
  // `content`, `model` and `duration_ms` always hold the version shown, so the
  // other queries do not need to know about swipes. NULL = a single version.
  `
  ALTER TABLE messages ADD COLUMN swipes TEXT;
  ALTER TABLE messages ADD COLUMN swipe_index INTEGER NOT NULL DEFAULT 0;
  `,
  // For the user's messages: the name of the persona they were written as. With several
  // personas, an old chat keeps showing who the user was then. NULL = written before this.
  `
  ALTER TABLE messages ADD COLUMN author TEXT;
  `,
  // Chats with several characters. A chat still belongs to one character (character_id);
  // the others added to it are a JSON list in `guests`: [{ "characterId": "…", "quiet": false }].
  // Each reply remembers which character wrote it. NULL = the chat's own character.
  `
  ALTER TABLE chats ADD COLUMN guests TEXT;
  ALTER TABLE chats ADD COLUMN owner_quiet INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE chats ADD COLUMN turn_mode TEXT NOT NULL DEFAULT 'round';
  ALTER TABLE messages ADD COLUMN character_id TEXT;
  `,
  // A reply that ran into the length limit before the model was done, so that the app
  // can still offer to continue it after a restart. Like `content`, the column holds
  // the value of the version shown; the other versions keep theirs in `swipes`.
  `
  ALTER TABLE messages ADD COLUMN cut INTEGER NOT NULL DEFAULT 0;
  `,
  // Long memory: the summary of a chat's oldest messages, and how many of its first
  // messages that summary stands for (see src/core/prompt/memory.ts). 0 = none.
  `
  ALTER TABLE chats ADD COLUMN memory TEXT;
  ALTER TABLE chats ADD COLUMN memory_count INTEGER NOT NULL DEFAULT 0;
  `,
  // The stage direction a reply was written under ("something happens", …), so that its
  // other versions follow it too (see src/core/prompt/direction.ts). It belongs to the
  // message, not to one of its versions. NULL = none.
  `
  ALTER TABLE messages ADD COLUMN direction TEXT;
  `,
  // "Adapts to you" (see src/core/prompt/notice.ts): the note on where a chat's story is
  // heading, and how many of the chat's first messages the model has already read to
  // write it and to learn the user's tastes.
  `
  ALTER TABLE chats ADD COLUMN story_note TEXT;
  ALTER TABLE chats ADD COLUMN noticed_count INTEGER NOT NULL DEFAULT 0;
  `,
  // Where the scene of a chat is (see src/core/prompt/place.ts): the place after its last
  // reply, the place before that reply, and which reply that was. NULL = not known.
  `
  ALTER TABLE chats ADD COLUMN place TEXT;
  ALTER TABLE chats ADD COLUMN place_before TEXT;
  ALTER TABLE chats ADD COLUMN place_message TEXT;
  `,
  // What each character of a chat is wearing, kept the same way: a JSON object,
  // character id -> { now, before, messageId }. NULL = nothing known.
  `
  ALTER TABLE chats ADD COLUMN outfits TEXT;
  `,
]

const CHAT_COLUMNS = `
  chats.id, chats.character_id, chats.created_at, chats.updated_at,
  chats.guests, chats.owner_quiet, chats.turn_mode, chats.memory, chats.memory_count, chats.story_note, chats.place, chats.outfits,
  (SELECT COUNT(*) FROM messages WHERE messages.chat_id = chats.id) AS message_count
`

/** Opens (and creates or upgrades) the database. Pass ':memory:' for tests. */
export function openChatDatabase(file: string): ChatDatabase {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL') // Survives a crash in the middle of a write.
  migrate(db)

  const insertChat = db.prepare('INSERT INTO chats (id, character_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
  const selectChat = db.prepare(`SELECT ${CHAT_COLUMNS} FROM chats WHERE id = ?`)
  const selectChats = db.prepare(
    `SELECT ${CHAT_COLUMNS} FROM chats WHERE character_id = ? ORDER BY updated_at DESC, created_at DESC`,
  )
  const deleteChat = db.prepare('DELETE FROM chats WHERE id = ?') // Its messages go with it (ON DELETE CASCADE).
  const deleteChatsOf = db.prepare('DELETE FROM chats WHERE character_id = ?')
  const touchChat = db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?')
  const updateScene = db.prepare('UPDATE chats SET guests = ?, owner_quiet = ?, turn_mode = ? WHERE id = ?')
  const selectChatsWithGuests = db.prepare('SELECT id, guests FROM chats WHERE guests IS NOT NULL')
  const updateGuests = db.prepare('UPDATE chats SET guests = ? WHERE id = ?')
  const selectActivity = db.prepare('SELECT character_id, MAX(updated_at) AS last FROM chats GROUP BY character_id')

  const updateMemory = db.prepare('UPDATE chats SET memory = ?, memory_count = ? WHERE id = ?')
  const updateStory = db.prepare('UPDATE chats SET story_note = ? WHERE id = ?')
  const selectPlace = db.prepare('SELECT place, place_before, place_message FROM chats WHERE id = ?')
  const updatePlace = db.prepare('UPDATE chats SET place = ?, place_before = ?, place_message = ? WHERE id = ?')
  const selectOutfits = db.prepare('SELECT outfits FROM chats WHERE id = ?')
  const updateOutfits = db.prepare('UPDATE chats SET outfits = ? WHERE id = ?')
  const selectNoticed = db.prepare('SELECT noticed_count FROM chats WHERE id = ?')
  const updateNoticed = db.prepare('UPDATE chats SET noticed_count = ? WHERE id = ?')
  const countBefore = db.prepare('SELECT COUNT(*) AS total FROM messages WHERE chat_id = ? AND position < ?')
  const countChats = db.prepare('SELECT COUNT(*) AS total FROM chats')
  const countMessages = db.prepare('SELECT COUNT(*) AS total FROM messages')
  const vacuumInto = db.prepare('VACUUM INTO ?')

  const selectMessages = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY position')
  const selectMessage = db.prepare('SELECT * FROM messages WHERE id = ?')
  const selectFirstPosition = db.prepare('SELECT MIN(position) AS first FROM messages WHERE chat_id = ?')
  const insertMessage = db.prepare(
    `INSERT INTO messages (id, chat_id, position, role, content, created_at, model, duration_ms, author, character_id, cut, direction)
     VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM messages WHERE chat_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const deleteFromPosition = db.prepare('DELETE FROM messages WHERE chat_id = ? AND position >= ?')
  const updateShown = db.prepare(
    'UPDATE messages SET content = ?, model = ?, duration_ms = ?, cut = ?, swipes = ?, swipe_index = ? WHERE id = ?',
  )

  function addMessage(chatId: string, message: ChatMessage): void {
    insertMessage.run(
      message.id,
      chatId,
      chatId,
      message.role,
      message.content,
      message.createdAt,
      message.meta?.model ?? null,
      message.meta?.durationMs ?? null,
      message.author ?? null,
      message.characterId ?? null,
      message.cut ? 1 : 0,
      message.direction ?? null,
    )
    touchChat.run(message.createdAt, chatId)
  }

  /** Every version of a message. A message that was never swiped has one: itself. */
  function swipesOf(row: Row): Swipe[] {
    if (typeof row['swipes'] === 'string') return JSON.parse(row['swipes']) as Swipe[]
    return [
      {
        content: row['content'] as string,
        createdAt: row['created_at'] as number,
        meta: metaOf(row),
        ...(row['cut'] === 1 && { cut: true }),
      },
    ]
  }

  /** Saves the versions of a message and shows the one at `index`. */
  function saveSwipes(messageId: string, swipes: Swipe[], index: number): ChatMessage {
    const shown = swipes[index]!
    updateShown.run(
      shown.content,
      shown.meta?.model ?? null,
      shown.meta?.durationMs ?? null,
      shown.cut ? 1 : 0,
      swipes.length > 1 ? JSON.stringify(swipes) : null,
      index,
      messageId,
    )
    return toMessage(selectMessage.get(messageId)!)
  }

  return {
    createChat(characterId, greeting, alternatives = []) {
      const id = crypto.randomUUID()
      const createdAt = greeting?.createdAt ?? Date.now()
      // Both rows or neither: a chat must never lose its greeting halfway.
      db.exec('BEGIN')
      try {
        insertChat.run(id, characterId, createdAt, createdAt)
        if (greeting) {
          addMessage(id, greeting)
          if (alternatives.length > 0) {
            const versions = [greeting.content, ...alternatives].map((content) => ({ content, createdAt }))
            saveSwipes(greeting.id, versions, 0)
          }
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return toSummary(selectChat.get(id)!)
    },

    refreshGreeting(chatId, was, greeting, alternatives = []) {
      const rows = selectMessages.all(chatId)
      if (rows.length > 1 || !selectChat.get(chatId)) return false
      const first = rows[0]
      if (first) {
        const held = swipesOf(first).map((swipe) => swipe.content)
        if (first['role'] !== 'assistant' || held.length !== was.length || held.some((content, index) => content !== was[index])) return false
      } else if (was.length > 0) {
        return false // Its greeting was deleted on purpose.
      }

      db.exec('BEGIN')
      try {
        if (first) deleteFromPosition.run(chatId, first['position'] as number)
        if (greeting) {
          addMessage(chatId, greeting)
          if (alternatives.length > 0) {
            const versions = [greeting.content, ...alternatives].map((content) => ({ content, createdAt: greeting.createdAt }))
            saveSwipes(greeting.id, versions, 0)
          }
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return true
    },

    listChats: (characterId) => selectChats.all(characterId).map(toSummary),

    getChat(chatId) {
      const row = selectChat.get(chatId)
      return row ? toSummary(row) : null
    },

    deleteChat(chatId) {
      deleteChat.run(chatId)
    },

    deleteChatsOf: (characterId) => Number(deleteChatsOf.run(characterId).changes),

    setScene(chatId, guests, turnMode, ownerQuiet) {
      updateScene.run(guests.length > 0 ? JSON.stringify(guests) : null, ownerQuiet ? 1 : 0, turnMode, chatId)
      const row = selectChat.get(chatId)
      return row ? toSummary(row) : null
    },

    removeGuest(characterId) {
      for (const row of selectChatsWithGuests.all()) {
        const guests = guestsOf(row)
        const remaining = guests.filter((guest) => guest.characterId !== characterId)
        if (remaining.length === guests.length) continue
        updateGuests.run(remaining.length > 0 ? JSON.stringify(remaining) : null, row['id'] as string)
      }
    },

    getMessages: (chatId) => selectMessages.all(chatId).map(toMessage),

    addMessage,

    editMessage(messageId, content) {
      const row = selectMessage.get(messageId)
      if (!row) return null

      const swipes = swipesOf(row)
      const index = row['swipe_index'] as number
      // Rewritten by hand: whatever was cut is now as the user wants it.
      swipes[index] = { ...swipes[index]!, content, cut: false }
      return saveSwipes(messageId, swipes, index)
    },

    extendMessage(messageId, content, cut) {
      const row = selectMessage.get(messageId)
      if (!row) return null

      const swipes = swipesOf(row)
      const index = row['swipe_index'] as number
      swipes[index] = { ...swipes[index]!, content, cut }
      const message = saveSwipes(messageId, swipes, index)
      touchChat.run(Date.now(), row['chat_id'] as string)
      return message
    },

    deleteMessagesFrom(messageId) {
      const row = selectMessage.get(messageId)
      if (!row) return 0
      const first = selectFirstPosition.get(row['chat_id'] as string)
      if (row['position'] === first?.['first'] && row['role'] === 'assistant') return 0

      const chatId = row['chat_id'] as string
      const removed = Number(deleteFromPosition.run(chatId, row['position'] as number).changes)
      // A memory that covers messages now gone would remember things that did not happen:
      // it is forgotten, and written again from what is left when it is next needed.
      const left = Number(countBefore.get(chatId, row['position'] as number)?.['total'] ?? 0)
      const chat = selectChat.get(chatId)
      if (chat && Number(chat['memory_count']) > left) updateMemory.run(null, 0, chatId)
      // What was read for the story note and the user's tastes: no more than what is left,
      // so that the messages written from here on are read in their turn.
      if (Number(selectNoticed.get(chatId)?.['noticed_count'] ?? 0) > left) updateNoticed.run(left, chatId)
      return removed
    },

    addSwipe(messageId, swipe) {
      const row = selectMessage.get(messageId)
      if (!row) return null

      const swipes = [...swipesOf(row), swipe]
      const message = saveSwipes(messageId, swipes, swipes.length - 1)
      touchChat.run(swipe.createdAt, row['chat_id'] as string)
      return message
    },

    selectSwipe(messageId, index) {
      const row = selectMessage.get(messageId)
      if (!row) return null

      const swipes = swipesOf(row)
      if (!Number.isInteger(index) || index < 0 || index >= swipes.length) return toMessage(row)
      return saveSwipes(messageId, swipes, index)
    },

    lastActivity() {
      const rows = selectActivity.all()
      return new Map(rows.map((row) => [row['character_id'] as string, row['last'] as number]))
    },

    setMemory(chatId, memory) {
      const count = Math.max(0, Math.floor(memory.count))
      updateMemory.run(count > 0 ? memory.summary : null, count, chatId)
      const row = selectChat.get(chatId)
      return row ? toSummary(row) : null
    },

    setStory(chatId, note) {
      updateStory.run(note.trim() || null, chatId)
      const row = selectChat.get(chatId)
      return row ? toSummary(row) : null
    },

    placeOf(chatId) {
      const row = selectPlace.get(chatId)
      return row ? { now: textOf(row['place']), before: textOf(row['place_before']), messageId: textOf(row['place_message']) } : null
    },

    setPlace(chatId, { now, before, messageId }) {
      updatePlace.run(now?.trim() || null, before?.trim() || null, messageId, chatId)
      const row = selectChat.get(chatId)
      return row ? toSummary(row) : null
    },

    outfitOf(chatId, characterId) {
      return outfitsOf(selectOutfits.get(chatId)?.['outfits'])[characterId] ?? null
    },

    setOutfit(chatId, characterId, { now, before, messageId }) {
      const found = selectOutfits.get(chatId)
      if (!found) return null
      const outfits = outfitsOf(found['outfits'])
      const kept: Kept = { now: now?.trim() || null, before: before?.trim() || null, messageId }
      // Nothing known, before or after: nothing to keep.
      if (kept.now || kept.before) outfits[characterId] = kept
      else delete outfits[characterId]
      updateOutfits.run(Object.keys(outfits).length > 0 ? JSON.stringify(outfits) : null, chatId)
      const row = selectChat.get(chatId)
      return row ? toSummary(row) : null
    },

    noticedCount: (chatId) => Number(selectNoticed.get(chatId)?.['noticed_count'] ?? 0),

    setNoticedCount(chatId, count) {
      updateNoticed.run(Math.max(0, Math.floor(count)), chatId)
    },

    counts() {
      return {
        chats: Number(countChats.get()?.['total'] ?? 0),
        messages: Number(countMessages.get()?.['total'] ?? 0),
      }
    },

    snapshot(file) {
      vacuumInto.run(file)
    },

    deleteAllChats() {
      db.exec('DELETE FROM chats') // Their messages go with them (ON DELETE CASCADE).
      db.exec('VACUUM')
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)') // The journal beside the file held them too.
    },

    close: () => db.close(),
  }
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get()
  const current = Number(row?.['user_version'] ?? 0)

  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[version]!)
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

type Row = Record<string, unknown>

/** The characters added to a chat, as saved in its `guests` column. */
function guestsOf(row: Row): ChatMember[] {
  if (typeof row['guests'] !== 'string') return []
  try {
    const list: unknown = JSON.parse(row['guests'])
    return Array.isArray(list)
      ? list
          .filter((item): item is ChatMember => typeof item?.characterId === 'string')
          .map((item) => ({ characterId: item.characterId, quiet: item.quiet === true }))
      : []
  } catch {
    return []
  }
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

/** The column `outfits` as it was written: character id -> what is kept of their clothes. Anything else: nothing. */
function outfitsOf(column: unknown): Record<string, Kept> {
  if (typeof column !== 'string' || !column) return {}
  try {
    const stored: unknown = JSON.parse(column)
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
    const outfits: Record<string, Kept> = {}
    for (const [characterId, value] of Object.entries(stored as Record<string, Partial<Kept> | null>)) {
      outfits[characterId] = { now: textOf(value?.now), before: textOf(value?.before), messageId: textOf(value?.messageId) }
    }
    return outfits
  } catch {
    return {}
  }
}

/** What each character wears now, for the page: character id -> clothes. Undefined when nothing is known. */
function wornNow(column: unknown): Record<string, string> | undefined {
  const worn = Object.entries(outfitsOf(column)).flatMap(([characterId, kept]) => (kept.now ? [[characterId, kept.now] as const] : []))
  return worn.length > 0 ? Object.fromEntries(worn) : undefined
}

function toSummary(row: Row): ChatSummary {
  const characterId = row['character_id'] as string
  return {
    id: row['id'] as string,
    characterId,
    members: [{ characterId, quiet: row['owner_quiet'] === 1 }, ...guestsOf(row)],
    turnMode: row['turn_mode'] === 'last' ? 'last' : 'round',
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
    messageCount: row['message_count'] as number,
    ...(Number(row['memory_count']) > 0 && {
      memory: { summary: typeof row['memory'] === 'string' ? row['memory'] : '', count: Number(row['memory_count']) },
    }),
    ...(typeof row['story_note'] === 'string' && row['story_note'] && { story: row['story_note'] }),
    ...(typeof row['place'] === 'string' && row['place'] && { place: row['place'] }),
    ...(wornNow(row['outfits']) && { outfits: wornNow(row['outfits']) }),
  }
}

function metaOf(row: Row): ChatMessage['meta'] {
  return typeof row['model'] === 'string'
    ? { model: row['model'], durationMs: Number(row['duration_ms'] ?? 0) }
    : undefined
}

function toMessage(row: Row): ChatMessage {
  const message: ChatMessage = {
    id: row['id'] as string,
    role: row['role'] as ChatMessage['role'],
    content: row['content'] as string,
    createdAt: row['created_at'] as number,
  }

  const meta = metaOf(row)
  if (meta) message.meta = meta
  if (typeof row['author'] === 'string') message.author = row['author']
  if (typeof row['character_id'] === 'string') message.characterId = row['character_id']
  if (row['cut'] === 1) message.cut = true
  if (isDirection(row['direction'])) message.direction = row['direction']

  if (typeof row['swipes'] === 'string') {
    const count = (JSON.parse(row['swipes']) as Swipe[]).length
    message.swipes = { index: row['swipe_index'] as number, count }
  }
  return message
}
