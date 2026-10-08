// The colours of the app, taken from a character's picture.
//
// The app has one set of colours (tokens.css): dark surfaces with a hint of violet, and a
// violet accent. To give each character its own mood, the same colours are turned towards
// the main colour of the character's picture: every colour keeps its lightness and about
// its strength, only its hue changes. So contrast and legibility stay what they were,
// and the design is the same: only the tint differs.
//
// The work is done in OKLCH, a colour space built so that "same lightness" and "same hue"
// mean what the eye sees (https://bottosson.github.io/posts/oklab/). In plain RGB or HSL,
// a yellow and a blue of the "same" lightness look nothing alike.

export interface Oklch {
  /** Lightness, 0 (black) to 1 (white). */
  l: number
  /** Chroma: how colourful, 0 (grey) to about 0.3. */
  c: number
  /** Hue, in degrees. */
  h: number
}

/** The main colour of a picture: its hue, and how colourful it is. */
export interface PictureColor {
  hue: number
  chroma: number
}

// --- sRGB <-> OKLCH ---------------------------------------------------------------

const toLinear = (value: number): number => {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (value: number): number => {
  const v = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

export function rgbToOklch(r: number, g: number, b: number): Oklch {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: lightness, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

/** The linear RGB of a colour, each channel 0 to 1 when the screen can show it. */
function toLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

/**
 * The colour as "#rrggbb". A colour too strong for the screen at that lightness and hue
 * is made less colourful until it fits: its lightness and hue are what must not move.
 */
export function oklchToHex(color: Oklch): string {
  const fits = (rgb: number[]): boolean => rgb.every((channel) => channel >= -0.0005 && channel <= 1.0005)
  let chroma = color.c
  let rgb = toLinearRgb({ ...color, c: chroma })
  for (let step = 0; step < 40 && !fits(rgb); step++) {
    chroma *= 0.94
    rgb = toLinearRgb({ ...color, c: chroma })
  }
  return `#${rgb.map((channel) => fromLinear(channel).toString(16).padStart(2, '0')).join('')}`
}

export function hexToOklch(hex: string): Oklch {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return rgbToOklch((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff)
}

// --- The main colour of a picture -------------------------------------------------

const HUE_BINS = 36
/** Below this, a pixel is grey for our purpose: its hue means nothing. */
const GREY = 0.04
/** A picture whose colourful pixels weigh less than this is black and white: it has no main colour. */
const MIN_WEIGHT = 0.00004

/**
 * The main colour of a picture, from its pixels: four bytes each, alpha last, colours in
 * the order given. A handful of pixels is enough (a picture shrunk to 32 by 32).
 * Null when the picture is grey, or nearly so.
 *
 * "Main" means the hue that carries the most colour, not the most surface: pixels count
 * by how colourful they are, squared. A red scarf wins over a wall of beige, and skin,
 * which is everywhere in portraits but never vivid, rarely wins.
 */
export function mainColor(pixels: ArrayLike<number>, order: 'rgba' | 'bgra' = 'rgba'): PictureColor | null {
  const bins = new Array<number>(HUE_BINS).fill(0)
  const samples: { h: number; c: number; weight: number }[] = []
  const count = Math.floor(pixels.length / 4)

  for (let index = 0; index < count; index++) {
    const offset = index * 4
    if (pixels[offset + 3]! < 128) continue // See-through: not part of the picture.
    const r = pixels[offset + (order === 'rgba' ? 0 : 2)]!
    const g = pixels[offset + 1]!
    const b = pixels[offset + (order === 'rgba' ? 2 : 0)]!

    const { l, c, h } = rgbToOklch(r, g, b)
    if (c < GREY || l < 0.2 || l > 0.96) continue // Grey, nearly black or nearly white.
    const weight = (c - GREY) ** 2
    bins[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS]! += weight
    samples.push({ h, c, weight })
  }

  const total = bins.reduce((sum, weight) => sum + weight, 0)
  if (count === 0 || total / count < MIN_WEIGHT) return null

  // The strongest hue, counting its two neighbours: a colour often straddles two bins.
  let best = 0
  let bestWeight = -1
  for (let bin = 0; bin < HUE_BINS; bin++) {
    const weight = bins[bin]! + (bins[(bin + 1) % HUE_BINS]! + bins[(bin + HUE_BINS - 1) % HUE_BINS]!) / 2
    if (weight > bestWeight) {
      bestWeight = weight
      best = bin
    }
  }
  const center = (best + 0.5) * (360 / HUE_BINS)

  // The average of the pixels around it. Hues are angles: they are averaged as arrows.
  let x = 0
  let y = 0
  let chroma = 0
  let weight = 0
  for (const sample of samples) {
    const distance = Math.abs(((sample.h - center + 540) % 360) - 180)
    if (distance > 20) continue
    x += Math.cos((sample.h * Math.PI) / 180) * sample.weight
    y += Math.sin((sample.h * Math.PI) / 180) * sample.weight
    chroma += sample.c * sample.weight
    weight += sample.weight
  }
  if (weight === 0) return null
  return { hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, chroma: chroma / weight }
}

// --- The app's colours, turned towards that colour --------------------------------

/** Colours this colourful or more are accents; the others are the near-greys of surfaces, lines and text. */
const ACCENT_CHROMA = 0.04
/** How colourful a picture's main colour has to be for the accents to keep their full strength. */
const FULL_STRENGTH = 0.12
/** A dull picture gives duller accents, but never below this share of their strength: buttons must still stand out. */
const MIN_STRENGTH = 0.6

/** How bright a colour is to the eye, 0 to 1, as contrast rules measure it (WCAG "relative luminance"). */
export function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return 0.2126 * toLinear((value >> 16) & 0xff) + 0.7152 * toLinear((value >> 8) & 0xff) + 0.0722 * toLinear(value & 0xff)
}

/**
 * The app's colours turned towards the main colour of a picture.
 * `tokens`: the colours as the design defines them (name -> "#rrggbb").
 *
 * Each colour keeps its brightness exactly, so every contrast of the design (text on its
 * background, white on a button) stays what it was, whatever the hue. Near-greys keep
 * their faint strength; accents keep theirs when the picture is colourful, and lose some
 * of it when the picture is muted.
 */
export function themeFor(color: PictureColor, tokens: Record<string, string>): Record<string, string> {
  const strength = Math.min(1, Math.max(MIN_STRENGTH, color.chroma / FULL_STRENGTH))
  return Object.fromEntries(
    Object.entries(tokens).map(([name, hex]) => {
      const { l, c } = hexToOklch(hex)
      const chroma = c >= ACCENT_CHROMA ? c * strength : c
      const target = luminance(hex)

      // The same lightness in OKLCH is nearly the same brightness, not exactly: a green
      // comes out a little brighter than a violet. The lightness is nudged until it matches.
      let low = Math.max(0, l - 0.12)
      let high = Math.min(1, l + 0.12)
      let themed = oklchToHex({ l, c: chroma, h: color.hue })
      for (let step = 0; step < 18; step++) {
        const middle = (low + high) / 2
        themed = oklchToHex({ l: middle, c: chroma, h: color.hue })
        if (luminance(themed) > target) high = middle
        else low = middle
      }
      return [name, themed]
    }),
  )
}
