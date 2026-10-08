import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { CONTINUE_CUE, joinContinuation, lengthInstruction, replyWords } from './replyLength'

const character = (id: string, name: string, fields: Partial<Character> = {}): Character => ({
  ...EMPTY_CHARACTER,
  id,
  name,
  lorebook: null,
  ...fields,
})
const elara = character('elara', 'Elara', { description: '{{char}} keeps the light.' })
const quill = character('quill', 'Quill')
const persona = { name: 'Ren', description: '' }

describe('the length to aim for', () => {
  it('turns the setting, in tokens, into a round number of words that fits in it', () => {
    expect(replyWords(300)).toBe(200)
    expect(replyWords(80)).toBe(50)
    expect(replyWords(800)).toBe(520)
    expect(replyWords(10)).toBe(20) // Never absurdly short.
  })

  it('is told to the model at the end of the system message', () => {
    const [system] = buildMessages({ character: elara, persona, systemPrompt: 'Be {{char}}.', history: [], replyLength: 300 })
    expect(system?.content.endsWith(lengthInstruction(300))).toBe(true)
    expect(system?.content).toContain('about 200 words')
  })

  it('is told even when the card brings its own instructions', () => {
    const [system] = buildMessages({
      character: { ...elara, systemPrompt: 'Only speak in riddles.' },
      persona,
      systemPrompt: 'Be {{char}}.',
      history: [],
      replyLength: 300,
    })
    expect(system?.content.startsWith('Only speak in riddles.')).toBe(true)
    expect(system?.content).toContain('about 200 words')
  })

  it('is left out when no length is given', () => {
    const [system] = buildMessages({ character: elara, persona, systemPrompt: 'Be {{char}}.', history: [] })
    expect(system?.content).not.toContain('words per reply')
  })
})

describe('continuing a reply that was cut short', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about the storm.', author: 'Ren' },
    { role: 'assistant' as const, content: 'It came from the north and', characterId: 'elara', author: 'Elara' },
  ]

  it('asks for the rest in a message after the reply, which stays as the model wrote it', () => {
    const messages = buildMessages({ character: elara, persona, systemPrompt: '', history, continuing: true })
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'Tell me about the storm.' },
      { role: 'assistant', content: 'It came from the north and' },
      { role: 'user', content: CONTINUE_CUE },
    ])
  })

  it('does the same in a chat with several characters, in place of the usual cue', () => {
    const messages = buildMessages({ character: elara, persona, systemPrompt: '', history, others: [quill], continuing: true })
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'Ren: Tell me about the storm.' },
      { role: 'assistant', content: 'It came from the north and' },
      { role: 'user', content: CONTINUE_CUE },
    ])
  })

  it("keeps the card's reminder after the request", () => {
    const messages = buildMessages({
      character: { ...elara, postHistoryInstructions: 'Stay in character.' },
      persona,
      systemPrompt: '',
      history,
      continuing: true,
    })
    expect(messages.at(-1)).toEqual({ role: 'user', content: `${CONTINUE_CUE}\n\nStay in character.` })
  })

  it('joins the two halves with a space only where one is needed', () => {
    expect(joinContinuation('from the north and', 'swept the bay')).toBe(' ')
    expect(joinContinuation('from the north and ', 'swept the bay')).toBe('')
    expect(joinContinuation('from the north and', ' swept the bay')).toBe('')
    expect(joinContinuation('from the north', ', then turned')).toBe('')
    expect(joinContinuation('matches Sarah', "'s")).toBe('')
    expect(joinContinuation('she said, “', 'Sit.”')).toBe('')
    expect(joinContinuation('a half-', 'open door')).toBe('')
    expect(joinContinuation('She stopped.', '"Sit," she said.')).toBe(' ')
    expect(joinContinuation('', 'Anything')).toBe('')
    expect(joinContinuation('Anything', '')).toBe('')
  })
})
