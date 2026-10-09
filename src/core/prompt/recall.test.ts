import { describe, expect, it } from 'vitest'
import { buildMessages } from './buildMessages'
import { NAME_BONUS, nameBonuses, pickRecalls, recallExcerpt, recallExchange, recallNote, recallPassages } from './recall'

describe('the pieces of an old message', () => {
  const message = '*She holds it in both hands.* "Robin, I cannot take it." Okay. I will keep it safe, I promise.'

  it('reads a message whole, by pairs of sentences, or sentence by sentence, short ones joined', () => {
    expect(recallPassages([message], 'message')).toEqual([
      { message: 0, from: 0, to: 4, text: 'She holds it in both hands. Robin, I cannot take it. Okay. I will keep it safe, I promise.' },
    ])
    expect(recallPassages([message], 'sentence').map((passage) => passage.text)).toEqual([
      'She holds it in both hands.',
      'Robin, I cannot take it. Okay.',
      'I will keep it safe, I promise.',
    ])
    expect(recallPassages([message, 'Thanks.'], 'pair').map((passage) => [passage.message, passage.from, passage.to])).toEqual([
      [0, 0, 3],
      [0, 1, 4],
      [1, 0, 1],
    ])
  })

  it('leaves out a message with nothing to read', () => {
    expect(recallPassages(['…', '*'], 'pair')).toEqual([])
  })
})

describe('the old messages brought back', () => {
  // Three old messages, a pair each, along three directions; the latest messages along the second.
  const passages = recallPassages(['One. Uno uno uno.', 'Two. Dos dos dos.', 'Three. Tres tres tres.', 'Four. Cuatro cuatro.'], 'message')
  const vectors = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]

  it('brings back the closest, from the threshold up, a few at most', () => {
    const calls = pickRecalls(passages, vectors, [[0.1, 1, 0.5, 0]], { method: 'raw', threshold: 0.4, most: 2 })
    expect(calls.map((call) => call.message)).toEqual([1, 2])
    expect(pickRecalls(passages, vectors, [[0.1, 1, 0.5, 0]], { method: 'raw', threshold: 0.4, most: 1 }).map((call) => call.message)).toEqual([1])
    expect(pickRecalls(passages, vectors, [[0.1, 1, 0.5, 0]], { method: 'raw', threshold: 0.99, most: 2 })).toEqual([])
  })

  it('brings back one at most with a small context', () => {
    expect(pickRecalls(passages, vectors, [[0.1, 1, 0.5, 0]], { method: 'raw', threshold: 0.4, most: 2 }, 2048)).toHaveLength(1)
  })

  it('scores a message by its closest piece', () => {
    const pairs = recallPassages(['It rained all day long. The bus was late again. She gave me a compass.'], 'pair')
    expect(pairs).toHaveLength(2)
    const calls = pickRecalls(
      pairs,
      [
        [1, 0],
        [0, 1],
      ],
      [[0, 1]],
      { method: 'raw', threshold: 0.5, most: 2 },
    )
    expect(calls).toEqual([{ message: 0, passage: pairs[1], score: 1 }])
  })
})

describe('names said again', () => {
  const old = [
    'The tag says Mochi. It is the flower shop on Hill Street.',
    'Robin met Suzu at the station on Monday.',
    'Mochi again, and Mochi once more.',
    'Mochi is everywhere today.',
    'Hill Street was closed.',
  ]

  it('weigh extra for the old messages that hold a rare one', () => {
    // Mochi is in three old messages: too common in this chat to say which one.
    expect(nameBonuses(old, ['How is Mochi doing these days?'])).toEqual([0, 0, 0, 0, 0])
    expect(nameBonuses(old.slice(0, 3), ['How is Mochi doing these days?'])).toEqual([NAME_BONUS, 0, NAME_BONUS])
    expect(nameBonuses(old, ['We should walk down Hill Street again.'])).toEqual([NAME_BONUS, 0, 0, 0, NAME_BONUS])
  })

  it("leave out the first word of a sentence, days, and the chat's own people", () => {
    expect(nameBonuses(old, ['Station food is great.'])).toEqual([0, 0, 0, 0, 0])
    expect(nameBonuses(old, ['See you on Monday.'])).toEqual([0, 0, 0, 0, 0])
    expect(nameBonuses(old, ['I told Robin about it.'], ['Robin', 'Suzu Amano'])).toEqual([0, 0, 0, 0, 0])
    expect(nameBonuses(old, ['I told Robin about it.'])).toEqual([0, NAME_BONUS, 0, 0, 0])
  })
})

describe('the exchange of an old message', () => {
  it('is a message of the user with the reply after it, a reply with the message before it', () => {
    const roles = ['user', 'assistant', 'user', 'assistant', 'assistant'] as const
    expect(recallExchange(0, roles)).toEqual([0, 1])
    expect(recallExchange(3, roles)).toEqual([2, 3])
    expect(recallExchange(4, roles)).toEqual([4])
    expect(recallExchange(2, ['assistant', 'assistant', 'user'])).toEqual([2])
  })
})

describe('what is given of an old message', () => {
  const long = Array.from({ length: 12 }, (_, index) => `Sentence ${index} has exactly six words.`).join(' ')

  it('gives a short message whole', () => {
    expect(recallExcerpt('*She smiles.* "Hi."', { from: 0, to: 1 })).toBe('*She smiles.* "Hi."')
  })

  it('gives a long one around what was found, with … where it was cut', () => {
    const excerpt = recallExcerpt(long, { from: 6, to: 7 }, 20)
    expect(excerpt).toBe('… Sentence 5 has exactly six words. Sentence 6 has exactly six words. Sentence 7 has exactly six words. …')
    expect(recallExcerpt(long, { from: 0, to: 1 }, 14).startsWith('Sentence 0')).toBe(true)
  })
})

describe('the note for the model', () => {
  it('names who said what, and nothing when there is nothing', () => {
    expect(recallNote([])).toBe('')
    const note = recallNote([
      { name: 'Robin', text: "Take this.\nIt was my grandfather's compass." },
      { name: 'Suzu', text: 'I will keep it safe.' },
    ])
    expect(note).toContain("Robin: Take this. It was my grandfather's compass.\nSuzu: I will keep it safe.")
    expect(note.startsWith('[')).toBe(true)
  })

  it("goes at the end of the user's message, never in the system message, and not when a reply is continued", () => {
    const character = {
      id: 'suzu',
      name: 'Suzu',
      tagline: '',
      description: 'A witch.',
      personality: '',
      scenario: '',
      firstMessage: '',
      alternateGreetings: [],
      exampleMessages: '',
      systemPrompt: '',
      postHistoryInstructions: '',
      tags: [],
      lorebook: null,
    } as unknown as Parameters<typeof buildMessages>[0]['character']
    const input = {
      character,
      persona: { name: 'Robin', description: '' },
      systemPrompt: 'Play.',
      history: [{ role: 'user' as const, content: 'Do you still have it?' }],
      recalled: [{ name: 'Robin', text: 'Take my compass.' }],
    }
    const messages = buildMessages(input)
    expect(messages[0]!.content).not.toContain('compass')
    expect(messages.at(-1)!.content).toMatch(/^Do you still have it\?\n\n\[Said earlier.*Robin: Take my compass\./s)
    const continued = buildMessages({ ...input, history: [...input.history, { role: 'assistant' as const, content: 'Yes, I' }], continuing: true })
    expect(continued.map((message) => message.content).join('\n')).not.toContain('compass')
  })
})
