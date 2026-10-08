import written from '~/data/notes.json'

// What the app noted by itself during a real chat: where the scene is, what the character
// wears, what it remembers, where the story is heading, the tastes it learned.
//
// data/notes.json is written by scripts/film/notes.cjs, which plays a short story in the
// real app with a real model. Never by hand: the page says these notes are the app's own.
// Until that script has been run the file holds `null`, and the page shows no notes.

export interface StoryNotes {
  /** The model that wrote the replies and the notes, as the app names it. */
  model: string
  character: string
  /** How many messages the chat had when the notes were read. */
  messages: number
  /** Where the scene was, each place it went through, in order. The last one is where it is. */
  places: string[]
  /** What the character wore, each time it changed. */
  outfits: string[]
  /** What is remembered of the first messages, once the chat outgrew what the model reads. */
  memory: { covers: number; text: string } | null
  /** Where the story seems to be heading. */
  heading: string | null
  likes: string[]
  dislikes: string[]
}

export const storyNotes = written as unknown as StoryNotes | null

/**
 * The values a note went through, without the times it was only worded anew: the app notes
 * the place again after each reply, and "The corner bakery" may come back as "A corner
 * bakery". The latest wording of each is kept.
 */
export function withoutRewordings(values: string[]): string[] {
  const bare = (text: string): string =>
    text
      .toLowerCase()
      .replace(/^(?:the|an?)\s+/, '')
      .replace(/[\s.]+$/, '')
  const kept: string[] = []
  for (const value of values) {
    if (kept.length > 0 && bare(kept.at(-1)!) === bare(value)) kept[kept.length - 1] = value
    else kept.push(value)
  }
  return kept
}
