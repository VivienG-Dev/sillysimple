import listed from '~/data/films.json'

// The films of the page. Each is the real app, filmed by a script (scripts/film), and
// data/films.json says how long it lasts and when each of its parts starts: that file is
// written by scripts/film/assemble.cjs, never by hand.
//
// Two of them are on the home page: the chat at the top, the first launch under "Three
// questions". Were the chat missing from films.json, the first launch would take the top.
// The others belong to the guides (data/guides.ts): a guide is on the site once its film is.

export interface FilmStep {
  /** When this part starts, in seconds. */
  at: number
  label: string
}

export interface Film {
  /** Its files are public/film/<name>.webm, .mp4 and -poster.webp. */
  name: string
  length: number
  steps: FilmStep[]
  /** What it shows, for someone who cannot see it. */
  shows: string
  /** Said under it, when what it shows is not quite what happens. */
  note?: string
}

const ABOUT: Record<string, Pick<Film, 'shows' | 'note'>> = {
  'first-launch': {
    shows:
      'A film of SillySimple being opened for the first time: its icon comes in and says hello, a name is typed, a model is downloaded while the icon watches the bar, a story is picked, and the chat opens on the character’s first message.',
    note: 'The download is shortened here: the model is 4.6 GB.',
  },
  import: {
    shows:
      'A film of SillySimple’s Library: “Import cards” is pressed, a character card made for SillyTavern is picked, the character appears among the others with its picture, and a chat with it is opened.',
  },
  character: {
    shows:
      'A film of SillySimple writing a character: “New character” is opened, one sentence is typed, a mood is pressed, the model fills in the whole card, and the character is created and says its first message.',
    note: 'The model’s writing is sped up here.',
  },
  scene: {
    shows:
      'A film of a chat with two characters in SillySimple: a second character is brought in, a line is written to both, each answers in turn, and a click on a name makes that character speak again.',
  },
  chat: {
    shows:
      'A film of a chat in SillySimple: a line is written to the character, the character answers, another version of the reply is asked for, and the character’s mood plays on its picture.',
  },
}

function film(name: string): Film | null {
  const made = (listed as Record<string, { length: number; steps: FilmStep[] } | undefined>)[name]
  return made ? { name, ...made, ...ABOUT[name]! } : null
}

/** A film by its name, or null when it has not been made yet. */
export const filmNamed = film

const launch = film('first-launch')
const chat = film('chat')

/** At the top of the page: the chat once it is filmed, the first launch until then. */
export const topFilm = chat ?? launch
/** In "Three questions": the first launch, once the top of the page has a film of its own. */
export const launchFilm = chat ? launch : null
