// Until characters have real portraits, each one gets initials on a colored tile.
// The color is picked from the name's letters, so it stays the same between launches.
// The user's own persona always gets the same color, so it is easy to spot.

export interface AvatarColors {
  /** Small tile: background and letters */
  bg: string
  fg: string
  /** Large portrait area: background and faded letters */
  portraitBg: string
  portraitFg: string
}

const PALETTE: AvatarColors[] = [
  { bg: '#3a2f55', fg: '#cbbcff', portraitBg: '#2a2340', portraitFg: '#4e4370' },
  { bg: '#4a3326', fg: '#f0c3a0', portraitBg: '#3a2a20', portraitFg: '#6a4a36' },
  { bg: '#24403a', fg: '#9fdcc9', portraitBg: '#1f3530', portraitFg: '#3d6359' },
  { bg: '#40263b', fg: '#efb0de', portraitBg: '#351f31', portraitFg: '#63395b' },
  { bg: '#3a3a24', fg: '#e3e09c', portraitBg: '#33331f', portraitFg: '#5f5f37' },
  { bg: '#263547', fg: '#a9cbee', portraitBg: '#1f2c3b', portraitFg: '#3b5470' },
]

export const PERSONA_COLORS: AvatarColors = PALETTE[2]!

export function avatarColors(name: string): AvatarColors {
  // FNV-1a: a tiny hash that spreads similar names over different colors.
  let hash = 2166136261
  for (const char of name) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return PALETTE[hash % PALETTE.length]!
}

/** "Elara Voss" -> "EV", "Nyx" -> "NY" */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[1]![0]!
  return letters.toUpperCase()
}
