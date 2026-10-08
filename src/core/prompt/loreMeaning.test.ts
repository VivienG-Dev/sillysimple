import { describe, expect, it } from 'vitest'
import type { Lorebook, LorebookEntry } from '@shared/types'
import { buildMessages } from './buildMessages'
import { activateLorebook } from './lorebook'
import { loreEntryText, lorePieces, loreScores, meaningCandidates, pickByMeaning } from './loreMeaning'

const entry = (content: string, keys: string[], extra: Partial<LorebookEntry> = {}): LorebookEntry => ({
  name: '',
  keys,
  secondaryKeys: [],
  selective: false,
  constant: false,
  enabled: true,
  caseSensitive: false,
  content,
  insertionOrder: 100,
  position: 'before_char',
  source: null,
  ...extra,
})

describe('what of a note is read', () => {
  const note = entry("{{char}}'s grandmother Tomoe runs a bakery.", ['grandmother', '/gran(ny|dma)/i', 'Tomoe'])
  const fill = (text: string): string => text.replace('{{char}}', 'Suzu')

  it('reads the note, its plain keys, or both, with the names filled in', () => {
    expect(loreEntryText(note, 'content', fill)).toBe("Suzu's grandmother Tomoe runs a bakery.")
    // A regular expression says nothing to a model: it is left out.
    expect(loreEntryText(note, 'keys', fill)).toBe('grandmother, Tomoe')
    expect(loreEntryText(note, 'both', fill)).toBe("grandmother, Tomoe: Suzu's grandmother Tomoe runs a bakery.")
    expect(loreEntryText(entry('Just a note.', []), 'both')).toBe('Just a note.')
  })

  it('leaves out the notes sent always, switched off or empty', () => {
    const entries = [entry('a', ['a']), entry('b', ['b'], { constant: true }), entry('c', ['c'], { enabled: false }), entry('  ', ['d']), entry('e', [])]
    expect(meaningCandidates(entries)).toEqual([0, 4])
  })
})

describe('the sentences read', () => {
  it('takes the latest messages, the newest first, without asterisks or quotes, short ones joined', () => {
    const pieces = lorePieces(['Old message about the sea.', '*She smiles.* "Hi." Where to first? We have the whole sky.', 'Yes. Do you still see your granny?'], 2)
    expect(pieces).toEqual([
      { text: 'Yes. Do you still see your granny?', age: 0 },
      { text: 'She smiles. Hi. Where to first?', age: 1 },
      { text: 'We have the whole sky.', age: 1 },
    ])
  })
})

describe('the scores', () => {
  it('is the best cosine over the sentences, or that less the average of the sentence with every note', () => {
    const notes = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ]
    const pieces = [[1, 0, 0]]
    const raw = loreScores(notes, pieces, 'raw')
    expect(raw[0]).toBeCloseTo(1)
    expect(raw[3]).toBeCloseTo(Math.SQRT1_2)
    const margin = loreScores(notes, pieces, 'margin')
    const average = (1 + 0 + 0 + Math.SQRT1_2) / 4
    expect(margin[0]).toBeCloseTo(1 - average)
    expect(margin[1]).toBeCloseTo(-average)
    // Too few notes to average: the cosine as it is.
    expect(loreScores(notes.slice(0, 2), pieces, 'margin')).toEqual(loreScores(notes.slice(0, 2), pieces, 'raw'))
  })

  it('calls from the threshold up, the closest first, a few at most, and not the notes the keywords call', () => {
    const scores = [0.1, 0.5, 0.3, 0.45, 0.2]
    expect(pickByMeaning(scores, { threshold: 0.25, most: 2 }).map((call) => call.index)).toEqual([1, 3])
    expect(pickByMeaning(scores, { threshold: 0.25, most: 2 }, new Set([1])).map((call) => call.index)).toEqual([3, 2])
    expect(pickByMeaning(scores, { threshold: 0.6, most: 2 })).toEqual([])
  })
})

describe('the lorebook with notes called by meaning', () => {
  const book: Lorebook = {
    name: 'Suzu',
    scanDepth: null,
    tokenBudget: null,
    entries: [entry('Biscuit is the broom.', ['Biscuit'], { insertionOrder: 10 }), entry('Tomoe is the grandmother.', ['Tomoe'], { insertionOrder: 20 }), entry('The guild.', ['guild'], { insertionOrder: 30, position: 'after_char' })],
  }
  const macros = { char: 'Suzu', user: 'Robin' }

  it('adds them to the ones the keywords call, in their order', () => {
    const lore = activateLorebook(book, ['Can I hold Biscuit?'], { macros, tokenBudget: 1000, byMeaning: new Set([2, 1]) })
    expect(lore).toEqual({ before: ['Biscuit is the broom.', 'Tomoe is the grandmother.'], after: ['The guild.'] })
  })

  it('gives them only the room the keyword ones leave', () => {
    // Room for one note: the keyword one keeps it, though the other has a higher order.
    const lore = activateLorebook(book, ['Can I hold Biscuit?'], { macros, tokenBudget: 7, byMeaning: new Set([1]) })
    expect(lore.before).toEqual(['Biscuit is the broom.'])
  })

  it('does not bring back a note that is switched off', () => {
    const off: Lorebook = { ...book, entries: book.entries.map((item, index) => (index === 1 ? { ...item, enabled: false } : item)) }
    expect(activateLorebook(off, ['Hello.'], { macros, tokenBudget: 1000, byMeaning: new Set([1]) }).before).toEqual([])
  })
})

describe('the messages for the model', () => {
  it('carry the notes called by meaning to the model', () => {
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
      lorebook: { name: 'Suzu', scanDepth: null, tokenBudget: null, entries: [entry('Tomoe, the grandmother, runs a bakery.', ['Tomoe'])] },
    } as unknown as Parameters<typeof buildMessages>[0]['character']
    const input = { character, persona: { name: 'Robin', description: '' }, systemPrompt: 'Play.', history: [{ role: 'user' as const, content: 'Your granny?' }] }
    expect(buildMessages(input)[0]!.content).not.toContain('Tomoe')
    expect(buildMessages({ ...input, loreByMeaning: new Set([0]) })[0]!.content).toContain('Tomoe, the grandmother, runs a bakery.')
  })
})
