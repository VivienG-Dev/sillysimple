// The questions of the Help page, by subject. Each answer is one or several paragraphs.
//
// Where the app says the same thing (its own Help page, the labels of its settings), the
// words are the app's: when they change there, change them here. Nothing is promised here
// that the app does not do.

export interface HelpQuestion {
  /** Its address in the page: /help/#<id>. */
  id: string
  question: string
  answer: string[]
  /**
   * What the answer ends with, which depends on whether the code is public yet (`repo` in
   * app.config.ts): a link to it (`path` goes after its address), or a sentence until then.
   */
  code?: { link: string; path?: string; until: string }
  /** A question that only makes sense once the code is public: not shown before. */
  needsCode?: boolean
}

export interface HelpGroup {
  id: string
  title: string
  questions: HelpQuestion[]
}

export const HELP: HelpGroup[] = [
  {
    id: 'before',
    title: 'Before you install',
    questions: [
      {
        id: 'free',
        question: 'Is it free?',
        answer: [
          'Yes. SillySimple is free: nothing to pay, no subscription, no account. The models it downloads to your computer are free too.',
          'The one thing that can cost money is an online service, if you choose one to write the replies or to read them aloud: that service may charge you, on its side, for the key you give the app.',
        ],
      },
      {
        id: 'open-source',
        question: 'Is it open source?',
        answer: [
          'Yes. SillySimple is free software, under the GNU General Public License, version 3 (GPL-3.0). Anyone may read its code, check what it does, change it and share it; a changed version that is shared must stay open, under the same licence.',
          'The name SillySimple and its icon are not part of that: a changed version goes by another name.',
        ],
        code: { link: 'The code of SillySimple', until: 'The code is not public yet. This page will link to it when it is.' },
      },
      {
        id: 'what-do-i-need',
        question: 'What do I need?',
        answer: [
          'To run a model on your own computer: a Mac with an Apple chip, or a Windows or Linux PC with a graphics card. Then 8 GB of memory, and room on the disk for a model: about 5 GB for the smallest one on a Mac, and a few more on Windows and Linux, where the engine that runs models is larger.',
          'On another computer, an online service can write the replies, with a key of your own. Nothing is downloaded then, and the computer hardly matters.',
          'No terminal, and nothing to install besides the app.',
        ],
      },
      {
        id: 'graphics-card',
        question: 'Do I need a graphics card?',
        answer: [
          'On a Mac with an Apple chip, no: the chip does that work. On a PC, yes, if the model is to run on your computer: a graphics card is what makes replies come in a few seconds.',
          'On a PC without one, nothing is promised. The model may still run on the processor alone, but replies can be very slow, and this has not been tried. There, let an online service write the replies, with a key of your own: see “Can replies come from Claude, OpenAI, Mistral or OpenRouter?” below.',
          'So far, SillySimple has run a model on one kind of computer only: a Mac with an Apple chip.',
        ],
      },
      {
        id: 'offline',
        question: 'Does it work without the internet?',
        answer: [
          'Yes, once a model is on your computer. Downloading that model is the only moment the app needs the internet, unless you choose an online service to write the replies.',
        ],
      },
    ],
  },
  {
    id: 'models',
    title: 'Models',
    questions: [
      {
        id: 'which-model',
        question: 'Which model will I get?',
        answer: [
          'The app looks at how much memory your computer has, and offers what fits among three sizes of Gemma 4. Small (E2B) is a 4.6 GB download and is offered to every computer. Medium (12B) is 8 GB, for computers with 16 GB of memory. Large (26B A4B) is 18 GB, for computers with 32 GB.',
          'The largest one that fits is marked “Recommended”. A larger model writes better, more slowly.',
        ],
      },
      {
        id: 'several-ollama',
        question: 'I see several lines named “ollama” in Activity Monitor or the Task Manager. Is that normal?',
        answer: [
          'Yes. SillySimple runs models with Ollama, and Ollama shows as several lines: a small one for the program itself, and one for each model held in memory. They are named “ollama” or “llama-server”.',
          'The biggest is the model that writes the replies: the Gemma 4 you picked (Small, Medium or Large), or the model you chose yourself. There can be a second, much smaller one: EmbeddingGemma 2, by Google (270 million parameters), which reads the mood of each reply. It is a 378 MB download on a Mac with an Apple chip, and 574 MB on other computers, where it comes in a file their Ollama can run.',
          'When SillySimple runs its own Ollama, a model leaves memory half an hour after it was last used, and everything stops when you quit the app. Your own Ollama, if you have one, keeps its own settings.',
        ],
      },
      {
        id: 'first-reply-slow',
        question: 'The first reply takes a long time',
        answer: [
          'The model is being loaded into memory, which takes a moment for a file of several gigabytes. The replies that follow come faster. The model stays in memory for half an hour after the last reply.',
        ],
      },
      {
        id: 'own-ollama',
        question: 'I already use Ollama, LM Studio or KoboldCpp',
        answer: [
          'If Ollama is open on your computer, SillySimple uses it instead of starting a second one, and both keep their models in the same place: what one downloaded is there for the other.',
          'For LM Studio, KoboldCpp, llama.cpp or any server that speaks like OpenAI’s, choose “Another server” and give its address.',
        ],
      },
      {
        id: 'online-service',
        question: 'Can replies come from Claude, OpenAI, Mistral or OpenRouter?',
        answer: [
          'Yes, with a key of your own from that service: choose “Online service”. Nothing is downloaded, and replies are quick on any computer.',
          'The conversation and the character’s card are then sent to that service to write each reply, instead of staying on your computer.',
        ],
      },
      {
        id: 'another-model',
        question: 'Can I use another model than the three offered?',
        answer: [
          'Yes. Under the list, “Another model…” downloads any model of ollama.com by its name, or a GGUF file from Hugging Face.',
        ],
      },
      {
        id: 'filter',
        question: 'Does SillySimple filter what I write?',
        answer: [
          'No filter added by SillySimple: what a model accepts is up to the model you choose. With a model on your computer, everything stays on it.',
          'An online service applies its own rules to what it is sent.',
        ],
      },
      {
        id: 'remove-model',
        question: 'How do I get back the space a model takes?',
        answer: [
          'In Settings › Connection, the bin at the end of a model’s line removes it from the disk, after asking you to confirm. You can download it again later.',
        ],
      },
    ],
  },
  {
    id: 'data',
    title: 'Your chats and your data',
    questions: [
      {
        id: 'where-is-it',
        question: 'Where are my characters and my chats?',
        answer: [
          'In one folder on your computer. Characters are card files in the format SillyTavern uses, chats are in a database, settings in a file. Settings › Data & Privacy says what is kept and opens the folder.',
          'On a Mac it is ~/Library/Application Support/SillySimple; on Windows, %APPDATA%\\SillySimple.',
        ],
      },
      {
        id: 'what-leaves',
        question: 'What leaves my computer?',
        answer: [
          'With a model on your computer: nothing you write. There is no account, and nothing you write is ever sent to us. The only thing the app asks of our server is the small file that says which version is the latest, to tell you when there is a new one; you can turn that off in Settings › Data & Privacy.',
          'With an online service, the conversation and the character’s card are sent to that service to write each reply. If you turn on reading aloud with an online voice, the text of a reply is sent to that voice service when it is read.',
        ],
      },
      {
        id: 'backup',
        question: 'How do I make a backup, or move to another computer?',
        answer: [
          'Settings › Data & Privacy saves everything into one .zip file, which you can open by hand. On the other computer, restore it from the same page: what the file holds is shown before you confirm.',
          'API keys are never part of a backup: they are encrypted by the computer they were typed on.',
        ],
      },
      {
        id: 'erase',
        question: 'How do I erase everything?',
        answer: ['Settings › Data & Privacy has “Erase everything”, which puts the app back as it was on the first day. You can also delete all chats and keep your characters.'],
      },
    ],
  },
  {
    id: 'stories',
    title: 'In a story',
    questions: [
      {
        id: 'actions-and-ooc',
        question: 'How do I write an action, or tell the AI something?',
        answer: [
          'What your persona does goes between asterisks, what they say between quotes: *I sit down by the window.* "Tea, please." The app shows actions in italics, and models know the habit.',
          'To say something to the AI itself, outside the story, write it in brackets after OOC (out of character): (OOC: write longer, more detailed replies). The OOC button in the message box writes the brackets for you. It works at once, and the line stays in the chat: delete it once it has worked if you like.',
          'For something that should hold for the whole chat, the app has steadier ways: Reply length in the right panel for how long replies are, and the system prompt (Settings › Generation, or the character’s own) for standing instructions.',
        ],
      },
      {
        id: 'reply-cut',
        question: 'A reply stops in the middle of a sentence',
        answer: ['It ran into the length limit. Press Continue under the message to get the rest, or make replies longer with Reply length, in the right panel.'],
      },
      {
        id: 'forgot',
        question: 'The character forgot something',
        answer: [
          'Open the Memory tab in the right panel: it shows what is kept of the older messages. Add what is missing, in a sentence. For things that must never be forgotten, write them in your Persona or in the character.',
        ],
      },
      {
        id: 'scene-moved',
        question: 'The scene moved somewhere else by itself',
        answer: [
          'The app notes where the scene is after each reply, and tells the character to stay there until you go somewhere else. The note is at the top of the Memory tab: correct it if it is wrong, and the next reply follows it.',
        ],
      },
      {
        id: 'speaks-for-me',
        question: 'The character speaks for me',
        answer: ['Edit the reply and cut that part, or write another version with the arrows. Models copy what they see: a first message that never speaks for you sets the tone.'],
      },
      {
        id: 'slow',
        question: 'Replies are slow',
        answer: [
          'With a model on your computer, speed depends on the computer and on the size of the model. Shorter replies come sooner; a smaller model is faster; an online service is usually the fastest.',
        ],
      },
      {
        id: 'nothing-happens',
        question: 'Nothing happens when I send a message',
        answer: [
          'The dot at the bottom left says whether the app reaches the model. If it is not green, open Settings › Connection: no model may be downloaded yet, or the server you chose (LM Studio…) may not be running.',
        ],
      },
      {
        id: 'several-characters',
        question: 'Can several characters be in the same chat?',
        answer: ['Up to four. “Add a character”, at the top of a chat, brings another one in. They answer in turn, or you click a name to make that character speak: they can talk to each other.'],
      },
      {
        id: 'voice',
        question: 'Can a character speak aloud?',
        answer: [
          'Yes, as an option that is off until you turn it on, in Settings › Voice. It takes a key from ElevenLabs, or a voice server in OpenAI’s format. The text of a reply is sent to that service when it is read.',
        ],
      },
    ],
  },
  {
    id: 'sillytavern',
    title: 'Coming from SillyTavern',
    questions: [
      {
        id: 'cards',
        question: 'Will my characters work?',
        answer: [
          'Yes. Drop their PNG or JSON cards into the Library: the three versions of the card format are read. Their greetings, their lorebook and the favourite mark come with them.',
        ],
      },
      {
        id: 'extensions',
        question: 'And my extensions and presets?',
        answer: [
          'They do not come along. SillySimple has no extensions, and far fewer settings: the memory of long chats, the notes on the scene and the setup of the model are part of the app, already on.',
        ],
      },
      {
        id: 'report',
        question: 'Something does not work. Where do I say so?',
        answer: ['On the page of the code, under “Issues”: say what you did, what you expected and what happened, and which computer you have. Reading what others reported there can also save you the wait.'],
        code: { link: 'Report a problem', path: '/issues', until: '' },
        needsCode: true,
      },
      {
        id: 'fork',
        question: 'Is SillySimple a version of SillyTavern?',
        answer: [
          'No. It is written from scratch and is an independent project, not affiliated with SillyTavern. It reads the same character cards.',
          'It owes a lot to SillyTavern, though. I made SillySimple after using SillyTavern myself, and I have a great deal of respect for the work of its team. SillySimple exists to make the same kind of chat easy to start, not to replace it.',
        ],
      },
    ],
  },
]

/** The app's few special words, in plain language: the list of its own Help page. */
export const WORDS: { word: string; meaning: string }[] = [
  {
    word: 'Character',
    meaning:
      'Who you talk to: a name, a personality, a way of speaking, and the first thing they say. You can write one yourself, have one written from a sentence, or import one.',
  },
  {
    word: 'Character card',
    meaning:
      'A character saved as a file, most often a picture (PNG) with the character hidden inside. People share them online. Drop one into the Library and the character is yours. Cards made for SillyTavern work here.',
  },
  {
    word: 'Persona',
    meaning: 'Who you are in the story: your name, and a few words the character should know about you. You can have several and switch between them.',
  },
  {
    word: 'Model',
    meaning:
      'The program that writes the replies. It runs on your computer (SillySimple downloads one for you, or uses LM Studio) or at an online service. A larger model writes better, more slowly, and needs more memory.',
  },
  {
    word: 'Greeting',
    meaning: 'The character’s first message, which opens every new chat. A character can have several: the arrows under the first message switch between them.',
  },
  {
    word: 'Version',
    meaning: 'Another try at the same reply. The arrows under the last reply write a new one and keep the old ones, so you can go back.',
  },
  {
    word: 'Directing the scene',
    meaning:
      'The buttons above the message box move the story along without you writing it. “More…” lets the character carry on by itself. “Something happens”, “Somewhere else” and “Later…” tell the next reply where to go.',
  },
  {
    word: 'OOC',
    meaning:
      'Out of character: a word to the AI itself, outside the story, in brackets. “(OOC: write longer replies)” or “(OOC: describe the room first)”. The OOC button in the message box writes the brackets for you. It works for a moment; for good, use Reply length or the system prompt.',
  },
  {
    word: 'Context',
    meaning: 'How much the model can read at once, counted in tokens (pieces of words). The bar under the message box shows how full it is.',
  },
  {
    word: 'Memory',
    meaning:
      'When a chat grows longer than the context, its oldest messages are summed up so the character does not forget them. You can read and correct that summary in the Memory tab.',
  },
  {
    word: 'Tastes',
    meaning:
      'Short tags about how you like to play (“slow burn”, “short replies”), which the app can learn from your chats and tell every character about. It is a beta option, off until you turn it on.',
  },
  {
    word: 'Lorebook',
    meaning: 'Notes about the character’s world: places, people, rules. Each note is only given to the model when the chat mentions it, so a big world does not fill the context.',
  },
  {
    word: 'System prompt',
    meaning: 'The standing instructions given to the model before every chat, such as “stay in character”. The one that comes with the app works: you never have to touch it.',
  },
]
