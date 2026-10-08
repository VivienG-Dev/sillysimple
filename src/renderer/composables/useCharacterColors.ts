import { hexToOklch, themeFor, type PictureColor } from '@core/color/accent'

// The app takes its tint from the character on screen: its accent and its dark surfaces
// turn towards the main colour of the character's picture (or of its initials tile, when
// it has no picture). The design does not change: same lightness, same contrasts, another
// hue. See src/core/color/accent.ts. Called once, in App.vue.

/** The colours of tokens.css that follow the character. States (success, danger…) keep their meaning. */
const THEMED = [
  '--bg-sidebar',
  '--bg-sunken',
  '--bg-app',
  '--bg-panel',
  '--bg-field',
  '--bg-card',
  '--bg-button',
  '--bg-active',
  '--bg-tile',
  '--bg-selected',
  '--border',
  '--border-field',
  '--border-strong',
  '--border-input',
  '--border-hover',
  '--text',
  '--text-prose',
  '--text-soft',
  '--text-tag',
  '--text-action',
  '--text-muted',
  '--text-dim',
  '--text-faint',
  '--text-ghost',
  '--accent',
  '--accent-hover',
  '--accent-strong',
  '--accent-text',
  '--accent-soft',
  '--accent-bg',
]
const FADE = '0.45s ease'

export function useCharacterColors(): void {
  const charactersStore = useCharactersStore()
  const settingsStore = useSettingsStore()
  const root = document.documentElement

  // The design's own colours, read from the stylesheet before anything is changed.
  const styles = getComputedStyle(root)
  const design = Object.fromEntries(THEMED.map((name) => [name, styles.getPropertyValue(name).trim()]))

  // Telling the browser these variables are colours lets it fade from one to the next,
  // everywhere they are used, instead of switching at once.
  for (const name of THEMED) {
    try {
      CSS.registerProperty({ name, syntax: '<color>', inherits: true, initialValue: design[name]! })
    } catch {
      // Already registered: the page was reloaded by the dev server.
    }
  }
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)')
  const setFade = (): void => {
    root.style.transition = calm.matches ? '' : THEMED.map((name) => `${name} ${FADE}`).join(', ')
  }
  setFade()
  calm.addEventListener('change', setFade)

  function apply(colors: Record<string, string> | null): void {
    for (const name of THEMED) {
      if (colors) root.style.setProperty(name, colors[name]!)
      else root.style.removeProperty(name)
    }
    window.api.setWindowColor(colors?.['--bg-app'] ?? design['--bg-app']!)
  }

  /** Colours already worked out, by picture (its address changes when the picture does) or by name. */
  const known = new Map<string, PictureColor | null>()

  async function colorOf(character: { id: string; name: string; portraitUrl?: string }): Promise<PictureColor | null> {
    const key = character.portraitUrl ?? `name:${character.name}`
    if (!known.has(key)) {
      let color = character.portraitUrl ? await window.api.characters.color(character.id).catch(() => null) : null
      if (!color) {
        // No picture, or a grey one: the colour of the tile that stands for the character.
        const tile = hexToOklch(avatarColors(character.name).fg)
        color = { hue: tile.h, chroma: tile.c }
      }
      known.set(key, color)
    }
    return known.get(key) ?? null
  }

  let latest = 0
  watch(
    () => {
      const character = charactersStore.active
      // Not during the first-launch screens: those show the app's own colours.
      const on = settingsStore.appearance.characterColors && settingsStore.onboardingDone
      return on && character ? { id: character.id, name: character.name, portraitUrl: character.portraitUrl } : null
    },
    async (character) => {
      const mine = ++latest
      const color = character ? await colorOf(character) : null
      if (mine !== latest) return // Another character was chosen meanwhile.
      apply(color ? themeFor(color, design) : null)
    },
    { immediate: true, deep: true },
  )
}
