import { describe, expect, it } from 'vitest'
import type { Character, LorebookEntry } from '@shared/types'
import { createLoreByMeaning } from './loreByMeaning'

const entry = (content: string, keys: string[]): LorebookEntry => ({
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
})

const suzu = {
  name: 'Suzu',
  lorebook: {
    name: 'Suzu',
    scanDepth: null,
    tokenBudget: null,
    entries: [
      entry('Biscuit is the broom.', ['Biscuit']),
      entry("{{char}}'s grandmother runs a bakery.", ['grandmother']),
      entry('The guild of witches.', ['guild']),
      entry('Her headphones were her mother\'s.', ['headphones']),
    ],
  },
} as unknown as Character

/**
 * A model that knows four words: each text is a point along the words it holds, so a
 * note and a sentence that share one are close.
 */
const WORDS = ['broom', 'granny', 'grandmother', 'guild', 'headphones']
const vectorOf = (text: string): number[] => {
  const lower = text.toLowerCase()
  const vector = WORDS.map((word) => (lower.includes(word) ? 1 : 0))
  if (lower.includes('granny')) vector[2] = 1 // what "means the same" stands for here
  return [...vector, 0.1]
}

function fakeSense(answer = true) {
  const asked: string[][] = []
  return {
    asked,
    sense: {
      embed: async (texts: string[]) => {
        asked.push(texts)
        return answer ? texts.map(vectorOf) : null
      },
    },
  }
}

describe('lorebook notes called by meaning', () => {
  it('calls the note the chat talks about without its keyword, and asks about each note once', async () => {
    const { sense, asked } = fakeSense()
    const lines: string[] = []
    const call = createLoreByMeaning(sense, (line) => lines.push(line))
    const called = await call(suzu, ['Do you still see your granny on Sundays?'], 'Robin')
    expect([...called!]).toEqual([1])
    // The notes were asked about with the sentence, {{char}} filled in.
    expect(asked[0]!.some((text) => text.includes("Suzu's grandmother"))).toBe(true)
    expect(lines.at(-1)).toMatch(/^\[lore\] Suzu: by meaning "grandmother" /)
    // Never a word of the chat in the log.
    expect(lines.join('\n')).not.toContain('Sundays')

    await call(suzu, ['And your granny again?'], 'Robin')
    expect(asked[1]).toEqual(['And your granny again?'])
  })

  it('leaves to the keywords what they call, and calls nothing when nothing is close', async () => {
    const { sense } = fakeSense()
    const call = createLoreByMeaning(sense)
    // "grandmother" is a keyword: the keywords call it, the meaning adds nothing.
    expect([...(await call(suzu, ['Is your grandmother well?'], 'Robin'))!]).toEqual([])
    expect([...(await call(suzu, ['What a nice day.'], 'Robin'))!]).toEqual([])
  })

  it('says nothing when the model does not answer, or there is no lorebook', async () => {
    expect(await createLoreByMeaning(fakeSense(false).sense)(suzu, ['Your granny?'], 'Robin')).toBeUndefined()
    const none = { ...suzu, lorebook: null } as Character
    expect(await createLoreByMeaning(fakeSense().sense)(none, ['Your granny?'], 'Robin')).toBeUndefined()
  })
})
