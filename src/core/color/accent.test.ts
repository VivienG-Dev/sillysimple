import { describe, expect, it } from 'vitest'
import { hexToOklch, luminance, mainColor, oklchToHex, rgbToOklch, themeFor } from './accent'

/** Pixels of one colour, as four bytes each. */
const fill = (count: number, [r, g, b]: [number, number, number], alpha = 255): number[] =>
  Array.from({ length: count }, () => [r, g, b, alpha]).flat()
const contrast = (a: string, b: string): number => {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (bright + 0.05) / (dark + 0.05)
}
/** How far apart two hues are, in degrees. */
const apart = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180)

describe('colour conversions', () => {
  it('knows black, white and the three primaries', () => {
    expect(rgbToOklch(0, 0, 0).l).toBeCloseTo(0, 3)
    expect(rgbToOklch(255, 255, 255).l).toBeCloseTo(1, 3)
    expect(rgbToOklch(255, 255, 255).c).toBeLessThan(0.001)
    expect(rgbToOklch(255, 0, 0).h).toBeCloseTo(29.2, 0)
    expect(rgbToOklch(0, 255, 0).h).toBeCloseTo(142.5, 0)
    expect(rgbToOklch(0, 0, 255).h).toBeCloseTo(264.1, 0)
  })

  it('goes there and back without changing a colour', () => {
    for (const hex of ['#6d5ce0', '#1b1a22', '#ecebf2', '#3fb97a', '#f2a4a4', '#000000', '#ffffff']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })

  it('tones down a colour the screen cannot show, keeping its hue', () => {
    const hex = oklchToHex({ l: 0.56, c: 0.4, h: 150 }) // No screen shows a green this strong at this lightness.
    const shown = hexToOklch(hex)
    expect(shown.c).toBeLessThan(0.25)
    expect(apart(shown.h, 150)).toBeLessThan(3)
    expect(shown.l).toBeCloseTo(0.56, 1)
  })
})

describe('the main colour of a picture', () => {
  it('is the colour of a picture of one colour', () => {
    const color = mainColor(fill(64, [200, 40, 40]))
    expect(apart(color!.hue, rgbToOklch(200, 40, 40).h)).toBeLessThan(1)
    expect(color!.chroma).toBeCloseTo(rgbToOklch(200, 40, 40).c, 2)
  })

  it('is the vivid colour, even when a dull one covers more of the picture', () => {
    // A red scarf on a wall of beige: three quarters beige.
    const color = mainColor([...fill(300, [205, 190, 165]), ...fill(100, [200, 30, 40])])
    expect(apart(color!.hue, rgbToOklch(200, 30, 40).h)).toBeLessThan(5)
  })

  it('is not the skin of a portrait when there is hair or clothing with more colour', () => {
    const color = mainColor([...fill(500, [232, 190, 165]), ...fill(250, [40, 90, 200]), ...fill(250, [20, 20, 25])])
    expect(apart(color!.hue, rgbToOklch(40, 90, 200).h)).toBeLessThan(5)
  })

  it('ignores what is black, white, grey or see-through', () => {
    const picture = [...fill(400, [10, 10, 12]), ...fill(400, [250, 250, 250]), ...fill(400, [128, 128, 130]), ...fill(400, [255, 0, 0], 0)]
    expect(mainColor(picture)).toBeNull()
    expect(mainColor([...picture, ...fill(200, [30, 160, 90])])!.hue).toBeCloseTo(rgbToOklch(30, 160, 90).h, 0)
  })

  it('finds none in a black-and-white picture, or in no picture at all', () => {
    expect(mainColor(fill(100, [90, 90, 90]))).toBeNull()
    expect(mainColor([])).toBeNull()
  })

  it('averages a colour that straddles the edge of the colour wheel', () => {
    // Two reds on either side of 0 degrees: the average is a red, not a cyan.
    const color = mainColor([...fill(100, [220, 40, 110]), ...fill(100, [225, 45, 85])])
    expect(apart(color!.hue, 5)).toBeLessThan(15)
  })

  it('reads pixels given blue first, as Electron hands them over', () => {
    const rgba = mainColor(fill(50, [30, 90, 200]))
    const bgra = mainColor(fill(50, [200, 90, 30]), 'bgra')
    expect(bgra!.hue).toBeCloseTo(rgba!.hue, 5)
  })
})

describe("the app's colours turned towards a picture", () => {
  const tokens = {
    '--accent': '#6d5ce0',
    '--accent-text': '#b4a9ff',
    '--bg-app': '#1b1a22',
    '--bg-selected': '#34324a',
    '--text': '#ecebf2',
    '--text-faint': '#8f8da0',
  }
  const hues = Array.from({ length: 24 }, (_, index) => index * 15)

  it('takes the hue of the picture for every colour', () => {
    const themed = themeFor({ hue: 150, chroma: 0.15 }, tokens)
    expect(apart(hexToOklch(themed['--accent']!).h, 150)).toBeLessThan(4)
    expect(apart(hexToOklch(themed['--accent-text']!).h, 150)).toBeLessThan(4)
    expect(Object.keys(themed)).toEqual(Object.keys(tokens))
  })

  it('keeps every contrast of the design, whatever the hue', () => {
    const pairs: [string, string][] = [
      ['--text', '--bg-app'],
      ['--text-faint', '--bg-app'],
      ['--accent-text', '--bg-app'],
      ['--text', '--bg-selected'],
    ]
    for (const hue of hues) {
      const themed = themeFor({ hue, chroma: 0.18 }, tokens)
      for (const [front, back] of pairs) {
        const before = contrast(tokens[front as keyof typeof tokens], tokens[back as keyof typeof tokens])
        expect(contrast(themed[front]!, themed[back]!) / before).toBeGreaterThan(0.97)
      }
      // White text on the accent, as on the main buttons.
      expect(contrast('#ffffff', themed['--accent']!) / contrast('#ffffff', tokens['--accent'])).toBeGreaterThan(0.97)
    }
  })

  it('leaves the surfaces as dark and as nearly grey as they were', () => {
    for (const hue of hues) {
      const background = hexToOklch(themeFor({ hue, chroma: 0.2 }, tokens)['--bg-app']!)
      expect(background.c).toBeLessThan(0.025)
      expect(luminance(oklchToHex(background))).toBeCloseTo(luminance(tokens['--bg-app']), 2)
    }
  })

  it('gives a muted picture muted accents, but never washed out', () => {
    const vivid = hexToOklch(themeFor({ hue: 30, chroma: 0.2 }, tokens)['--accent']!)
    const muted = hexToOklch(themeFor({ hue: 30, chroma: 0.05 }, tokens)['--accent']!)
    const dullest = hexToOklch(themeFor({ hue: 30, chroma: 0.001 }, tokens)['--accent']!)
    expect(muted.c).toBeLessThan(vivid.c)
    expect(dullest.c).toBeCloseTo(muted.c, 2) // There is a floor.
    expect(dullest.c).toBeGreaterThan(0.09)
  })

  it('gives back the design itself for a picture of its own violet', () => {
    const own = hexToOklch(tokens['--accent'])
    const themed = themeFor({ hue: own.h, chroma: 0.2 }, { '--accent': tokens['--accent'] })
    expect(contrast(themed['--accent']!, tokens['--accent'])).toBeLessThan(1.03)
  })
})
