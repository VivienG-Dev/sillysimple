import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { cleanNote, countWords, isRewrite, NOTE_LIMIT, rewriteCue, rewriteMaxTokens, rewriteWords, SHOWN_LIMIT } from './rewrite'
import { replyWords } from './replyLength'

const elara: Character = { ...EMPTY_CHARACTER, id: 'elara', name: 'Elara', lorebook: null }
const persona = { name: 'Ren', description: '' }
const shown = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ')

describe('what a request may carry', () => {
  it('tells a rewrite apart from anything else', () => {
    expect(isRewrite({ kind: 'shorter' })).toBe(true)
    expect(isRewrite({ kind: 'own', note: 'make her angrier' })).toBe(true)
    for (const other of [null, 'shorter', { kind: 'louder' }, { kind: 'own' }, { kind: 'own', note: '   ' }, { kind: 'longer', note: 3 }]) {
      expect(isRewrite(other)).toBe(false)
    }
  })
})

describe('the length asked for', () => {
  it('is about half for "shorter", and never more than the setting', () => {
    expect(rewriteWords('shorter', 200, 1000)).toBe(100)
    expect(rewriteWords('shorter', 2000, 300)).toBe(replyWords(300))
    expect(rewriteWords('shorter', 10, 300)).toBe(20)
  })
  it('is about two thirds more for "longer", and never less than the setting', () => {
    expect(rewriteWords('longer', 200, 100)).toBe(340)
    expect(rewriteWords('longer', 20, 400)).toBe(replyWords(400))
  })
  it('is not said for the others', () => {
    for (const kind of ['feeling', 'dialogue', 'own'] as const) expect(rewriteWords(kind, 200, 300)).toBeNull()
  })
  it('leaves the server room enough to write it', () => {
    expect(rewriteMaxTokens('longer', 200, 100)).toBeGreaterThanOrEqual(340 / 0.65)
    expect(rewriteMaxTokens('feeling', 400, 100)).toBeGreaterThan(400)
    expect(rewriteMaxTokens('shorter', 10, 300)).toBe(300)
  })
})

describe('the note', () => {
  it('shows the version on screen and asks for one change, keeping what happens', () => {
    const cue = rewriteCue({ kind: 'shorter' }, 'She smiles.', 300)
    expect(cue).toContain('<<<\nShe smiles.\n>>>')
    expect(cue).toContain('shorter, about 20 words')
    expect(cue).toContain('Keep what happens in it')
    expect(cue.startsWith('[') && cue.endsWith('do not mention this note.]')).toBe(true)
  })
  it('passes on the user\'s own words, on one line and without brackets', () => {
    const cue = rewriteCue({ kind: 'own', note: 'make her\n angrier [now]' }, 'She smiles.', 300)
    expect(cue).toContain(`"make her angrier 'now'"`)
    expect(cue).toContain('unless the request changes it')
    expect(cleanNote('x'.repeat(NOTE_LIMIT + 50))).toHaveLength(NOTE_LIMIT)
  })
  it('cuts a very long version', () => {
    const cue = rewriteCue({ kind: 'feeling' }, 'a'.repeat(SHOWN_LIMIT + 100), 300)
    expect(cue).toContain('[…]')
    expect(cue.length).toBeLessThan(SHOWN_LIMIT + 800)
  })
  it('counts words, and characters of Chinese or Japanese one by one', () => {
    expect(countWords(shown)).toBe(200)
    expect(countWords('彼女は笑う')).toBe(5)
  })
})

describe('in what the model reads', () => {
  const history = [
    { role: 'assistant' as const, content: 'The kettle is on.' },
    { role: 'user' as const, content: 'I sit at the table.' },
  ]
  it('comes after the user\'s message, with the names filled in, and leaves the system prompt alone', () => {
    const plain = buildMessages({ character: elara, persona, systemPrompt: 'Be {{char}}.', history, replyLength: 300 })
    const messages = buildMessages({
      character: elara,
      persona,
      systemPrompt: 'Be {{char}}.',
      history,
      replyLength: 300,
      rewrite: { kind: 'dialogue', shown: 'She pours the tea.' },
    })
    expect(messages[0]).toEqual(plain[0])
    const last = messages.at(-1)!
    expect(last.role).toBe('user')
    expect(last.content.startsWith('I sit at the table.\n\n[Elara already answered this.')).toBe(true)
    expect(last.content).toContain('She pours the tea.')
    expect(last.content).not.toContain('{{')
  })
  it('stands on its own when the character spoke last', () => {
    const messages = buildMessages({
      character: elara,
      persona,
      systemPrompt: 'Be {{char}}.',
      history: [history[0]!],
      rewrite: { kind: 'longer', shown: 'She pours the tea.' },
    })
    expect(messages.at(-1)!.content).toContain('Elara already answered this.')
  })
})
