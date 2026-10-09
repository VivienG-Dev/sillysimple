// Types used on both sides of the bridge (main process and Vue app).
// Keep this file free of imports so either side can use it.

/**
 * A character as the app uses it. On disk it is a character card file
 * (SillyTavern format, .png or .json) in the app's `characters` folder.
 */
export interface Character {
  /** The card's file name without its extension. */
  id: string
  name: string
  /** One line shown in lists and under the name. */
  tagline: string
  description: string
  personality: string
  scenario: string
  /** The greeting that opens every new chat. */
  firstMessage: string
  /** Other greetings the chat can open with instead. Shown as versions of the first message. */
  alternateGreetings: string[]
  /** Sample dialogue from the card, shown to the model as a style guide. */
  exampleMessages: string
  /** Instructions the card brings for the model. They take the place of the app's system prompt. */
  systemPrompt: string
  /** Instructions the card wants repeated after the conversation, right before the model replies. */
  postHistoryInstructions: string
  tags: string[]
  /** The card's lorebook: notes about its world, sent only when the chat mentions them. */
  lorebook: Lorebook | null
  /** Present when the user marked this character as one they like. Kept in the card, where SillyTavern keeps it too. */
  favorite?: boolean
  /** The voice the user gave this character, for each voice service they used. Kept in the card. */
  voices?: Partial<Record<VoiceService, VoiceChoice>>
  /** Address of the card's picture, when the card is a .png. */
  portraitUrl?: string
  /** When the last message was exchanged with this character. */
  lastChatAt?: number
}

/** What the character editor lets the user write. Everything else in a card file is kept as it is. */
export type CharacterDraft = Pick<
  Character,
  | 'name'
  | 'tagline'
  | 'description'
  | 'personality'
  | 'scenario'
  | 'firstMessage'
  | 'alternateGreetings'
  | 'exampleMessages'
  | 'systemPrompt'
  | 'postHistoryInstructions'
  | 'tags'
> & {
  /**
   * The lorebook entries, when the editor changed them. Left out, the card's lorebook
   * is not touched at all.
   */
  lorebookEntries?: LorebookEntry[]
}

/** One note of a lorebook. It is added to the prompt when one of its keys appears in the recent messages. */
export interface LorebookEntry {
  name: string
  /** Words (or /regular expressions/) that bring this entry in. */
  keys: string[]
  /** With `selective`, one of these must appear too. */
  secondaryKeys: string[]
  selective: boolean
  /** Always in the prompt, whatever the chat says. */
  constant: boolean
  enabled: boolean
  caseSensitive: boolean
  content: string
  /** Entries with a higher number are placed later, and are the last to go when room is short. */
  insertionOrder: number
  /** Before or after the character's own description. */
  position: 'before_char' | 'after_char'
  /**
   * Where the entry sits in the card file's list, so that saving an edit can find it
   * again and keep what the app does not show. Null for an entry added in the editor.
   */
  source: number | null
}

export interface Lorebook {
  name: string
  /** How many of the latest messages are searched for keys. Null = the app's default. */
  scanDepth: number | null
  /** The most tokens the entries may take together. Null = the app's default. */
  tokenBudget: number | null
  entries: LorebookEntry[]
}

export interface ImportResult {
  imported: Character[]
  /** Files that could not be read as character cards, and why. */
  failed: { file: string; error: string }[]
}

/** Who the user plays in the chats. There can be several; one is in use at a time. */
export interface Persona {
  id: string
  name: string
  description: string
}

export type ChatRole = 'user' | 'assistant'

/**
 * A stage direction given to a reply with one click: something unexpected happens,
 * the scene moves somewhere else, or time passes. See src/core/prompt/direction.ts.
 */
export type SceneDirection = 'event' | 'place' | 'time'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  /**
   * The name the message was written under: the persona for the user's messages, the
   * character for replies. Kept so that a message still has a name when its persona
   * or its character is gone.
   */
  author?: string
  /** For replies: which character wrote it. Missing on old messages: the chat's own character. */
  characterId?: string
  /** Filled for replies once generation ends. */
  meta?: { model: string; durationMs: number }
  /**
   * The reply ran into the length limit before the model was done: it stops in the
   * middle of something, and the rest can be asked for ("Continue").
   */
  cut?: boolean
  /** The stage direction this reply was written under. Its other versions follow it too. */
  direction?: SceneDirection
  /**
   * Present when a reply has several versions ("swipes", as SillyTavern calls them).
   * `content` and `meta` are those of the version at `index`.
   */
  swipes?: { index: number; count: number }
}

/** A character taking part in a chat. */
export interface ChatMember {
  characterId: string
  /** Stays in the background: only speaks when asked to, not when everyone takes a turn. */
  quiet: boolean
}

/**
 * Who answers the user's message when a chat has several characters:
 * - round: each character in turn (those that are not `quiet`)
 * - last:  the character who spoke last
 */
export type TurnMode = 'round' | 'last'

/** One conversation with a character. A character can have several. */
export interface ChatSummary {
  id: string
  /** The character the chat belongs to: it is listed with their chats, and opens with their greeting. */
  characterId: string
  /** Everyone in the chat, in speaking order. The chat's own character comes first; the others were added to it. */
  members: ChatMember[]
  turnMode: TurnMode
  createdAt: number
  updatedAt: number
  messageCount: number
  /** What is remembered of the chat's oldest messages, once it has grown long. */
  memory?: ChatMemory
  /**
   * Where the story of this chat seems to be heading: a short note written by the model
   * and open to the user, when that option is on (see src/core/prompt/notice.ts).
   */
  story?: string
  /**
   * Where the scene is, as noted after the last reply (see src/core/prompt/place.ts). The
   * character is told to stay there; the user can correct it.
   */
  place?: string
  /** What each character of the chat is wearing, as noted after their last reply: character id -> clothes. */
  outfits?: Record<string, string>
}

/**
 * The long memory of a chat: its oldest messages, summed up by the model so that they
 * are not lost when they no longer fit in what it can read (see src/core/prompt/memory.ts).
 */
export interface ChatMemory {
  /** The summary. The user can read and change it. */
  summary: string
  /** How many of the chat's first messages it stands for: the model no longer reads those. */
  count: number
}

/** The most characters a chat can hold. */
export const MAX_CHAT_MEMBERS = 4

export interface OpenedChat {
  chat: ChatSummary
  messages: ChatMessage[]
}

/**
 * Where replies come from:
 * - ollama: Ollama on this computer
 * - custom: any server that speaks the OpenAI chat API, at an address the user types
 * - cloud:  one of the online services in CLOUD_PROVIDERS, with the user's own API key
 */
export type ConnectionKind = 'ollama' | 'custom' | 'cloud'

export type CloudProviderId = 'openrouter' | 'anthropic' | 'openai' | 'mistral'

export interface ConnectionSettings {
  kind: ConnectionKind
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:11434/v1. Not used for `cloud`: the service's own address is. */
  baseUrl: string
  model: string | null
  /** Which online service, when kind is `cloud`. */
  provider?: CloudProviderId
}

/**
 * Which API keys are saved. The keys themselves stay in the main process:
 * the Vue app only ever learns whether one exists.
 */
export interface KeysStatus {
  /** Names of the slots that hold a key. See keySlot() in providers.ts. */
  slots: string[]
  /** False when this computer cannot encrypt keys: they are then kept only until the app quits. */
  persistent: boolean
}

export interface GenerationSettings {
  temperature: number
  maxTokens: number
  /**
   * Read the context size from the model server (see effectiveContextSize).
   * `contextSize` is then only used when the server does not say.
   */
  autoContext: boolean
  /** How many tokens the model can read at once. Older messages are left out beyond it. */
  contextSize: number
  systemPrompt: string
  /** Let thinking models reason before they reply. Off by default: slower, and it eats tokens. */
  thinking: boolean
  /** Follow the instructions a character card brings (its own system prompt), instead of `systemPrompt`. */
  useCardPrompts: boolean
  /** Sum up the oldest messages of a long chat instead of leaving them out. */
  memory: boolean
  /**
   * Keep the scene as it is: the app notes where it takes place and what the character
   * wears after each reply, and tells the character to stay there until the user moves,
   * dressed the same until the story changes it (see src/core/prompt/place.ts).
   */
  keepPlace: boolean
  /**
   * Send a lorebook note also when the chat talks about it without its keywords, as the
   * app's own embedding model reads it (see src/core/prompt/loreMeaning.ts). Only where
   * that model runs, with replies from this computer.
   */
  loreByMeaning: boolean
  /**
   * Bring old moments of a long chat back word for word when the chat comes back to them,
   * as the app's own embedding model reads it (see src/core/prompt/recall.ts). Only where
   * that model runs, with replies from this computer.
   */
  recallByMeaning: boolean
}

export interface AppearanceSettings {
  /**
   * Turn the app's colours towards the main colour of the picture of the character
   * on screen (see src/core/color/accent.ts). Off: the app's own violet, always.
   */
  characterColors: boolean
  /**
   * Show the mood of the character's last reply as a small symbol on its picture
   * (see src/core/mood/detectMood.ts).
   */
  moods: boolean
  /**
   * Read that mood from what the reply means too, with the app's own embedding model,
   * where the telling words are missing (see src/core/mood/senseMood.ts). Only where
   * that model can run; elsewhere this changes nothing.
   */
  moodsByMeaning: boolean
  /**
   * What sits behind the chat: nothing, the picture of the character one is talking to
   * (blurred), or one picture of the user's own, kept as background.webp in the data folder.
   */
  background: ChatBackground
  /** How present the background is, from 0 (barely there) to 100. */
  backgroundStrength: number
  /**
   * When the user last chose their own background (a timestamp), or 0 when they have
   * none. It is part of the picture's address, so a new one shows at once.
   */
  backgroundVersion: number
}

export type ChatBackground = 'none' | 'character' | 'custom'

/**
 * The app adapts to its user. Beta, and off until the user turns it on: some people do
 * not want an app to learn anything about them. See src/core/prompt/notice.ts.
 */
export interface AdaptSettings {
  /** Note how the user likes to play, as tags, and tell every character about them. */
  learnTastes: boolean
  /** Keep a note per chat of where its story seems to be heading. */
  followStory: boolean
  /** What the user enjoys in a story: short tags, proposed by the model or added by hand. */
  likes: string[]
  /** What they do not enjoy. */
  dislikes: string[]
  /** Tags the user took out: the model never proposes them again. */
  removed: string[]
  /** "Use my tastes" in "Describe your character": new characters are written with the tags in mind. */
  inCards: boolean
}

/** Sent to the UI when the model has read the latest messages of a chat (see AdaptSettings). */
/** Where a chat's scene is and what its characters wear, as just noted after a reply. */
export interface PlaceEvent {
  chatId: string
  /** Null: not known. */
  place: string | null
  /** Character id -> clothes, for those it is known of. */
  outfits: Record<string, string>
}

export interface NoticeEvent {
  chatId: string
  /** The note on where the story is heading, when it was written anew. */
  story?: string
  /** The tags just added to the user's tastes. */
  added: { likes: string[]; dislikes: string[] }
}

// --- Voice: replies read aloud ---------------------------------------------------

/** A service that turns text into speech: ElevenLabs, or a server that speaks OpenAI's speech format. */
export type VoiceService = 'elevenlabs' | 'server'
/** What reads the replies aloud. `off`: nothing does, and nothing is sent anywhere. */
export type VoiceEngine = 'off' | VoiceService

/** A voice that was picked: its id for the service, and its name to show. */
export interface VoiceChoice {
  id: string
  name: string
}

export interface VoiceSettings {
  engine: VoiceEngine
  /** For `server`: its OpenAI-compatible address, e.g. https://api.openai.com/v1 or http://127.0.0.1:8880/v1. */
  baseUrl: string
  /** The speech model of each service. Empty for ElevenLabs: its own default. */
  elevenlabsModel: string
  serverModel: string
  /** The voice of the characters that have none of their own, for each service. */
  elevenlabsVoice: VoiceChoice | null
  serverVoice: VoiceChoice | null
  /** Read each reply aloud as soon as it is written. */
  autoRead: boolean
  /**
   * What is read: everything in the character's voice, only what is said aloud (the text
   * in quotes), or everything with two voices, a narrator telling what is not said.
   */
  read: 'all' | 'speech' | 'narrator'
  /** The voice that tells what is not said, when `read` is `narrator`, for each service. Null: the voice of everyone. */
  elevenlabsNarrator: VoiceChoice | null
  serverNarrator: VoiceChoice | null
}

/** A voice a service offers. */
export interface VoiceInfo {
  id: string
  name: string
  /** A few words on it, when the service gives some: "female · young · American". */
  description?: string
  /** The service has a sample of it that can be played without spending anything. */
  hasSample?: boolean
}

/** What a voice service answers when it is checked. */
export type VoiceStatus =
  | {
      ok: true
      voices: VoiceInfo[]
      /** False when the server has no list of voices: the user types the name of one. */
      listed: boolean
      models: { id: string; name: string }[]
      /** Characters used and allowed this month, when the service says. */
      usage?: { used: number; limit: number }
    }
  | {
      ok: false
      error: string
      /** The service knows the key, but the key may not do what was asked: it is right, and worth keeping. */
      keyKnown?: boolean
    }

/** Asks for a piece of text to be spoken. */
export interface SpeakRequest {
  /** What `voice.cancel` takes. */
  requestId: string
  text: string
  voiceId: string
}

export type SpeakOutcome =
  | { status: 'done'; audio: Uint8Array; mime: string }
  | { status: 'stopped' }
  | { status: 'error'; error: string }

export interface Settings {
  onboardingDone: boolean
  /** The guided tour of the chat screen was seen, or skipped. */
  tourDone: boolean
  connection: ConnectionSettings
  generation: GenerationSettings
  appearance: AppearanceSettings
  adapt: AdaptSettings
  voice: VoiceSettings
  personas: Persona[]
  /** The persona in use. See activePersona() in defaults.ts. */
  activePersonaId: string
}

/** A partial update: only the given keys change, one level deep. Lists are replaced whole. */
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends unknown[]
    ? Settings[K]
    : Settings[K] extends object
      ? Partial<Settings[K]>
      : Settings[K]
}

export interface ModelInfo {
  id: string
  /** A friendlier name, when the service gives one. */
  name?: string
  sizeBytes?: number
  /** How many tokens the model can read at once, when the service says. */
  contextLength?: number
}

export type ConnectionStatus = { ok: true; models: ModelInfo[] } | { ok: false; error: string }

// --- The model engine on this computer ---------------------------------------------
// "On this computer" replies come from Ollama. Either the user runs one themselves, or
// the app downloads and runs its own (src/main/engine.ts). There is never more than
// one: when the user's answers, the app's own is stopped.

/**
 * Where "on this computer" stands:
 * - yours:       an Ollama the user runs themselves answers, and the app uses it
 * - running:     the app's own is running
 * - stopped:     the app's own is installed; it starts when it is needed
 * - missing:     there is none yet: the app's own has to be downloaded first
 * - unsupported: there is no Ollama for this kind of computer
 */
export type EngineState = 'yours' | 'running' | 'stopped' | 'missing' | 'unsupported'

/**
 * Where reading by meaning stands (the app's own embedding model, src/main/sense.ts):
 * - unsupported: this kind of computer cannot run the model
 * - off:         the setting is off
 * - elsewhere:   replies do not come from this computer, so nothing here runs a model
 * - asleep:      no Ollama runs right now; it wakes with the next reply
 * - preparing:   the model is being asked for the first time
 * - downloading: the model is on its way
 * - ready
 * - failed:      it does not work here, and `problem` says why
 */
export interface SenseStatus {
  state: 'unsupported' | 'off' | 'elsewhere' | 'asleep' | 'preparing' | 'downloading' | 'ready' | 'failed'
  /** From 0 to 1 while downloading. */
  progress: number | null
  problem: string | null
  /** The model's name and size, to say what is downloaded. */
  model: string
  bytes: number
}

/** The three sizes of chat model the app offers to download. */
export type ModelTier = 'small' | 'medium' | 'large'

/** One of the app's own chat models, as it is offered on this computer. */
export interface ModelOffer {
  tier: ModelTier
  /** The name Ollama knows it by: what ends up in `connection.model`. */
  id: string
  name: string
  /** The exact model: "E2B", "12B", "26B A4B". */
  variant: string
  /** One line on what to expect of it. */
  blurb: string
  /** About how much is downloaded, and kept on disk. */
  bytes: number
  /** The one the app would pick for this computer. */
  recommended: boolean
  /** Already on this computer. */
  installed: boolean
}

/** A download in progress: the engine itself, or a model. */
export interface EngineJob {
  /** The model that was asked for. Its download may start with the engine's. */
  model: string
  /**
   * - engine:    downloading the app's own Ollama
   * - unpacking: putting it in place
   * - starting:  waiting for it to answer
   * - model:     downloading the model
   * - finishing: the model is checked and written down
   */
  step: 'engine' | 'unpacking' | 'starting' | 'model' | 'finishing'
  /** Of the step under way. Zero when the size is not known yet. */
  doneBytes: number
  totalBytes: number
}

export interface EngineStatus {
  state: EngineState
  /** The version of the Ollama that answers, when one does. */
  version: string | null
  /** The size of the app's own engine, to be downloaded while it is `missing`. */
  engineBytes: number
  /** How much memory this computer has. */
  memoryBytes: number
  /** The app's own models this computer can run, smallest first. */
  offers: ModelOffer[]
  /** How many of the app's models are not offered: they need more memory than there is. */
  tooLarge: number
  /** Every model the Ollama in use holds. Empty while none answers. */
  models: ModelInfo[]
  job: EngineJob | null
  /** Why the app's own Ollama could not be started, when it could not. */
  problem: string | null
}

/**
 * Asks for a reply in a chat. The main process saves the messages; the ids are
 * chosen by the UI so it can show them right away and keep the same ones after saving.
 */
export interface GenerateRequest {
  requestId: string
  chatId: string
  /** Id the reply will be saved under. */
  replyId: string
  /** A new message from the user, saved before the reply is generated. */
  userMessage?: { id: string; content: string }
  /** Write another version (a new swipe) of the last reply, instead of a new message. */
  newSwipe?: boolean
  /** Write the rest of the last reply, which was cut short, in that same message. */
  continueReply?: boolean
  /** A stage direction for the new reply. Not for another version of a reply: that one keeps its own. */
  direction?: SceneDirection
  /**
   * Which character of the chat replies. Left out: the chat's own character
   * (or, for a new version, the character who wrote the reply).
   */
  speakerId?: string
}

/** Sent to the UI while a reply is being generated. */
export type ChatEvent =
  | { requestId: string; type: 'text'; delta: string }
  /** The model is reasoning: nothing to show yet, but it is working. */
  | { requestId: string; type: 'thinking' }
  /** Old messages are being summed up before the reply is written. */
  | { requestId: string; type: 'memory' }

/** How a generation ended. */
export interface ChatOutcome {
  status: 'done' | 'stopped' | 'error'
  /** The reply as it was saved, or null when nothing was written. */
  message: ChatMessage | null
  /** What went wrong, when status is 'error'. */
  error?: string
}

// --- Data & privacy ---------------------------------------------------------------

/** What the app keeps on this computer, for Settings > Data & Privacy. */
export interface DataSummary {
  /** The folder everything is in. */
  folder: string
  characters: number
  chats: number
  messages: number
  /** Space taken on disk, in bytes. */
  bytes: number
}

/** What a backup file holds, as written in the file itself. */
export interface BackupInfo {
  /** Name of the file, without its folder. */
  fileName: string
  createdAt: number
  characters: number
  chats: number
  messages: number
}

/**
 * How something the user started ended: done, given up in a file dialog, or failed
 * with a message to show.
 */
export type Attempt<T = null> =
  | { status: 'done'; value: T }
  | { status: 'cancelled' }
  | { status: 'error'; error: string }

// --- Writing a character from an idea -------------------------------------------

/**
 * What the user can ask of a character with one click when it is written for them:
 * a tone, an attitude, a kind of story. See src/core/cards/moods.ts.
 */
export type CardMood = 'soft' | 'funny' | 'dark' | 'mysterious' | 'sassy' | 'spicy'

/** A mood and how strongly it is asked for: 1 (a touch of it), 2 (plainly), 3 (all of it). */
export interface MoodPick {
  mood: CardMood
  level: 1 | 2 | 3
}

export interface WriteCharacterRequest {
  /** Text arrives through the chat events under this id, and it is what `chat.cancel` takes. */
  requestId: string
  /** What the user said about the character they have in mind. Empty: the model invents one ("Surprise me"). */
  idea: string
  /** The moods picked next to the idea, a few at most. */
  moods?: MoodPick[]
  /** Write the character with the user's tastes in mind ("Use my tastes"). Only counts while those are learned. */
  useTastes?: boolean
}

/**
 * A ready-to-play scenario: a character that comes with the app, shown in the library
 * until the user makes it theirs with "Play" (see src/main/scenarios.ts).
 */
export interface Scenario {
  /** Its file name without the extension. Once played, the user's character has the same id. */
  id: string
  name: string
  tagline: string
  /** What the story starts on, in a sentence or two. May hold {{char}} and {{user}}. */
  pitch: string
  tags: string[]
  /** How many opening messages it has. */
  greetings: number
  pictureUrl?: string
}

/** What the advice on a character looks at: the fields of a card, and its lorebook in brief. */
export interface ReviewedCard {
  name: string
  tagline: string
  description: string
  personality: string
  scenario: string
  exampleMessages: string
  firstMessage: string
  alternateGreetings: string[]
  /** How many lorebook notes it has. */
  loreCount: number
  /** The keywords of those notes, to tell the model what is already covered. */
  loreKeys?: string[]
}

/** Asks the model for the one part of a card a piece of advice is about (see src/core/cards/reviewCard.ts). */
export interface ImproveCharacterRequest {
  /** As for WriteCharacterRequest. */
  requestId: string
  /** The card as it is in the editor, saved or not. */
  card: ReviewedCard
  /** Which piece of advice: a TipId. */
  tip: string
}

export interface WriteCharacterOutcome {
  status: 'done' | 'stopped' | 'error'
  /** Everything the model wrote, to be read with readWrittenCard(). */
  text: string
  /** The model ran out of room before the end of the card. */
  cut?: boolean
  error?: string
}
