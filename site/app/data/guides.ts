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
        says: 'A few stories come with the app. Pick one: the line under the list says how it begins, with your name in it. The others wait for you in the Library.',
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
  {
    slug: 'steer-the-story',
    title: 'Take the story where you want',
    summary: 'Steer the story with a click instead of a paragraph: make something happen, try another version, fix a reply, or let the character carry on.',
    film: 'steer',
    steps: [
      {
        title: 'Something happens',
        says: 'Above the box, press Something happens. You do not have to write a word: the next reply brings a surprise. Somewhere else moves the scene, Later… lets time pass. A small tag on the reply says what you asked for.',
      },
      {
        title: 'Another version',
        says: 'Not what you hoped for? Press the arrow under the reply and the model writes another version. The arrows go back and forth between them: the one on screen is the one the story keeps.',
      },
      {
        title: 'Change a reply',
        says: 'Put the pointer on a reply and press the pencil, Edit. Change a word, a name, a whole line, then press Save. The character goes on from what you wrote.',
      },
      {
        title: 'More…',
        says: 'With the box empty, press More… and the character carries on by itself, without waiting for you. And to tell the model something outside the story, OOC writes “(OOC: )” in the box.',
      },
    ],
  },
  {
    slug: 'online-service',
    title: 'Replies from an online service',
    summary: 'No graphics card? Let an online service like OpenRouter write the replies, with a key of your own. It is quick on any computer, and costs a little for each message.',
    film: 'online',
    steps: [
      {
        title: 'Open Settings',
        says: 'Press the gear at the bottom left, next to your name. Settings open on Connection: where replies come from. On a computer without a graphics card, the page says it there: an online service is quicker.',
      },
      {
        title: 'Choose Online service',
        says: 'Choose Online service, then OpenRouter. One key for hundreds of models, some of them free. Claude, OpenAI and Mistral work the same way, each with its own key.',
      },
      {
        title: 'Get a key',
        says: 'The link next to it opens OpenRouter’s page for keys. Make an account there and create a key. Each reply costs a little, on your OpenRouter account. The free models cost nothing.',
      },
      {
        title: 'Paste it',
        says: 'Paste your key in the field and press Check. I keep it on your computer, encrypted, and only ever send it to OpenRouter. It is never part of a backup.',
      },
      {
        title: 'Choose a model, then Save',
        says: 'OpenRouter’s models come in a list. Type a name in Search models, pick one, and press Save.',
      },
      {
        title: 'Chat as before',
        says: 'Back to chat, and write as usual. The reply now comes from OpenRouter. To write it, the conversation and the character’s card are sent there. Nothing else leaves your computer.',
      },
    ],
  },
  {
    slug: 'improve-a-character',
    title: 'Make a character better',
    summary: 'The app tells you what is missing from a character, and the model can write that part for you. Then give it traits it can act out, and notes it remembers when they come up.',
    film: 'improve',
    steps: [
      {
        title: 'Read the advice',
        says: 'When a character is missing something important, a line says so under its name: “One thing would make this character work better”. Click it. The editor opens with my advice at the top, the most important first.',
      },
      {
        title: 'Let the model fix it',
        says: 'Most tips have a button. Press Write a fuller one, and the model rewrites that part to fit the rest of the card. Read it and change what you like. If you don’t like it, press Undo.',
      },
      {
        title: 'One trait per line',
        says: 'In Personality, put one trait per line, and say what the character does that shows it. “Kind: he slips a warm roll into the bag of anyone who looks tired.” The model plays a trait much better when it sees it in action.',
      },
      {
        title: 'Add notes to the lorebook',
        says: 'In the Lorebook tab, press Add an entry. Write a few keywords, then the note. The model only reads the note when one of its keywords comes up in the chat. Press Save when you are done.',
      },
    ],
  },
  {
    slug: 'long-stories',
    title: 'Long stories',
    summary: 'A model reads only so much at once. When a story grows longer than that, I keep a summary of its beginning, and you can read it and correct it.',
    film: 'memory',
    steps: [
      {
        title: 'Watch the gauge',
        says: 'Under the box, Context says how much of the story the model reads at once, and the bar fills as you talk. When it is full, it says how many of the oldest messages are left out. Click it to change the size in the settings.',
      },
      {
        title: 'Remembering earlier messages…',
        says: 'They are not lost. At your next message, Remembering earlier messages… shows for a moment: the model sums up the oldest messages into the memory of the chat, then answers.',
      },
      {
        title: 'Read the memory',
        says: 'In the panel on the right, open Memory. Under “What is remembered of the first … messages” is that summary. The model no longer reads those messages: it reads this instead.',
      },
      {
        title: 'Correct it',
        says: 'It is your story: change what the model got wrong, or add what it must not forget. It is saved when you click elsewhere. Start over throws it away, and the model writes it anew at the next reply.',
      },
    ],
  },
  {
    slug: 'share-a-character',
    title: 'Share your character',
    summary: 'Sign your character with your name and export its card: one file that works in SillyTavern and can be posted on chub.ai.',
    film: 'share',
    steps: [
      {
        title: 'Sign it with your name',
        says: 'Press Edit. In the Description tab, under Tags, type your name or pseudonym in Author, then press Save. Now it says “by” and your name under the character, and the credit goes wherever the card goes.',
      },
      {
        title: 'Export the card',
        says: 'Next to the heart, press the little arrow pointing down. Your computer asks where to save the card, and the arrow becomes a tick once it is saved. That is all: it is one file.',
      },
      {
        title: 'Share it anywhere',
        says: 'If your character has a picture, the card is that picture, with the whole character hidden inside: description, greetings, lorebook, your name. Open it in SillyTavern, send it to a friend, or post it on chub.ai.',
      },
    ],
  },
  {
    slug: 'who-you-are',
    title: 'Who you are in the story',
    summary: 'Tell characters who they are talking to, and keep a different persona for each kind of story.',
    film: 'persona',
    steps: [
      {
        title: 'Say who you are',
        says: 'Open the Persona tab, beside Character. Your name is what characters call you: wherever a card says {{user}}, they read your name. About you is optional: a few words the character reads before every reply, so it knows who it is talking to.',
      },
      {
        title: 'Make another persona',
        says: 'Press New persona for another kind of story. Type a name over “New persona”, then a few words in About you. Each persona keeps its own name and its own words.',
      },
      {
        title: 'Switch who you are',
        says: 'With two personas or more, You are appears at the top: pick who you are now. Your name at the bottom left is a menu too. Your next message is written as them, in every chat. What was already said stays as it was.',
      },
    ],
  },
  {
    slug: 'give-a-voice',
    title: 'Give a character a voice',
    summary: 'Have the replies read aloud, each character with a voice of its own, with a key from ElevenLabs.',
    film: 'voice',
    steps: [
      {
        title: 'Open Settings › Voice',
        says: 'Press the gear at the bottom left, then Voice. It stays on No voice until you choose: then nothing is sent to any voice service.',
      },
      {
        title: 'Choose ElevenLabs',
        says: 'Choose ElevenLabs. Get an ElevenLabs key opens their page: give the key Text to Speech and Voices: Read. Paste it and press Check. Its voices arrive, and the first one becomes the Voice of everyone. ElevenLabs is paid by the character read.',
      },
      {
        title: "Pick the character's voice",
        says: 'Back in the chat, under the character’s name in the panel beside it, pick a Voice of its own. The play button next to it lets you hear it first: that is ElevenLabs’ own sample, and it is free.',
      },
      {
        title: 'Read aloud',
        says: 'Point at a message and press the speaker button to read it aloud. Press it again to stop. Only the text of the replies you listen to is sent to ElevenLabs. To hear every reply as it arrives, turn on Read replies aloud as they arrive in Settings › Voice.',
      },
    ],
  },
  {
    slug: 'backup',
    title: 'Keep your stories safe',
    summary: 'One .zip file holds your characters, chats and settings. Keep it somewhere safe, or use it to move to another computer.',
    film: 'backup',
    steps: [
      {
        title: 'Open Data & Privacy',
        says: 'Press the gear at the bottom left, then Data & Privacy. Everything you have is in one folder on this computer. Its place is written here, and Show folder opens it.',
      },
      {
        title: 'Save a backup',
        says: 'Press Save a backup… and choose where to keep it. It is one .zip file with your characters, chats, settings and personas. API keys are left out: they only work on the computer they were typed on.',
      },
      {
        title: 'See what it holds',
        says: 'On the other computer, open the same page and press Restore a backup…, then pick the file. Before anything changes, I tell you when it was saved and how many characters, chats and messages it holds.',
      },
      {
        title: 'Restore it',
        says: 'Press Restore backup. The characters, chats and settings in the app are replaced by those of the backup, and your stories are back where you left them. Press Cancel instead and nothing changes.',
      },
    ],
  },
]
