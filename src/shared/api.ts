import type { PictureColor } from '@core/color/accent'
import type { MoodReading } from '@core/mood/senseMood'
import type {
  Attempt,
  BackupInfo,
  Character,
  CharacterDraft,
  ChatEvent,
  ChatMember,
  ChatMessage,
  ChatOutcome,
  ChatSummary,
  ConnectionSettings,
  ConnectionStatus,
  DataSummary,
  EngineStatus,
  GenerateRequest,
  ImportResult,
  ImproveCharacterRequest,
  KeysStatus,
  NoticeEvent,
  OpenedChat,
  PlaceEvent,
  Scenario,
  SenseStatus,
  Settings,
  SettingsPatch,
  SpeakOutcome,
  SpeakRequest,
  TurnMode,
  VoiceChoice,
  VoiceService,
  VoiceSettings,
  VoiceStatus,
  WriteCharacterOutcome,
  WriteCharacterRequest,
} from './types'

/**
 * Everything the Vue app can ask the main process to do.
 * The preload script implements it and exposes it as `window.api`.
 * This plays the role that `server/api` routes play in a Nuxt project.
 */
export interface SillyApi {
  platform: string
  /** Tells the window the colour of the app's background, for its frame and its buttons (Windows). */
  setWindowColor(color: string): void

  settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
    /**
     * Keeps `webp` (the bytes of a WebP picture) as the user's own chat background, and
     * turns that background on. Returns the settings as they now are.
     */
    setBackground(webp: Uint8Array): Promise<Settings>
    /** Throws the user's own background away. The chat goes back to the character's picture. */
    removeBackground(): Promise<Settings>
  }

  connection: {
    /**
     * Asks the server for its models. Works as both "detect" and "test".
     * `apiKey` tries a key that is not saved yet; without it the saved key is used.
     */
    test(connection: ConnectionSettings, apiKey?: string): Promise<ConnectionStatus>
    /**
     * The context length the saved model runs with, as its server reports it.
     * Null when the server does not say (or the model is not loaded yet).
     */
    contextLength(): Promise<number | null>
  }

  /**
   * "On this computer": the Ollama the replies come from (the user's own when one runs,
   * the app's own otherwise), and the models the app offers to download for it.
   */
  engine: {
    /**
     * Where things stand. `wake` also starts the app's own Ollama when it is installed
     * and no other answers, so that the models it holds can be listed.
     */
    status(wake?: boolean): Promise<EngineStatus>
    /**
     * Downloads a model: the app's own Ollama first when there is none at all, then the
     * model. Progress arrives through `onStatus` meanwhile; `cancel` stops it.
     */
    download(model: string): Promise<Attempt>
    cancel(): void
    /** Removes a model from the disk. */
    remove(model: string): Promise<Attempt>
    /**
     * Says the page is done looking at "on this computer". When replies come from
     * elsewhere, the app's own Ollama, which looking may have started, is stopped.
     */
    rest(): void
    /** Called each time the status changes. Returns a function that stops listening. */
    onStatus(listener: (status: EngineStatus) => void): () => void
  }

  /**
   * The mood of a reply, for the symbol on the character's picture. Read in the main
   * process: the words first, then the meaning, with the app's own embedding model when
   * it is there (src/main/sense.ts).
   */
  mood: {
    /** `userName`: the name the user plays under; what the text says of them is not counted. */
    read(text: string, userName?: string): Promise<MoodReading>
    /** Where reading by meaning stands. Asking gets the model ready when it can be. */
    status(): Promise<SenseStatus>
  }

  /** Replies read aloud. The voice service is called from the main process, where its key is. */
  voice: {
    /**
     * Checks the voice service of `settings` (the saved one, or one being tried in the
     * settings) and returns what it offers. `apiKey`: a key being typed, not saved yet.
     */
    check(settings: VoiceSettings, apiKey?: string): Promise<VoiceStatus>
    /** Has a piece of text spoken with the saved voice service. */
    speak(request: SpeakRequest): Promise<SpeakOutcome>
    /**
     * A voice to listen to before choosing it: the service's own sample when it has one
     * (nothing is spent), a short sentence spoken otherwise. For the service last checked.
     */
    sample(request: { requestId: string; voiceId: string }): Promise<SpeakOutcome>
    cancel(requestId: string): void
  }

  /** API keys of online services. They are stored encrypted, and never sent back to the page. */
  keys: {
    status(): Promise<KeysStatus>
    set(slot: string, key: string): Promise<KeysStatus>
    remove(slot: string): Promise<KeysStatus>
  }

  characters: {
    /** Every card in the characters folder. */
    list(): Promise<Character[]>
    /** Copies card files (.png or .json) into the characters folder. */
    import(paths: string[]): Promise<ImportResult>
    /**
     * Writes a new card file. `portrait` is a PNG picture; with one the card is a .png,
     * without one a .json.
     */
    create(draft: CharacterDraft, portrait?: Uint8Array): Promise<Character>
    /** Rewrites what the editor changed in a card file. Everything else in the file is kept. */
    update(id: string, draft: CharacterDraft, portrait?: Uint8Array): Promise<Character>
    /**
     * Has the connected model write a character from an idea. Nothing is saved: the text
     * arrives through `chat.onEvent` while it is written, and is returned whole at the end.
     * `chat.cancel` stops it.
     */
    write(request: WriteCharacterRequest): Promise<WriteCharacterOutcome>
    /**
     * Has the model write the one part of a card a piece of advice is about, so that it
     * fits the rest. Works like `write`: the text arrives through `chat.onEvent` meanwhile.
     */
    improve(request: ImproveCharacterRequest): Promise<WriteCharacterOutcome>
    /** Marks a character as a favourite, or removes the mark. Returns the character as it is now saved. */
    setFavorite(id: string, favorite: boolean): Promise<Character>
    /**
     * Gives a character its own voice for a voice service, or takes it away (null: the
     * voice chosen for everyone). Returns the character as it is now saved.
     */
    setVoice(id: string, service: VoiceService, voice: VoiceChoice | null): Promise<Character>
    /** The main colour of a character's picture. Null without a picture, or for a grey one. */
    color(id: string): Promise<PictureColor | null>
    /** Where a dropped or picked file lives on disk. */
    pathForFile(file: File): string
    /** Moves the card file to the system trash and deletes the character's chats. */
    delete(id: string): Promise<void>
  }

  scenarios: {
    /** The ready-to-play scenarios the app comes with. */
    list(): Promise<Scenario[]>
    /**
     * Makes a scenario one of the user's characters, and returns that character. When
     * they already have it, theirs is returned and nothing is copied.
     */
    play(id: string): Promise<Character>
  }

  chats: {
    /** The chats with one character, most recent first. */
    list(characterId: string): Promise<ChatSummary[]>
    open(chatId: string): Promise<ChatMessage[]>
    /** Starts a chat that opens with the character's greeting. */
    create(characterId: string): Promise<OpenedChat>
    delete(chatId: string): Promise<void>
    /**
     * Changes who takes part in a chat, and who answers the user. `members` is the whole
     * list, the chat's own character first. Returns the chat as it is now saved.
     */
    setScene(chatId: string, scene: { members: ChatMember[]; turnMode: TurnMode }): Promise<ChatSummary>
    /**
     * Replaces what the chat remembers of its oldest messages by `summary`. Null starts the
     * memory over: it is written again from all the messages when it is next needed.
     */
    setMemory(chatId: string, summary: string | null): Promise<ChatSummary>
    /** Replaces the note on where the chat's story is heading by `note`. An empty note removes it. */
    setStory(chatId: string, note: string): Promise<ChatSummary>
    /** Corrects where the chat's scene is. Empty: not known, the next reply says. */
    setPlace(chatId: string, place: string): Promise<ChatSummary>
    /** Corrects what a character of the chat is wearing. Empty: not known, their next reply says. */
    setOutfit(chatId: string, characterId: string, outfit: string): Promise<ChatSummary>
  }

  messages: {
    /** Each call returns the message as it is now saved. */
    edit(messageId: string, content: string): Promise<ChatMessage>
    /** Deletes a message and every message after it in the chat. */
    delete(messageId: string): Promise<void>
    /** Shows another version of a reply that has several. */
    selectSwipe(messageId: string, index: number): Promise<ChatMessage>
  }

  /** Settings > Data & Privacy: what the app keeps on this computer, and what can be done with it. */
  data: {
    summary(): Promise<DataSummary>
    /** Shows the data folder in the Finder or the Explorer. */
    openFolder(): Promise<void>
    /** Asks where to save, then writes a backup of the characters, chats and settings. */
    backup(): Promise<Attempt<BackupInfo>>
    /** Asks for a backup file and says what it holds. Nothing changes yet. */
    chooseBackup(): Promise<Attempt<BackupInfo>>
    /**
     * Replaces the characters, chats and settings by those of the backup chosen with
     * `chooseBackup`. The page has to be loaded again afterwards.
     */
    restore(): Promise<Attempt>
    /** Deletes every chat. Characters and settings stay. */
    deleteChats(): Promise<Attempt>
    /** Deletes everything, API keys included: the app is as on its first launch. */
    erase(): Promise<Attempt>
  }

  chat: {
    /** Resolves when generation ends. Text arrives through `onEvent` meanwhile. */
    start(request: GenerateRequest): Promise<ChatOutcome>
    cancel(requestId: string): void
    /** Returns a function that stops listening. */
    onEvent(listener: (event: ChatEvent) => void): () => void
    /**
     * Called when the model has read the latest messages of a chat, in the background,
     * and noted something: tags about the user's tastes, where the story is heading.
     * Only happens with the "adapts to you" options on. Returns a function that stops listening.
     */
    onNotice(listener: (event: NoticeEvent) => void): () => void
    /** Called when the place of a chat's scene was noted again, after a reply. Returns a function that stops listening. */
    onPlace(listener: (event: PlaceEvent) => void): () => void
  }
}
