// The guides: one thing at a time, shown by a film of the real app while the icon says
// what to do at each step.
//
// A guide goes with a film (scripts/film, data/films.json), and has one step for each part
// of that film, in the same order: the step that is being shown is the one the icon talks
// about. A guide whose film has not been made yet is not on the site (utils/guides.ts).
//
// What the icon says is written as it speaks in the app: "I", short sentences, the names
// of the buttons as they are on screen.

export interface GuideStep {
  title: string
  /** What the icon says while this part of the film plays. */
  says: string
}

export interface Guide {
  /** Its address: /guides/<slug>/. */
  slug: string
  title: string
  /** One or two sentences: what one can do after it. */
  summary: string
  /** The name of its film. */
  film: string
  steps: GuideStep[]
}

export const GUIDES: Guide[] = [
  {
    slug: 'first-chat',
    title: 'Your first chat',
    summary: 'From opening the app for the first time to the first message of a story: three questions, and a model that downloads by itself.',
    film: 'first-launch',
    steps: [
      {
        title: 'Open it',
        says: 'Open SillySimple. I come in and say hello. There is no account to create and nothing to set up first: three short steps and you are in.',
      },
      {
        title: 'Say your name',
        says: 'Type what characters should call you: your name, or the name of the role you play. You can change it anytime.',
      },
      {
        title: 'Get a model',
        says: 'A character needs a model to write its replies. Leave “On this computer” as it is and press Download on the model I recommend. It is the only long part: I keep an eye on the bar for you.',
      },
      {
        title: 'Pick a story',
        says: 'Eight stories come with the app. Pick one: the line under the list says how it begins, with your name in it. The others wait for you in the Library.',
      },
      {
        title: 'Start talking',
        says: 'Press Start chatting. The character speaks first. Answer in your own words, and put what you do between asterisks.',
      },
    ],
  },
  {
    slug: 'character-from-a-sentence',
    title: 'A character from one sentence',
    summary: 'You never have to write a character card: describe who you want to meet in one sentence, and the model writes the rest.',
    film: 'character',
    steps: [
      {
        title: 'Open a new character',
        says: 'In the Library, press New character. The card is empty. You could fill it in by hand, but the quick way is at the top.',
      },
      {
        title: 'Describe it in a sentence',
        says: 'Write who you want to meet, in one sentence. Press a mood or two if you like: Soft, Funny, Dark… Pressing one again makes it stronger.',
      },
      {
        title: 'Let the model write',
        says: 'Press Write it for me. The model writes the whole card: the name, who they are, how they talk, their first message. It takes a little while.',
      },
      {
        title: 'Read it, then create',
        says: 'Read it through and change what you like: it is your character. Then press Create character, and the chat opens on its first message.',
      },
    ],
  },
  {
    slug: 'import-characters',
    title: 'Bring your SillyTavern characters',
    summary: 'The character cards you already have work here: import them once and they are yours, with their greetings and their lorebook.',
    film: 'import',
    steps: [
      {
        title: 'Open the Library',
        says: 'Open the Library, above the list of characters. Everything you have is here, along with the stories that come with the app.',
      },
      {
        title: 'Import your cards',
        says: 'Press Import cards and pick your files, or drop them anywhere on the page. I read the PNG and JSON cards made for SillyTavern, with their greetings and their lorebook.',
      },
      {
        title: 'Start a chat',
        says: 'The character is yours now, kept as a card file on your computer. Click it and the chat opens on its first message.',
      },
    ],
  },
  {
    slug: 'several-characters',
    title: 'Several characters in one scene',
    summary: 'Up to four characters can share a chat. They answer in turn, and they can talk to each other.',
    film: 'scene',
    steps: [
      {
        title: 'Add a character',
        says: 'At the top of a chat, Add a character brings someone else into it. A bar shows who is there. A chat can hold up to four.',
      },
      {
        title: 'Write to both',
        says: 'Write as usual. Each of them answers in turn, in its own voice.',
      },
      {
        title: 'Make someone speak',
        says: 'Click a name in the bar to make that character speak now. That is how they talk to each other, without you writing a word.',
      },
    ],
  },
]
