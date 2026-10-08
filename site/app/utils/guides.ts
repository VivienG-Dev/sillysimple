import { GUIDES, type Guide } from '~/data/guides'

// The guides that are on the site: those whose film has been made.

export interface ReadyGuide extends Omit<Guide, 'film'> {
  film: Film
}

export const guides: ReadyGuide[] = GUIDES.flatMap((guide) => {
  const film = filmNamed(guide.film)
  if (!film) return []
  // One step for each part of the film: were they to differ, what both have is kept.
  const count = Math.min(guide.steps.length, film.steps.length)
  return [{ ...guide, steps: guide.steps.slice(0, count), film: { ...film, steps: film.steps.slice(0, count) } }]
})

/** "27 seconds", "1 minute 10": how long a film lasts, in words. */
export function filmLasts(film: Film): string {
  const seconds = Math.round(film.length)
  if (seconds < 60) return `${seconds} seconds`
  const rest = seconds % 60
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest}` : ''}`
}
