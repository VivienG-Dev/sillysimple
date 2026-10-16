import type { Mood } from './detectMood'

// The light of the scene: a few slow, blurred patches of colour behind the chat that turn
// towards the mood of the character's last reply (Vivien, 15 October: "des cercles, du flou,
// et la couleur change en fonction"). Warm when they smile, cold when they are afraid,
// dim and blue when they are sad. It is a hint, never a show: the patches are faint, they
// drift slowly, and a change of mood fades over a few seconds.
//
// Each mood gives three colours, one per patch, all at the same lightness so that none of
// them jumps out and the text in front stays as legible whatever the mood.
// A first step: later the place and the time of day (night, rain, a fire) may tint it too.

/** Three colours, one per patch, as CSS oklch() values. */
export type Ambiance = readonly [string, string, string]

const tone = (hue: number, chroma = 0.12): string => `oklch(0.62 ${chroma} ${hue})`

export const MOOD_AMBIANCE: Record<Mood, Ambiance> = {
  joy: [tone(75), tone(50), tone(95, 0.1)], // gold, peach, warm yellow
  playful: [tone(30), tone(185, 0.1), tone(330, 0.1)], // coral, teal, pink
  love: [tone(355), tone(15), tone(320, 0.1)], // rose, warm red, magenta
  shy: [tone(350, 0.09), tone(300, 0.08), tone(20, 0.08)], // soft pink, lavender, blush
  anger: [tone(25, 0.16), tone(40, 0.14), tone(10, 0.12)], // red, ember, deep red
  surprise: [tone(200), tone(95, 0.11), tone(250, 0.1)], // cyan, yellow, blue
  question: [tone(190, 0.1), tone(280, 0.1), tone(230, 0.08)], // teal, violet, steel
  sad: [tone(250, 0.09), tone(230, 0.07), tone(270, 0.07)], // blue, slate, dusk
  nervous: [tone(120, 0.08), tone(85, 0.09), tone(150, 0.07)], // sickly green, ochre, sage
  sigh: [tone(280, 0.05), tone(240, 0.05), tone(60, 0.04)], // greyed lavender, grey blue, dust
  fear: [tone(290, 0.12), tone(255, 0.11), tone(200, 0.08)], // deep purple, cold blue, ice
  sleepy: [tone(265, 0.09), tone(240, 0.08), tone(300, 0.06)], // indigo, night blue, plum
  thinking: [tone(285, 0.09), tone(195, 0.08), tone(240, 0.07)], // violet, teal, blue
}

/** The ambiance for a mood, or null when none is known: the patches then take the app's own colour. */
export function ambianceOf(mood: Mood | null | undefined): Ambiance | null {
  return mood ? MOOD_AMBIANCE[mood] : null
}
