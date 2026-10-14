import { describe, expect, it } from 'vitest'
import type { MoodPick } from '@shared/types'
import { CARD_MOODS, cleanMoods, describeMoods, isCardMood, MAX_MOOD_LEVEL, MAX_MOODS, moodsSection } from './moods'
import { cardRequest } from './writeCard'

const LEVELS = [1, 2, 3] as const
const line = (pick: MoodPick): string => moodsSection([pick]).split('\n')[1] ?? ''

describe('the moods of a character', () => {
  it('are a known few, each with a sentence for the model at each of its three strengths', () => {
    expect(CARD_MOODS).toEqual(['soft', 'funny', 'dark', 'mysterious', 'sassy', 'spicy'])
    expect(MAX_MOOD_LEVEL).toBe(3)
    for (const mood of CARD_MOODS) {
      expect(isCardMood(mood)).toBe(true)
      const lines = LEVELS.map((level) => line({ mood, level }))
      expect(new Set(lines).size, mood).toBe(3)
      for (const text of lines) expect(text, mood).toMatch(/^- [A-Z][^:]+: \S/)
    }
    expect(isCardMood('hot')).toBe(false)
    expect(isCardMood(undefined)).toBe(false)
  })

  it('say at each strength how much is asked: a touch, plainly, all of it', () => {
    for (const mood of CARD_MOODS) {
      expect(line({ mood, level: 1 }), mood).toMatch(/^- A (little|soft|darker)/)
      expect(line({ mood, level: 3 }), mood).toMatch(/^- Very /)
      expect(line({ mood, level: 2 }), mood).not.toMatch(/^- (A |Very )/)
    }
  })

  it('are only trusted once checked: known ones, once each, a few at most, with a strength from 1 to 3', () => {
    expect(
      cleanMoods([{ mood: 'sassy', level: 3 }, { mood: 'nonsense', level: 2 }, { mood: 'sassy', level: 1 }, 'soft', null, { mood: 'soft' }, { mood: 'dark', level: 9 }]),
    ).toEqual([
      { mood: 'sassy', level: 3 },
      { mood: 'soft', level: 1 },
      { mood: 'dark', level: 1 },
    ])
    expect(cleanMoods([{ mood: 'funny', level: '2' }])).toEqual([{ mood: 'funny', level: 2 }])
    expect(cleanMoods(CARD_MOODS.map((mood) => ({ mood, level: 2 })))).toHaveLength(MAX_MOODS)
    expect(cleanMoods(undefined)).toEqual([])
    expect(cleanMoods('spicy')).toEqual([])
    expect(cleanMoods(['spicy'])).toEqual([])
  })

  it('are told to the model in the app’s order, whatever order they were pressed in', () => {
    const section = moodsSection([{ mood: 'spicy', level: 2 }, { mood: 'soft', level: 3 }])
    expect(section.split('\n').map((text) => text.split(':')[0])).toEqual(['The mood asked for. It colors the whole card', '- Very soft', '- Spicy'])
    expect(moodsSection([])).toBe('')
  })

  it('keeps an attitude and a sensual story apart, at every strength', () => {
    for (const level of LEVELS) {
      expect(line({ mood: 'sassy', level })).toMatch(/teases|mocks/)
      expect(line({ mood: 'sassy', level })).not.toMatch(/sensual|flirt|erotic|adult|attraction/)
      expect(line({ mood: 'spicy', level })).toMatch(/flirt|erotic/)
    }
  })

  it('has a spicy character written as an adult at every strength, whatever the idea says', () => {
    const adult = 'The character is an adult, whatever the idea says: in age (give it in the description, twenty-one or older), in body and in manner.'
    for (const level of LEVELS) expect(line({ mood: 'spicy', level }).endsWith(adult), `spicy ${level}`).toBe(true)
    for (const mood of CARD_MOODS.filter((other) => other !== 'spicy')) {
      for (const level of LEVELS) expect(line({ mood, level })).not.toContain('adult')
    }
  })

  it('never overturn who the idea says the character is', () => {
    const header = moodsSection([{ mood: 'spicy', level: 3 }]).split('\n')[0] ?? ''
    expect(header).toContain('Who the character is still comes from the idea')
    expect(header).not.toContain('the personality')
    for (const level of LEVELS) expect(line({ mood: 'spicy', level }), `spicy ${level}`).toMatch(/own way|who they are/)
    for (const mood of CARD_MOODS) {
      for (const level of [2, 3] as const) expect(line({ mood, level }), `${mood} ${level}`).toMatch(/own (way|voice)|who (they are|the character is)/)
    }
    expect(line({ mood: 'spicy', level: 3 })).not.toMatch(/bold and forward/)
  })

  it('are named with their strength in the log', () => {
    expect(describeMoods([{ mood: 'sassy', level: 1 }, { mood: 'spicy', level: 3 }])).toBe('sassy1+spicy3')
    expect(describeMoods([])).toBe('')
  })
})

describe('the request for a card, with moods', () => {
  it('puts them after the idea and before the tastes', () => {
    const picks: MoodPick[] = [{ mood: 'funny', level: 2 }]
    const [system, user] = cardRequest('a lighthouse keeper', { likes: ['mystery'], dislikes: [] }, picks)
    expect(system?.content).toBe(cardRequest('x')[0]?.content) // The instructions do not change.
    const parts = user?.content.split('\n\n') ?? []
    expect(parts[0]).toBe('The idea: a lighthouse keeper')
    expect(parts[1]).toBe(moodsSection(picks))
    expect(parts[2]).toMatch(/^About the person who will chat with the character/)
  })

  it('changes nothing when there are none', () => {
    expect(cardRequest('an idea', undefined, [])[1]?.content).toBe('The idea: an idea')
    expect(cardRequest('an idea')[1]?.content).toBe('The idea: an idea')
  })

  it('has the model invent the character when there is no idea', () => {
    const [, user] = cardRequest('   ', undefined, [{ mood: 'dark', level: 3 }, { mood: 'mysterious', level: 1 }])
    expect(user?.content).toMatch(/^There is no idea this time: surprise the person/)
    expect(user?.content).not.toContain('The idea:')
    expect(user?.content).toContain('- Very dark:')
    expect(user?.content).toContain('- A little mystery:')
    expect(cardRequest('')[1]?.content).toMatch(/^There is no idea this time/)
  })
})
