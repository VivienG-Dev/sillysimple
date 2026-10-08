import { describe, expect, it } from 'vitest'
import type { Character, Lorebook, LorebookEntry } from '@shared/types'
import { buildMessages } from './buildMessages'
import { activateLorebook, keyMatches } from './lorebook'
import { applyMacros } from './macros'

const context = { char: 'Elara', user: 'Ren', persona: 'A tired sailor.' }

describe('applyMacros', () => {
  it('replaces the three macros, whatever the case or spacing', () => {
    expect(applyMacros('{{char}} greets {{ User }}. {{PERSONA}}', context)).toBe(
      'Elara greets Ren. A tired sailor.',
    )
  })

  it('replaces the older angle-bracket placeholders', () => {
    expect(applyMacros('<BOT> and <CHAR> look at <USER>', context)).toBe('Elara and Elara look at Ren')
  })

  it('leaves unknown macros untouched', () => {
    expect(applyMacros('{{time}} {{random}}', context)).toBe('{{time}} {{random}}')
  })
})

describe('buildMessages', () => {
  const character: Character = {
    id: 'elara',
    name: 'Elara',
    tagline: '',
    description: '{{char}} keeps the lighthouse.',
    personality: 'guarded',
    scenario: '',
    firstMessage: 'You are late, {{user}}.',
    alternateGreetings: [],
    exampleMessages: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    tags: [],
    lorebook: null,
  }

  it('puts the instructions and the card in one system message, skipping empty sections', () => {
    const [system] = buildMessages({
      character,
      persona: { name: 'Ren', description: '' },
      systemPrompt: 'You are {{char}}.',
      history: [],
    })

    expect(system).toEqual({
      role: 'system',
      content: "You are Elara.\n\nElara keeps the lighthouse.\n\nElara's personality: guarded",
    })
  })

  it('adds the sample dialogue of the card, without its <START> markers', () => {
    const [system] = buildMessages({
      character: { ...character, exampleMessages: '<START>\n{{user}}: Hi\n{{char}}: Hm.\n<START>\n{{char}}: Storm coming.' },
      persona: { name: 'Ren', description: '' },
      systemPrompt: '',
      history: [],
    })

    expect(system?.content).toContain('Examples of how Elara talks:\nRen: Hi\nElara: Hm.\n\nElara: Storm coming.')
    expect(system?.content).not.toContain('<START>')
  })

  it('keeps the conversation in order and fills macros inside it', () => {
    const messages = buildMessages({
      character,
      persona: { name: 'Ren', description: 'A tired sailor.' },
      systemPrompt: '',
      history: [
        { role: 'assistant', content: character.firstMessage },
        { role: 'user', content: 'Sorry.' },
      ],
    })

    expect(messages.map((message) => message.role)).toEqual(['system', 'assistant', 'user'])
    expect(messages[0]?.content).toContain('About Ren: A tired sailor.')
    expect(messages[1]?.content).toBe('You are late, Ren.')
  })

  const ren = { name: 'Ren', description: '' }

  it("uses the card's own instructions in place of the app's, unless that is turned off", () => {
    const own = { ...character, systemPrompt: 'Narrate for {{char}}. {{original}}' }
    const input = { character: own, persona: ren, systemPrompt: 'Never speak for {{user}}.', history: [] }

    expect(buildMessages(input)[0]?.content).toMatch(/^Narrate for Elara\. Never speak for Ren\.\n\nElara keeps/)
    expect(buildMessages({ ...input, useCardPrompts: false })[0]?.content).toMatch(/^Never speak for Ren\.\n\nElara keeps/)
  })

  it("adds the card's reminder to the user's last message, not as a message of its own", () => {
    const messages = buildMessages({
      character: { ...character, postHistoryInstructions: '[Reply as {{char}} only.]' },
      persona: ren,
      systemPrompt: '',
      history: [
        { role: 'assistant', content: 'You are late.' },
        { role: 'user', content: 'Sorry.' },
      ],
    })

    expect(messages.map((message) => message.role)).toEqual(['system', 'assistant', 'user'])
    expect(messages[2]?.content).toBe('Sorry.\n\n[Reply as Elara only.]')
  })

  it('places the lorebook entries the chat calls for around the description', () => {
    const lorebook: Lorebook = {
      name: '',
      scanDepth: null,
      tokenBudget: null,
      entries: [
        entry({ keys: ['harbor'], content: 'The harbor floods at night.' }),
        entry({ keys: ['{{char}}'], content: 'She limps.', position: 'after_char' }),
        entry({ keys: ['dragon'], content: 'There are no dragons.' }),
      ],
    }
    const [system] = buildMessages({
      character: { ...character, lorebook },
      persona: ren,
      systemPrompt: 'You are {{char}}.',
      history: [{ role: 'user', content: 'Elara, is the harbor safe?' }],
    })

    expect(system?.content).toBe(
      "You are Elara.\n\nThe harbor floods at night.\n\nElara keeps the lighthouse.\n\nElara's personality: guarded\n\nShe limps.",
    )
  })
})

function entry(fields: Partial<LorebookEntry>): LorebookEntry {
  return {
    name: '',
    keys: [],
    secondaryKeys: [],
    selective: false,
    constant: false,
    enabled: true,
    caseSensitive: false,
    content: '',
    insertionOrder: 100,
    position: 'before_char',
    source: null,
    ...fields,
  }
}

describe('lorebook', () => {
  const options = { macros: { char: 'Elara', user: 'Ren' }, tokenBudget: 1000 }
  const book = (entries: LorebookEntry[], extra: Partial<Lorebook> = {}): Lorebook => ({
    name: '',
    scanDepth: null,
    tokenBudget: null,
    entries,
    ...extra,
  })
  const active = (lorebook: Lorebook, messages: string[], tokenBudget = 1000): string[] => {
    const lore = activateLorebook(lorebook, messages, { ...options, tokenBudget })
    return [...lore.before, ...lore.after]
  }

  it('matches whole words, whatever the case, unless the entry says otherwise', () => {
    expect(keyMatches('cat', 'The Cat sleeps.', false)).toBe(true)
    expect(keyMatches('cat', 'A new category.', false)).toBe(false)
    expect(keyMatches('Cat', 'the cat sleeps', true)).toBe(false)
    expect(keyMatches('old harbor', 'Past the Old Harbor, then left.', false)).toBe(true)
    expect(keyMatches('C++ (old)', 'She wrote C++ (old) for years.', false)).toBe(true)
    expect(keyMatches('  ', 'anything', false)).toBe(false)
  })

  it('finds a key inside text written without spaces', () => {
    expect(keyMatches('灯台', '嵐の夜、灯台へ向かった。', false)).toBe(true)
  })

  it('accepts regular expressions as keys, and ignores broken ones', () => {
    expect(keyMatches('/harbou?r/i', 'Down at the Harbour.', false)).toBe(true)
    expect(keyMatches('/(unclosed/', 'unclosed', false)).toBe(false)
  })

  it('only looks at the latest messages', () => {
    const lorebook = book([entry({ keys: ['harbor'], content: 'Floods.' })], { scanDepth: 2 })
    expect(active(lorebook, ['the harbor', 'two', 'three'])).toEqual([])
    expect(active(lorebook, ['one', 'the harbor', 'three'])).toEqual(['Floods.'])
  })

  it('always includes constant entries, and never disabled or empty ones', () => {
    const lorebook = book([
      entry({ constant: true, content: 'Always.' }),
      entry({ keys: ['harbor'], content: 'Off.', enabled: false }),
      entry({ keys: ['harbor'], content: '   ' }),
    ])
    expect(active(lorebook, ['the harbor'])).toEqual(['Always.'])
  })

  it('asks for a secondary key too when the entry is selective', () => {
    const lorebook = book([entry({ keys: ['harbor'], secondaryKeys: ['night', 'storm'], selective: true, content: 'Floods.' })])
    expect(active(lorebook, ['the harbor at noon'])).toEqual([])
    expect(active(lorebook, ['the harbor in a storm'])).toEqual(['Floods.'])
  })

  it('orders entries by their number, and drops the lowest ones when room is short', () => {
    const lorebook = book([
      entry({ constant: true, content: 'c'.repeat(330), insertionOrder: 30 }),
      entry({ constant: true, content: 'a'.repeat(330), insertionOrder: 10 }),
      entry({ constant: true, content: 'b'.repeat(330), insertionOrder: 20 }),
    ])

    expect(active(lorebook, []).map((text) => text[0])).toEqual(['a', 'b', 'c'])
    // Each entry is about 100 tokens: only two fit in 250, and the highest numbers stay.
    expect(active(lorebook, [], 250).map((text) => text[0])).toEqual(['b', 'c'])
    // The lorebook's own budget counts when it is the smaller one.
    expect(active({ ...lorebook, tokenBudget: 120 }, []).map((text) => text[0])).toEqual(['c'])
  })
})
