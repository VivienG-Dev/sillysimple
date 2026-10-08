import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@shared/types'
import { openChatDatabase } from './chatDatabase'

let clock = 1000
const message = (role: ChatMessage['role'], content: string, meta?: ChatMessage['meta']): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: clock++,
  ...(meta && { meta }),
})

const scratchFile = (): string => join(mkdtempSync(join(tmpdir(), 'silly-db-')), 'chats.db')

describe('chats', () => {
  it('creates a chat with its greeting and returns the messages in order', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'You are late.'))
    db.addMessage(chat.id, message('user', 'Sorry.'))
    db.addMessage(chat.id, message('assistant', 'Sit.', { model: 'llama3.1:8b', durationMs: 2100 }))

    const messages = db.getMessages(chat.id)
    expect(messages.map((item) => item.content)).toEqual(['You are late.', 'Sorry.', 'Sit.'])
    expect(messages[2]?.meta).toEqual({ model: 'llama3.1:8b', durationMs: 2100 })
    expect(messages[0]).not.toHaveProperty('meta')
    expect(messages[2]).not.toHaveProperty('swipes')
    expect(db.getChat(chat.id)?.messageCount).toBe(3)
  })

  it('lists the chats of one character, most recently used first', () => {
    const db = openChatDatabase(':memory:')
    const first = db.createChat('elara', message('assistant', 'One'))
    const second = db.createChat('elara', message('assistant', 'Two'))
    db.createChat('quill', message('assistant', 'Other character'))

    expect(db.listChats('elara').map((chat) => chat.id)).toEqual([second.id, first.id])

    db.addMessage(first.id, message('user', 'Back to the first chat'))
    expect(db.listChats('elara').map((chat) => chat.id)).toEqual([first.id, second.id])
    expect(db.lastActivity().get('elara')).toBe(db.getChat(first.id)?.updatedAt)
  })

  it('deletes a chat together with its messages', () => {
    const db = openChatDatabase(':memory:')
    const kept = db.createChat('elara', message('assistant', 'Kept'))
    const removed = db.createChat('elara', message('assistant', 'Removed'))
    db.addMessage(removed.id, message('user', 'Bye'))

    db.deleteChat(removed.id)

    expect(db.getChat(removed.id)).toBeNull()
    expect(db.getMessages(removed.id)).toEqual([])
    expect(db.listChats('elara').map((chat) => chat.id)).toEqual([kept.id])
  })

  it("deletes every chat of a character, and only that character's", () => {
    const db = openChatDatabase(':memory:')
    db.createChat('elara', message('assistant', 'One'))
    db.createChat('elara', message('assistant', 'Two'))
    const other = db.createChat('quill', message('assistant', 'Other'))

    expect(db.deleteChatsOf('elara')).toBe(2)
    expect(db.listChats('elara')).toEqual([])
    expect(db.lastActivity().has('elara')).toBe(false)
    expect(db.getMessages(other.id)).toHaveLength(1)
  })
})

describe('messages', () => {
  it('edits the text of a message and keeps the rest of it', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    const reply = message('assistant', 'Tpyo', { model: 'm', durationMs: 5 })
    db.addMessage(chat.id, reply)

    const edited = db.editMessage(reply.id, 'Typo fixed')

    expect(edited).toMatchObject({ id: reply.id, content: 'Typo fixed', meta: { model: 'm', durationMs: 5 } })
    expect(db.getMessages(chat.id).at(-1)?.content).toBe('Typo fixed')
    expect(db.editMessage('unknown', 'x')).toBeNull()
  })

  it('deletes a message together with every message after it, but never the greeting', () => {
    const db = openChatDatabase(':memory:')
    const greeting = message('assistant', 'Greeting')
    const chat = db.createChat('elara', greeting)
    const other = db.createChat('elara', message('assistant', 'Another chat'))
    const texts = ['Question', 'Answer', 'Second question', 'Second answer']
    const added = texts.map((text, index) => message(index % 2 ? 'assistant' : 'user', text))
    for (const item of added) db.addMessage(chat.id, item)
    db.addMessage(other.id, message('user', 'Untouched'))

    expect(db.deleteMessagesFrom(greeting.id)).toBe(0)
    expect(db.deleteMessagesFrom(added[1]!.id)).toBe(3) // "Answer" and the two after it
    expect(db.getMessages(chat.id).map((item) => item.content)).toEqual(['Greeting', 'Question'])
    expect(db.getMessages(other.id)).toHaveLength(2) // Only that chat is concerned.

    // A message added afterwards lands at the end.
    db.addMessage(chat.id, message('assistant', 'New answer'))
    expect(db.getMessages(chat.id).map((item) => item.content)).toEqual(['Greeting', 'Question', 'New answer'])
    expect(db.deleteMessagesFrom('unknown')).toBe(0)
  })

  it('keeps who is in a chat, who stays in the background, and who wrote each reply', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', { ...message('assistant', 'Greeting'), characterId: 'elara', author: 'Elara' })
    expect(chat).toMatchObject({ members: [{ characterId: 'elara', quiet: false }], turnMode: 'round' })

    const scene = db.setScene(chat.id, [{ characterId: 'quill', quiet: true }, { characterId: 'mara', quiet: false }], 'last', false)
    expect(scene?.members).toEqual([
      { characterId: 'elara', quiet: false },
      { characterId: 'quill', quiet: true },
      { characterId: 'mara', quiet: false },
    ])
    expect(db.listChats('elara')[0]?.turnMode).toBe('last')
    expect(db.listChats('quill')).toEqual([]) // The chat still belongs to Elara only.

    db.addMessage(chat.id, { ...message('assistant', 'Hm.'), characterId: 'quill', author: 'Professor Quill' })
    expect(db.getMessages(chat.id).map((item) => item.characterId)).toEqual(['elara', 'quill'])

    // Quill is deleted: he leaves the chat, what he said stays under his name.
    db.removeGuest('quill')
    expect(db.getChat(chat.id)?.members.map((member) => member.characterId)).toEqual(['elara', 'mara'])
    expect(db.getMessages(chat.id)[1]).toMatchObject({ content: 'Hm.', author: 'Professor Quill' })

    // The chat's own character can be put in the background too; without guests the list is just itself.
    expect(db.setScene(chat.id, [], 'round', true)?.members).toEqual([{ characterId: 'elara', quiet: true }])
    expect(db.setScene('unknown', [], 'round', false)).toBeNull()
  })

  it("remembers the persona's name on the user's messages", () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    db.addMessage(chat.id, { ...message('user', 'Hi'), author: 'Ren' })

    const [greeting, hello] = db.getMessages(chat.id)
    expect(hello?.author).toBe('Ren')
    expect(greeting).not.toHaveProperty('author')
  })

  it("offers the card's other greetings as versions of the first message", () => {
    const db = openChatDatabase(':memory:')
    const greeting = message('assistant', 'You are late.')
    const chat = db.createChat('elara', greeting, ['The door is open.', 'Go away.'])

    expect(db.getMessages(chat.id)).toEqual([{ ...greeting, swipes: { index: 0, count: 3 } }])
    expect(db.selectSwipe(greeting.id, 2)).toMatchObject({ content: 'Go away.', swipes: { index: 2, count: 3 } })
    expect(db.getChat(chat.id)?.messageCount).toBe(1)
  })

  it('starts an empty chat for a card without a greeting, where the first message can be deleted', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('narrator', null)
    expect(db.getMessages(chat.id)).toEqual([])
    expect(db.listChats('narrator')).toHaveLength(1)

    const hello = message('user', 'Hello?')
    db.addMessage(chat.id, hello)
    expect(db.deleteMessagesFrom(hello.id)).toBe(1) // It is the user's own, not a greeting.
  })
})

describe('swipes', () => {
  function chatWithReply() {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    db.addMessage(chat.id, message('user', 'Hi'))
    const reply = message('assistant', 'First', { model: 'a', durationMs: 1 })
    db.addMessage(chat.id, reply)
    return { db, chat, reply }
  }

  it('adds a version to a reply and shows it, keeping the earlier one', () => {
    const { db, chat, reply } = chatWithReply()

    const second = db.addSwipe(reply.id, { content: 'Second', createdAt: 5000, meta: { model: 'b', durationMs: 2 } })

    expect(second).toMatchObject({
      id: reply.id,
      content: 'Second',
      meta: { model: 'b', durationMs: 2 },
      swipes: { index: 1, count: 2 },
    })
    // Still one message in the chat, and the chat counts as just used.
    expect(db.getMessages(chat.id)).toHaveLength(3)
    expect(db.getChat(chat.id)?.updatedAt).toBe(5000)
  })

  it('switches between versions, each with its own text and details', () => {
    const { db, reply } = chatWithReply()
    db.addSwipe(reply.id, { content: 'Second', createdAt: 5000, meta: { model: 'b', durationMs: 2 } })
    db.addSwipe(reply.id, { content: 'Third', createdAt: 6000 })

    expect(db.selectSwipe(reply.id, 0)).toMatchObject({ content: 'First', meta: { model: 'a' }, swipes: { index: 0, count: 3 } })
    expect(db.selectSwipe(reply.id, 2)).toMatchObject({ content: 'Third', swipes: { index: 2, count: 3 } })
    expect(db.selectSwipe(reply.id, 2)).not.toHaveProperty('meta')

    // An index that does not exist changes nothing.
    expect(db.selectSwipe(reply.id, 7)).toMatchObject({ content: 'Third', swipes: { index: 2, count: 3 } })
  })

  it('edits only the version on screen', () => {
    const { db, reply } = chatWithReply()
    db.addSwipe(reply.id, { content: 'Second', createdAt: 5000 })

    db.editMessage(reply.id, 'Second, edited')

    expect(db.selectSwipe(reply.id, 0)?.content).toBe('First')
    expect(db.selectSwipe(reply.id, 1)?.content).toBe('Second, edited')
  })
})

describe("a chat nothing was said in yet follows its character's greetings", () => {
  const greeting = (content: string): ChatMessage => message('assistant', content)

  it('opens on the new greeting when the old one is untouched', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', greeting('You are late.'), ['The lamp is out.'])

    expect(db.refreshGreeting(chat.id, ['You are late.', 'The lamp is out.'], greeting('Sit down.'), ['Not you again.', 'Ah.'])).toBe(true)
    const [first, ...rest] = db.getMessages(chat.id)
    expect(rest).toEqual([])
    expect(first).toMatchObject({ role: 'assistant', content: 'Sit down.', swipes: { index: 0, count: 3 } })
    expect(db.getChat(chat.id)?.messageCount).toBe(1)
  })

  it('gets a greeting when its character had none, and loses it when the character has none left', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', null)
    expect(db.refreshGreeting(chat.id, [], greeting('You are late.'))).toBe(true)
    expect(db.getMessages(chat.id).map((item) => item.content)).toEqual(['You are late.'])
    expect(db.getMessages(chat.id)[0]).not.toHaveProperty('swipes')

    expect(db.refreshGreeting(chat.id, ['You are late.'], null)).toBe(true)
    expect(db.getMessages(chat.id)).toEqual([])
  })

  it('is left alone once someone wrote in it', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', greeting('You are late.'))
    db.addMessage(chat.id, message('user', 'Sorry.'))
    expect(db.refreshGreeting(chat.id, ['You are late.'], greeting('Sit down.'))).toBe(false)
    expect(db.getMessages(chat.id).map((item) => item.content)).toEqual(['You are late.', 'Sorry.'])
  })

  it('is left alone when its greeting was changed by hand, or deleted', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', greeting('You are late.'))
    const [first] = db.getMessages(chat.id)
    db.editMessage(first!.id, 'You are very late.')
    expect(db.refreshGreeting(chat.id, ['You are late.'], greeting('Sit down.'))).toBe(false)
    expect(db.getMessages(chat.id)[0]?.content).toBe('You are very late.')

    // A chat started without a greeting, by a user who spoke first.
    const spoken = db.createChat('elara', null)
    db.addMessage(spoken.id, message('user', 'Hello?'))
    expect(db.refreshGreeting(spoken.id, [], greeting('Sit down.'))).toBe(false)

    // An empty chat whose character did have a greeting: it was taken out on purpose.
    const emptied = db.createChat('elara', null)
    expect(db.refreshGreeting(emptied.id, ['You are late.'], greeting('Sit down.'))).toBe(false)
    expect(db.refreshGreeting('missing', [], greeting('Sit down.'))).toBe(false)
  })
})

describe('where the scene of a chat is, and what its characters wear', () => {
  it('keeps the place with the chat: now, before the last reply, and which reply that was', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    const other = db.createChat('elara', message('assistant', 'Greeting'))
    expect(chat).not.toHaveProperty('place')
    expect(db.placeOf(chat.id)).toEqual({ now: null, before: null, messageId: null })

    const saved = db.setPlace(chat.id, { now: '  the kitchen ', before: null, messageId: 'reply-1' })
    expect(saved?.place).toBe('the kitchen')
    expect(db.placeOf(chat.id)).toEqual({ now: 'the kitchen', before: null, messageId: 'reply-1' })

    db.setPlace(chat.id, { now: 'the sofa', before: 'the kitchen', messageId: 'reply-2' })
    expect(db.placeOf(chat.id)).toEqual({ now: 'the sofa', before: 'the kitchen', messageId: 'reply-2' })
    expect(db.listChats('elara').find((item) => item.id === chat.id)?.place).toBe('the sofa')
    expect(db.listChats('elara').find((item) => item.id === other.id)).not.toHaveProperty('place')

    // Not known any more: the chat says nothing of a place.
    expect(db.setPlace(chat.id, { now: null, before: null, messageId: 'reply-2' })).not.toHaveProperty('place')
    expect(db.placeOf('missing')).toBeNull()
    expect(db.setPlace('missing', { now: 'x', before: null, messageId: null })).toBeNull()
  })

  it('keeps the clothes of each character of the chat apart', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    expect(chat).not.toHaveProperty('outfits')
    expect(db.outfitOf(chat.id, 'elara')).toBeNull()

    expect(db.setOutfit(chat.id, 'elara', { now: ' a grey jumper ', before: null, messageId: 'reply-1' })?.outfits).toEqual({ elara: 'a grey jumper' })
    db.setOutfit(chat.id, 'quill', { now: 'an oilskin coat', before: null, messageId: 'reply-2' })
    db.setOutfit(chat.id, 'elara', { now: 'a nightgown', before: 'a grey jumper', messageId: 'reply-3' })

    expect(db.outfitOf(chat.id, 'elara')).toEqual({ now: 'a nightgown', before: 'a grey jumper', messageId: 'reply-3' })
    expect(db.outfitOf(chat.id, 'quill')).toEqual({ now: 'an oilskin coat', before: null, messageId: 'reply-2' })
    expect(db.getChat(chat.id)?.outfits).toEqual({ elara: 'a nightgown', quill: 'an oilskin coat' })
    // The place is its own thing.
    expect(db.getChat(chat.id)).not.toHaveProperty('place')

    // Not known now, but known before: kept for another version of that reply, not shown.
    expect(db.setOutfit(chat.id, 'quill', { now: null, before: 'an oilskin coat', messageId: 'reply-4' })?.outfits).toEqual({ elara: 'a nightgown' })
    expect(db.outfitOf(chat.id, 'quill')).toEqual({ now: null, before: 'an oilskin coat', messageId: 'reply-4' })
    // Nothing known at all: nothing kept.
    db.setOutfit(chat.id, 'quill', { now: null, before: null, messageId: 'reply-4' })
    db.setOutfit(chat.id, 'elara', { now: '', before: '  ', messageId: null })
    expect(db.outfitOf(chat.id, 'quill')).toBeNull()
    expect(db.getChat(chat.id)).not.toHaveProperty('outfits')
    expect(db.setOutfit('missing', 'elara', { now: 'x', before: null, messageId: null })).toBeNull()
  })
})

describe('the note on where a story is heading', () => {
  it('belongs to its chat, can be rewritten and removed', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    const other = db.createChat('elara', message('assistant', 'Greeting'))
    expect(chat).not.toHaveProperty('story')

    expect(db.setStory(chat.id, '  Ren wants answers.  ')?.story).toBe('Ren wants answers.')
    expect(db.getChat(chat.id)?.story).toBe('Ren wants answers.')
    expect(db.listChats('elara').find((item) => item.id === other.id)).not.toHaveProperty('story')

    expect(db.setStory(chat.id, '   ')).not.toHaveProperty('story')
    expect(db.setStory('missing', 'x')).toBeNull()
  })

  it('remembers how far the chat was read, and goes back when messages are deleted', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    const added = Array.from({ length: 6 }, (_, index) => message(index % 2 ? 'assistant' : 'user', `Line ${index}`))
    for (const item of added) db.addMessage(chat.id, item)
    expect(db.noticedCount(chat.id)).toBe(0)

    db.setNoticedCount(chat.id, 7)
    expect(db.noticedCount(chat.id)).toBe(7)

    db.deleteMessagesFrom(added[4]!.id) // Five messages are left.
    expect(db.noticedCount(chat.id)).toBe(5)
    db.setNoticedCount(chat.id, 2)
    db.deleteMessagesFrom(added[3]!.id) // Four are left: what was read is still there.
    expect(db.noticedCount(chat.id)).toBe(2)
    expect(db.noticedCount('missing')).toBe(0)
  })
})

describe('replies written under a stage direction', () => {
  it('remembers the direction of a reply, through its versions and its edits', () => {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    const reply = { ...message('assistant', 'The door bursts open.'), direction: 'event' as const }
    db.addMessage(chat.id, reply)

    const [greeting, saved] = db.getMessages(chat.id)
    expect(saved?.direction).toBe('event')
    expect(greeting).not.toHaveProperty('direction')

    expect(db.addSwipe(reply.id, { content: 'A scream outside.', createdAt: 5000 })?.direction).toBe('event')
    expect(db.selectSwipe(reply.id, 0)?.direction).toBe('event')
    expect(db.editMessage(reply.id, 'The door creaks open.')?.direction).toBe('event')
  })
})

describe('replies cut short by the length limit', () => {
  function chatWithCutReply() {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    db.addMessage(chat.id, message('user', 'Hi'))
    const reply = { ...message('assistant', 'It came from the north and', { model: 'a', durationMs: 1 }), cut: true }
    db.addMessage(chat.id, reply)
    return { db, chat, reply }
  }

  it('remembers that a reply was cut, and only then', () => {
    const { db, chat } = chatWithCutReply()
    const [greeting, , reply] = db.getMessages(chat.id)
    expect(reply?.cut).toBe(true)
    expect(greeting).not.toHaveProperty('cut')
  })

  it('adds the rest to the same message and forgets the cut once it is whole', () => {
    const { db, chat, reply } = chatWithCutReply()

    const extended = db.extendMessage(reply.id, 'It came from the north and swept the bay.', false)

    expect(extended).toMatchObject({ id: reply.id, content: 'It came from the north and swept the bay.' })
    expect(extended).not.toHaveProperty('cut')
    expect(extended?.meta).toEqual({ model: 'a', durationMs: 1 })
    expect(db.getMessages(chat.id)).toHaveLength(3)
  })

  it('keeps the cut when the rest ran into the limit too', () => {
    const { db, reply } = chatWithCutReply()
    expect(db.extendMessage(reply.id, 'It came from the north and swept', true)?.cut).toBe(true)
  })

  it('keeps it per version: each one knows whether it was cut', () => {
    const { db, reply } = chatWithCutReply()

    const second = db.addSwipe(reply.id, { content: 'A whole one.', createdAt: 5000 })
    expect(second).not.toHaveProperty('cut')
    expect(db.selectSwipe(reply.id, 0)?.cut).toBe(true)

    db.extendMessage(reply.id, 'It came from the north and swept the bay.', false)
    expect(db.selectSwipe(reply.id, 1)?.content).toBe('A whole one.')
    expect(db.selectSwipe(reply.id, 0)).toMatchObject({ content: 'It came from the north and swept the bay.' })
    expect(db.selectSwipe(reply.id, 0)).not.toHaveProperty('cut')
  })

  it('forgets the cut when the user rewrites the message', () => {
    const { db, reply } = chatWithCutReply()
    expect(db.editMessage(reply.id, 'It came from the north.')).not.toHaveProperty('cut')
  })

  it('returns nothing for a message that is gone', () => {
    const { db } = chatWithCutReply()
    expect(db.extendMessage('nope', 'x', false)).toBeNull()
  })
})

describe('long memory', () => {
  function longChat() {
    const db = openChatDatabase(':memory:')
    const chat = db.createChat('elara', message('assistant', 'Greeting'))
    const added = Array.from({ length: 6 }, (_, index) => message(index % 2 ? 'assistant' : 'user', `Message ${index + 1}`))
    for (const item of added) db.addMessage(chat.id, item)
    return { db, chat, added }
  }

  it('is absent from a chat until something is remembered', () => {
    const { db, chat } = longChat()
    expect(db.getChat(chat.id)).not.toHaveProperty('memory')
    expect(db.listChats('elara')[0]).not.toHaveProperty('memory')
  })

  it('keeps the summary and how many messages it stands for', () => {
    const { db, chat } = longChat()
    const saved = db.setMemory(chat.id, { summary: 'Ren reached the lighthouse.', count: 4 })
    expect(saved?.memory).toEqual({ summary: 'Ren reached the lighthouse.', count: 4 })
    expect(db.listChats('elara')[0]?.memory).toEqual({ summary: 'Ren reached the lighthouse.', count: 4 })
  })

  it('can be emptied by the user and still stand for the same messages', () => {
    const { db, chat } = longChat()
    db.setMemory(chat.id, { summary: 'Something.', count: 4 })
    expect(db.setMemory(chat.id, { summary: '', count: 4 })?.memory).toEqual({ summary: '', count: 4 })
  })

  it('is forgotten when its count goes back to zero', () => {
    const { db, chat } = longChat()
    db.setMemory(chat.id, { summary: 'Something.', count: 4 })
    expect(db.setMemory(chat.id, { summary: 'ignored', count: 0 })).not.toHaveProperty('memory')
    expect(db.setMemory('nope', { summary: 'x', count: 1 })).toBeNull()
  })

  it('survives the deletion of messages that came after what it covers', () => {
    const { db, chat, added } = longChat()
    db.setMemory(chat.id, { summary: 'Covers the greeting and three messages.', count: 4 })
    db.deleteMessagesFrom(added[4]!.id) // The 6th message of the chat: 5 are left.
    expect(db.getChat(chat.id)?.memory?.count).toBe(4)
    db.deleteMessagesFrom(added[3]!.id) // The 5th: 4 are left, exactly what the memory covers.
    expect(db.getChat(chat.id)?.memory?.count).toBe(4)
  })

  it('is forgotten when a message it covers is deleted', () => {
    const { db, chat, added } = longChat()
    db.setMemory(chat.id, { summary: 'Covers the greeting and three messages.', count: 4 })
    db.deleteMessagesFrom(added[2]!.id) // The 4th message: the memory spoke of it.
    expect(db.getChat(chat.id)).not.toHaveProperty('memory')
    expect(db.getMessages(chat.id)).toHaveLength(3)
  })
})

describe('the database file', () => {
  it('keeps everything after it is closed and opened again', () => {
    const file = scratchFile()

    const before = openChatDatabase(file)
    const chat = before.createChat('elara', message('assistant', 'Still here?'))
    const reply = message('assistant', 'One')
    before.addMessage(chat.id, reply)
    before.addSwipe(reply.id, { content: 'Two', createdAt: 9000 })
    before.close()

    const after = openChatDatabase(file) // Also proves the migrations do not run twice.
    expect(after.getMessages(chat.id).map((item) => item.content)).toEqual(['Still here?', 'Two'])
    expect(after.selectSwipe(reply.id, 0)?.content).toBe('One')
    expect(after.getChat('unknown')).toBeNull()
    after.close()
  })

  it('upgrades a file made before swipes existed without losing a message', () => {
    const file = scratchFile()

    // The layout of the first version of the app, written by hand.
    const old = new DatabaseSync(file)
    old.exec(`
      CREATE TABLE chats (id TEXT PRIMARY KEY, character_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE INDEX chats_by_character ON chats (character_id, updated_at DESC);
      CREATE TABLE messages (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE, position INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL, created_at INTEGER NOT NULL,
        model TEXT, duration_ms INTEGER, UNIQUE (chat_id, position)
      );
      INSERT INTO chats VALUES ('c1', 'elara', 1, 3);
      INSERT INTO messages VALUES ('m1', 'c1', 1, 'assistant', 'Greeting', 1, NULL, NULL);
      INSERT INTO messages VALUES ('m2', 'c1', 2, 'user', 'Hi', 2, NULL, NULL);
      INSERT INTO messages VALUES ('m3', 'c1', 3, 'assistant', 'Old reply', 3, 'gemma', 900);
      PRAGMA user_version = 1;
    `)
    old.close()

    const db = openChatDatabase(file)

    expect(db.getMessages('c1')).toEqual([
      { id: 'm1', role: 'assistant', content: 'Greeting', createdAt: 1 },
      { id: 'm2', role: 'user', content: 'Hi', createdAt: 2 },
      { id: 'm3', role: 'assistant', content: 'Old reply', createdAt: 3, meta: { model: 'gemma', durationMs: 900 } },
    ])
    // And the new feature works on the old messages.
    expect(db.addSwipe('m3', { content: 'New reply', createdAt: 10 })?.swipes).toEqual({ index: 1, count: 2 })
    expect(db.selectSwipe('m3', 0)).toMatchObject({ content: 'Old reply', meta: { model: 'gemma', durationMs: 900 } })
    expect(db.getChat('c1')).toMatchObject({ members: [{ characterId: 'elara', quiet: false }], turnMode: 'round' })
    // So do the ones added since: a message written as a persona.
    db.addMessage('c1', { id: 'm4', role: 'user', content: 'Later', createdAt: 11, author: 'Ren' })
    expect(db.getMessages('c1').at(-1)).toMatchObject({ content: 'Later', author: 'Ren' })
    db.close()
  })
})
