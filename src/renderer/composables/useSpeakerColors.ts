import { hexToOklch, type PictureColor } from '@core/color/accent'
import type { Character } from '@shared/types'

// In a chat with several characters, each one gets a colour of their own: on their name
// and, lightly, on what they say (see formatMessage). The app's colours follow only the
// chat's own character, so without this every name would wear the same one.
// The colour is the one the app would take from that character (the main colour of their
// picture, or of their initials tile), at one lightness for all, readable on the dark.

/** Worked out once per picture (its address changes when the picture does), or per name. */
const colors = ref<Record<string, string>>({})
const asked = new Set<string>()

/** A text colour from a picture colour: always as light, never loud, never grey. */
export function speakerColor({ hue, chroma }: PictureColor): string {
  const c = Math.min(Math.max(chroma, 0.07), 0.13)
  return `oklch(0.8 ${c.toFixed(3)} ${Math.round(hue)})`
}

export function useSpeakerColors() {
  async function load(character: Pick<Character, 'id' | 'name' | 'portraitUrl'>, key: string): Promise<void> {
    let color = character.portraitUrl ? await window.api.characters.color(character.id).catch(() => null) : null
    if (!color) {
      // No picture, or a grey one: the colour of the tile that stands for the character.
      const tile = hexToOklch(avatarColors(character.name).fg)
      color = { hue: tile.h, chroma: tile.c }
    }
    colors.value[key] = speakerColor(color)
  }

  /** The colour of a character, once known (it is worked out the first time it is asked for). */
  function colorOf(character: Pick<Character, 'id' | 'name' | 'portraitUrl'>): string | undefined {
    const key = character.portraitUrl ?? `name:${character.name}`
    if (!asked.has(key)) {
      asked.add(key)
      void load(character, key)
    }
    return colors.value[key]
  }

  return { colorOf }
}
