import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { createNameFilter, sceneHistory, sceneStops, summarize } from './scene'

const character = (id: string, name: string, fields: Partial<Character> = {}): Character => ({
  ...EMPTY_CHARACTER,
  id,
  name,
  lorebook: null,
  ...fields,
})

const elara = character('elara', 'Elara', { tagline: 'Lighthouse keeper', description: '{{char}} keeps the light.' })
const quill = character('quill', 'Quill', { description: '{{char}} teaches {{user}} philosophy.\nSecond line.' })
const mara = character('mara', 'Mara', { tagline: 'Archivist' })

const conversation = [
  { role: 'assistant' as const, content: 'You are late.', characterId: 'elara', author: 'Elara' },
  { role: 'user' as const, content: 'Sorry.', author: 'Ren' },
  { role: 'assistant' as const, content: 'Typical.', characterId: 'quill', author: 'Quill' },
  { role: 'assistant' as const, content: 'Sit down, both of you.', characterId: 'elara', author: 'Elara' },
  { role: 'user' as const, content: 'Fine.', author: 'Ren' },
]

describe('scene', () => {
  it('sums a character up in one line: its tagline, or else the start of its description', () => {
    expect(summarize(elara, 'Ren')).toBe('Lighthouse keeper')
    expect(summarize(quill, 'Ren')).toBe('Quill teaches Ren philosophy.') // Its own name, not the speaker's.
    expect(summarize(character('x', 'X', { description: 'word '.repeat(80) }), 'Ren').length).toBeLessThanOrEqual(200)
    expect(summarize(character('y', 'Y'), 'Ren')).toBe('')
  })

  it("tells the conversation from the speaker's side, with names on everyone else's lines", () => {
    expect(sceneHistory(conversation, quill, [elara], 'Ren')).toEqual([
      { role: 'user', content: 'Elara: You are late.\n\nRen: Sorry.' },
      { role: 'assistant', content: 'Typical.' },
      { role: 'user', content: 'Elara: Sit down, both of you.\n\nRen: Fine.' },
    ])
  })

  it('ends on its own line when the speaker spoke last: what it answers is added with the prompt', () => {
    const told = sceneHistory(conversation.slice(0, 4), elara, [quill], 'Ren')
    expect(told.map((message) => message.role)).toEqual(['assistant', 'user', 'assistant'])
  })

  it('keeps the name a line was written under when its character has left the chat', () => {
    const told = sceneHistory(conversation.slice(2, 3), elara, [mara], 'Ren')
    expect(told[0]?.content).toBe('Quill: Typical.')
  })

  it('stops the model at the start of a line by someone else', () => {
    expect(sceneStops([quill, mara], 'Ren')).toEqual(['\nRen:', '\nQuill:', '\nMara:'])
    expect(sceneStops([quill, mara, elara, character('z', 'Zed')], 'Ren')).toHaveLength(4) // Servers take a few at most.
  })

  it("builds a scene prompt: the speaker's whole card, one line for each of the others", () => {
    const messages = buildMessages({
      character: quill,
      others: [elara, mara],
      persona: { name: 'Ren', description: '' },
      systemPrompt: 'You are {{char}}.',
      history: conversation,
    })

    expect(messages[0]?.content).toBe(
      [
        'You are Quill.',
        'Quill teaches Ren philosophy.\nSecond line.',
        'This is a scene with several characters. Also present:\n- Elara: Lighthouse keeper\n- Mara: Archivist\n' +
          "Write only Quill's next reply. Do not write lines or actions for Ren or for the other characters.",
      ].join('\n\n'),
    )
    expect(messages.slice(1).map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages.at(-1)?.content).toBe('Elara: Sit down, both of you.\n\nRen: Fine.')
  })

  it("adds the speaker's reminder after the last line, whoever said it", () => {
    const messages = buildMessages({
      character: { ...elara, postHistoryInstructions: '[Reply as {{char}} only.]' },
      others: [quill],
      persona: { name: 'Ren', description: '' },
      systemPrompt: '',
      history: conversation.slice(0, 3),
    })
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Ren: Sorry.\n\nQuill: Typical.\n\n[Reply as Elara only.]' })
  })

  it('changes nothing for a chat with a single character', () => {
    const messages = buildMessages({
      character: elara,
      persona: { name: 'Ren', description: '' },
      systemPrompt: '',
      history: conversation.slice(0, 2),
    })
    expect(messages.slice(1)).toEqual([
      { role: 'assistant', content: 'You are late.' },
      { role: 'user', content: 'Sorry.' },
    ])
    expect(messages[0]?.content).not.toContain('scene')
  })
})

describe('createNameFilter', () => {
  const run = (name: string, pieces: string[]): string => {
    const filter = createNameFilter(name)
    return pieces.map((piece) => filter.push(piece)).join('') + filter.flush()
  }

  it("removes the speaker's own name from the start of a reply, however the pieces are cut", () => {
    expect(run('Elara Voss', ['Elara Voss: ', '*She turns.*'])).toBe('*She turns.*')
    expect(run('Elara Voss', ['El', 'ara', ' Vo', 'ss:', ' *She', ' turns.*'])).toBe('*She turns.*')
    expect(run('Elara Voss', ['\n elara voss:*She turns.*'])).toBe('*She turns.*')
  })

  it('leaves alone a reply that merely starts like the name', () => {
    expect(run('Elara Voss', ['Elara', ' Voss', ' turns', ' away.'])).toBe('Elara Voss turns away.')
    expect(run('Elara', ['Else', 'where.'])).toBe('Elsewhere.')
    expect(run('Elara', ['*She', ' turns.*', ' Elara: no.'])).toBe('*She turns.* Elara: no.')
  })

  it('gives back what it held when the reply ends early', () => {
    expect(run('Elara Voss', ['Ela'])).toBe('Ela')
    expect(run('Elara', [])).toBe('')
  })
})
