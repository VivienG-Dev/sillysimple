import { describe, expect, it } from 'vitest'
import { ambianceOf, MOOD_AMBIANCE } from './ambiance'
import { MOODS } from './detectMood'

describe('the light of the scene', () => {
  it('has three colours for every mood, all as light as one another', () => {
    for (const mood of MOODS) {
      const colours = MOOD_AMBIANCE[mood]
      expect(colours).toHaveLength(3)
      for (const colour of colours) expect(colour).toMatch(/^oklch\(0\.62 0\.\d+ \d+\)$/)
    }
  })

  it('stays out of the way when no mood is known', () => {
    expect(ambianceOf(null)).toBeNull()
    expect(ambianceOf('sad')).toBe(MOOD_AMBIANCE.sad)
  })

  it('never shouts: no colour is louder than a soft one', () => {
    const chromas = Object.values(MOOD_AMBIANCE).flat().map((colour) => Number(colour.split(' ')[1]))
    expect(Math.max(...chromas)).toBeLessThanOrEqual(0.16)
  })
})
