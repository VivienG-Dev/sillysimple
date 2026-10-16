import { describe, expect, it } from 'vitest'
import { MOODS } from './detectMood'
import { DIRECTION_LINES, lineAt, MOOD_LINES, PLAIN_LINES, seededRandom, waitingLines } from './waiting'

describe('the lines of the wait', () => {
  it('name the character, and never use a pronoun or speak for the user', () => {
    const all = [...Object.values(MOOD_LINES).flat(), ...PLAIN_LINES]
    for (const line of all) {
      expect(line.startsWith('{{char}} ')).toBe(true)
      expect(line.endsWith('…')).toBe(true)
      expect(line).not.toMatch(/\b(he|she|they|his|her|their|him|them)\b/i)
      expect(line).not.toContain('{{user}}')
    }
  })

  it('exist for every mood', () => {
    for (const mood of MOODS) expect(MOOD_LINES[mood].length).toBeGreaterThanOrEqual(2)
  })

  it('start with the mood of the last reply, then go on with plain ones', () => {
    const lines = waitingLines({ name: 'Lyra', mood: 'shy', random: seededRandom('a') })
    expect(MOOD_LINES.shy.map((line) => line.replace('{{char}}', 'Lyra'))).toContain(lines[0])
    expect(lines.slice(1).sort()).toEqual(PLAIN_LINES.map((line) => line.replace('{{char}}', 'Lyra')).sort())
  })

  it('start with the stage direction when there is one, whatever the mood', () => {
    expect(waitingLines({ name: 'Lyra', mood: 'anger', direction: 'time' })[0]).toBe(DIRECTION_LINES.time)
  })

  it('start with a plain line when no mood is known, and never say the same thing twice in a row', () => {
    for (let seed = 0; seed < 30; seed++) {
      const lines = waitingLines({ name: 'Kai', random: seededRandom(String(seed)) })
      expect(new Set(lines).size).toBe(lines.length)
      expect(lines.length).toBe(PLAIN_LINES.length)
    }
  })

  it('are the same for the same reply, so the row does not flicker while it is redrawn', () => {
    const one = waitingLines({ name: 'Kai', mood: 'joy', random: seededRandom('reply-1') })
    const two = waitingLines({ name: 'Kai', mood: 'joy', random: seededRandom('reply-1') })
    expect(one).toEqual(two)
  })

  it('make do without a name', () => {
    expect(waitingLines({ name: '  ' })).toEqual(['Writing…'])
  })
})

describe('going through the lines', () => {
  const lines = ['first', 'a', 'b', 'c']
  it('shows the first one once, then loops over the others', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((step) => lineAt(lines, step))).toEqual(['first', 'a', 'b', 'c', 'a', 'b', 'c'])
    expect(lineAt(['only'], 5)).toBe('only')
    expect(lineAt([], 2)).toBe('')
  })
})
