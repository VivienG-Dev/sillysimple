import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { improveRequest, IMPROVE_REPLY_TOKENS, IMPROVE_TEMPERATURE, isTipId } from '@core/cards/reviewCard'
import { CARD_REPLY_TOKENS, CARD_TEMPERATURE, cardRequest } from '@core/cards/writeCard'
import { cleanMoods, describeMoods } from '@core/cards/moods'
import { isAbort } from '@core/engine/errors'
import { cleanModelName } from '@core/engine/models'
import { buildMessages, type LlmMessage } from '@core/prompt/buildMessages'
import {
  effectiveContextSize,
  estimateTokens,
  fitToContext,
  replyTokens,
  THINKING_TOKEN_ALLOWANCE,
} from '@core/prompt/context'
import { applyMacros } from '@core/prompt/macros'
import {
  cleanMemory,
  foldBatches,
  memoryReplyTokens,
  memoryRequest,
  memoryTokens,
  planFold,
  type TranscriptLine,
} from '@core/prompt/memory'
import { isDirection, pickEvents } from '@core/prompt/direction'
import {
  addTastes,
  dueForNotice,
  latestLines,
  NOTICE_REPLY_TOKENS,
  NOTICE_TEMPERATURE,
  noticeRequest,
  readNotice,
} from '@core/prompt/notice'
import { createNameFilter, sceneStops } from '@core/prompt/scene'
import { joinContinuation } from '@core/prompt/replyLength'
import type { Recalled } from '@core/prompt/recall'
import {
  describeConnectionError,
  describeEmptyReply,
  streamChat,
  testConnection,
  type ProviderTarget,
} from '@core/providers'
import { detectContextLength } from '@core/providers/contextLength'
import { serviceName } from '@core/providers/dialects'
import { sameOllamaModel } from '@core/providers/ollama'
import { HttpError } from '@core/providers/httpError'
import { checkVoiceService, describeVoiceError, fetchSample, SPEAK_TIMEOUT_MS, synthesize, type VoiceTarget } from '@core/voice/engines'
import type { MoodReading } from '@core/mood/senseMood'
import {
  cleanNote,
  OUTFIT_MAX_LENGTH,
  PLACE_MAX_LENGTH,
  PLACE_REPLY_TOKENS,
  PLACE_TEMPERATURE,
  readScene,
  asksApart,
  SCENE_LINES,
  sceneAfter,
  sceneAnswered,
  sceneFromLines,
  whatToTell,
} from '@core/prompt/place'
import { activePersona } from '@shared/defaults'
import { IPC } from '@shared/ipc'
import { CLOUD_PROVIDERS, cloudProvider, ELEVENLABS, keySlot, voiceKeySlot } from '@shared/providers'
import {
  MAX_CHAT_MEMBERS,
  type Attempt,
  type BackupInfo,
  type Character,
  type CharacterDraft,
  type ChatMember,
  type ChatMemory,
  type ChatEvent,
  type ChatMessage,
  type ChatOutcome,
  type ChatSummary,
  type ConnectionSettings,
  type DataSummary,
  type EngineStatus,
  type GenerateRequest,
  type ImproveCharacterRequest,
  type ModelInfo,
  type NoticeEvent,
  type OpenedChat,
  type Persona,
  type PlaceEvent,
  type SenseStatus,
  type Settings,
  type SettingsPatch,
  type SpeakOutcome,
  type SpeakRequest,
  type TurnMode,
  type VoiceChoice,
  type VoiceService,
  type VoiceSettings,
  type VoiceStatus,
  type WriteCharacterOutcome,
  type WriteCharacterRequest,
} from '@shared/types'
import {
  adoptCard,
  cardFile,
  createCharacter,
  getCharacter,
  importCards,
  initCharacters,
  listCharacters,
  portraitFile,
  setFavorite,
  setVoice,
  updateCharacter,
} from './characters'
import type { SwappableDatabase } from './chatDatabase'
import type { Engine } from './engine'
import type { KeyStore } from './keyStore'
import { createLoreByMeaning } from './loreByMeaning'
import { createRecall } from './recall'
import type { SenseService } from './sense'
import { colorOfPicture } from './pictureColor'
import { listScenarios, scenarioFile } from './scenarios'
import { forgetSettings, getSettings, updateSettings } from './settings'
import {
  BACKGROUND,
  countCharacters,
  eraseData,
  extractBackup,
  measureData,
  isWebp,
  MAX_BACKGROUND_BYTES,
  readBackupInfo,
  replaceData,
  writeBackup,
} from './userData'

// The handlers behind `window.api`. Each one stays thin: it reads what it needs
// (settings, card files, database), calls a function from src/core, and returns the result.

const runningChats = new Map<string, AbortController>()
/** The kinds of event "Something happens" last offered in each chat, while the app runs: the next ones differ. */
const lastEvents = new Map<string, number[]>()

/** True while a model is writing something for the user: a reply, a character. */
export function modelBusy(): boolean {
  return runningChats.size > 0
}

/** One request to a voice service never carries more than this: the page sends pieces far shorter. */
const MAX_SPOKEN_LENGTH = 3000
/** What a voice says to be listened to, when its service has no sample of it. */
const SAMPLE_SENTENCE = 'Hello! This is how I sound when I read a reply to you.'

/** The mood of a reply is read from its end: no more than this many letters of it. */
const MAX_MOOD_TEXT = 12_000

/** Summing up is a matter of fact: little room for invention. */
const MEMORY_TEMPERATURE = 0.3
/** At most this many requests to sum up old messages before one reply. A very long chat catches up over a few replies. */
const MAX_FOLD_REQUESTS = 6
/**
 * How long after a reply the model is asked to read the latest messages ("adapts to you").
 * Long enough for the next character of a round to start first: it would only be stopped.
 */
const NOTICE_DELAY_MS = 1500

export function registerIpcHandlers(db: SwappableDatabase, keys: KeyStore, dataFolder: string, engine: Engine, sense: SenseService): void {
  /** Lorebook notes the latest messages call by meaning (see loreByMeaning.ts). */
  const loreByMeaning = createLoreByMeaning(sense, (line) => console.log(line))
  /** Old moments of a long chat, brought back when the chat returns to them (see recall.ts). */
  const recall = createRecall(sense, (line) => console.log(line))

  /**
   * Everything needed to reach the server a connection points to. This is where a
   * saved API key joins the request; `apiKey` is a key being tried, not saved yet.
   * For an online service the address comes from the app's own list, never from
   * the page: a key can only travel to the service it belongs to.
   * "On this computer" has no fixed address either: it is the user's Ollama when one
   * runs, the app's own otherwise, started here if need be (see engine.ts).
   */
  async function targetOf(connection: ConnectionSettings, apiKey?: string): Promise<ProviderTarget> {
    if (connection.kind === 'ollama') return { kind: 'ollama', baseUrl: await engine.baseUrl() }

    const slot = keySlot(connection)
    const key = apiKey?.trim() || (slot && (await keys.get(slot))) || undefined

    if (connection.kind === 'cloud') {
      const provider = cloudProvider(connection.provider)
      if (!provider) throw new Error('Choose an online service in Settings > Connection.')
      return { kind: 'cloud', provider: provider.id, baseUrl: provider.baseUrl, apiKey: key }
    }
    return { kind: connection.kind, baseUrl: connection.baseUrl, apiKey: key }
  }

  // Online services say how much a model can read in their list of models. The last
  // list received from each one is kept, to look that up without asking again.
  const modelLists = new Map<string, ModelInfo[]>()
  const listKey = (target: ProviderTarget): string => `${target.kind}:${target.provider ?? target.baseUrl}`

  /** The context length `model` runs with, as its server reports it. Null when it does not say. */
  async function contextLengthOf(
    target: ProviderTarget,
    model: string,
    options: { load?: boolean; signal?: AbortSignal } = {},
  ): Promise<number | null> {
    if (target.kind !== 'cloud') return detectContextLength(target, model, options)
    return modelLists.get(listKey(target))?.find((item) => item.id === model)?.contextLength ?? null
  }

  /** Only the slots keySlot() and voiceKeySlot() can produce are accepted from the page. */
  function checkSlot(slot: string): void {
    const known =
      CLOUD_PROVIDERS.some((provider) => provider.id === slot) ||
      /^custom:https?:\/\/[^/]+$/.test(slot) ||
      slot === 'voice:elevenlabs' ||
      /^voice:custom:https?:\/\/[^/]+$/.test(slot)
    if (!known) throw new Error('Unknown key slot.')
  }

  // --- Voice ---------------------------------------------------------------------
  // The voice service is called from here, where its key is. The page gets sound back.

  /**
   * Everything needed to reach the voice service of `voice`, or null when no voice is
   * chosen. ElevenLabs' address is the app's own, never one from the page: its key can
   * only travel there. `apiKey` is a key being tried, not saved yet.
   */
  async function voiceTargetOf(voice: VoiceSettings, apiKey?: string): Promise<VoiceTarget | null> {
    if (voice.engine !== 'elevenlabs' && voice.engine !== 'server') return null
    const slot = voiceKeySlot(voice)
    const key = apiKey?.trim() || (slot && (await keys.get(slot))) || undefined
    return voice.engine === 'elevenlabs'
      ? { service: 'elevenlabs', baseUrl: ELEVENLABS.baseUrl, apiKey: key, model: String(voice.elevenlabsModel ?? '').trim() }
      : { service: 'server', baseUrl: String(voice.baseUrl ?? '').trim(), apiKey: key, model: String(voice.serverModel ?? '').trim() }
  }

  /** Where the sample of each voice is, for the service last checked. Never sent to the page. */
  const voiceSamples = new Map<string, string>()
  const speaking = new Map<string, AbortController>()

  ipcMain.handle(IPC.voiceCheck, async (_event, voice: VoiceSettings, apiKey?: string): Promise<VoiceStatus> => {
    const target = await voiceTargetOf(voice, apiKey).catch(() => null)
    if (!target) return { ok: false, error: 'Choose what reads the replies aloud first.' }
    const samples = new Map<string, string>()
    const status = await checkVoiceService(target, samples)
    if (status.ok) {
      voiceSamples.clear()
      for (const [id, url] of samples) voiceSamples.set(id, url)
    }
    return status
  })

  /** Runs one request for sound, which `voice.cancel` can stop, and turns a failure into a message. */
  async function sound(
    requestId: string,
    run: (target: VoiceTarget, signal: AbortSignal) => Promise<{ audio: Uint8Array; mime: string }>,
  ): Promise<SpeakOutcome> {
    const { voice } = await getSettings()
    const target = await voiceTargetOf(voice)
    if (!target) return { status: 'error', error: 'No voice is chosen in Settings > Voice.' }

    const controller = new AbortController()
    speaking.set(requestId, controller)
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(SPEAK_TIMEOUT_MS)])
      return { status: 'done', ...(await run(target, signal)) }
    } catch (error) {
      if (controller.signal.aborted) return { status: 'stopped' }
      return { status: 'error', error: describeVoiceError(error, target) }
    } finally {
      speaking.delete(requestId)
    }
  }

  ipcMain.handle(IPC.voiceSpeak, (_event, request: SpeakRequest): Promise<SpeakOutcome> => {
    const text = String(request.text ?? '').trim().slice(0, MAX_SPOKEN_LENGTH)
    const voiceId = String(request.voiceId ?? '').trim()
    if (!text || !voiceId) return Promise.resolve({ status: 'error', error: 'There is nothing to read, or no voice to read it with.' })
    return sound(String(request.requestId), (target, signal) => synthesize(target, { text, voiceId }, signal))
  })

  ipcMain.handle(IPC.voiceSample, (_event, request: { requestId: string; voiceId: string }): Promise<SpeakOutcome> => {
    const voiceId = String(request.voiceId ?? '').trim()
    if (!voiceId) return Promise.resolve({ status: 'error', error: 'Pick a voice first.' })
    return sound(String(request.requestId), (target, signal) => {
      // The service's own sample costs nothing. Without one, a short sentence is spoken.
      const sample = voiceSamples.get(voiceId)
      return sample ? fetchSample(sample, signal) : synthesize(target, { text: SAMPLE_SENTENCE, voiceId }, signal)
    })
  })

  ipcMain.on(IPC.voiceCancel, (_event, requestId: string) => {
    speaking.get(requestId)?.abort()
  })

  ipcMain.handle(IPC.charactersVoice, (_event, id: string, service: VoiceService, voice: VoiceChoice | null) => {
    if (service !== 'elevenlabs' && service !== 'server') throw new Error('Unknown voice service.')
    const voiceId = typeof voice?.id === 'string' ? voice.id.trim().slice(0, 200) : ''
    return setVoice(id, service, voiceId ? { id: voiceId, name: String(voice?.name ?? '').trim().slice(0, 200) || voiceId } : null)
  })

  // --- Settings and connection ---------------------------------------------

  ipcMain.handle(IPC.settingsGet, () => getSettings())

  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: SettingsPatch) => {
    const settings = await updateSettings(patch)
    // Replies now come from elsewhere: the app's own Ollama has nothing left to do.
    if (patch.connection && settings.connection.kind !== 'ollama') void engine.rest().catch(() => {})
    // A context size set by hand is also what the app's own Ollama loads models with.
    if (patch.generation && ('autoContext' in patch.generation || 'contextSize' in patch.generation)) {
      void engine.contextChanged().catch(() => {})
    }
    return settings
  })

  // The user's own chat background: one picture, kept beside the settings. The page
  // sends it as a WebP it made from whatever file was picked (see utils/image.ts).
  ipcMain.handle(IPC.backgroundSet, async (_event, webp: Uint8Array): Promise<Settings> => {
    const bytes = Buffer.from(webp)
    if (bytes.length > MAX_BACKGROUND_BYTES) throw new Error('This picture is too large.')
    if (!isWebp(bytes)) throw new Error('This file is not a picture the app can use as a background.')

    // Written under another name first, so a failure cannot leave half a picture.
    const file = join(dataFolder, BACKGROUND)
    await writeFile(`${file}.part`, bytes)
    await rename(`${file}.part`, file)
    return updateSettings({ appearance: { background: 'custom', backgroundVersion: Date.now() } })
  })

  ipcMain.handle(IPC.backgroundRemove, async (): Promise<Settings> => {
    await rm(join(dataFolder, BACKGROUND), { force: true })
    const { appearance } = await getSettings()
    return updateSettings({
      appearance: { background: appearance.background === 'custom' ? 'character' : appearance.background, backgroundVersion: 0 },
    })
  })

  ipcMain.handle(IPC.connectionTest, async (_event, connection: ConnectionSettings, apiKey?: string) => {
    try {
      const target = await targetOf(connection, apiKey)
      const status = await testConnection(target)
      if (status.ok) modelLists.set(listKey(target), status.models)
      return status
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.connectionContextLength, async (): Promise<number | null> => {
    const { connection } = await getSettings()
    if (!connection.model) return null
    try {
      const found = await contextLengthOf(await targetOf(connection), connection.model)
      // Ollama only says once the model is in memory, so the bar under the message box
      // showed the size set by hand (8k) until the first reply, then jumped (16k). For
      // the app's own Ollama, what it will say is known: the app sets it.
      return found ?? (connection.kind === 'ollama' ? await engine.plannedContext() : null)
    } catch {
      return null
    }
  })

  // --- The mood of a reply -----------------------------------------------------------

  ipcMain.handle(IPC.moodRead, (_event, text: unknown, userName: unknown): Promise<MoodReading> =>
    // A reply is a few thousand letters at most; the end is what says how it ends.
    sense.mood(String(text ?? '').slice(-MAX_MOOD_TEXT), typeof userName === 'string' ? userName.slice(0, 80) : undefined),
  )

  ipcMain.handle(IPC.moodStatus, (): Promise<SenseStatus> => sense.status())

  // --- The model engine on this computer ------------------------------------------

  ipcMain.handle(IPC.engineStatus, (_event, wake?: boolean): Promise<EngineStatus> => engine.status(wake === true))

  ipcMain.handle(IPC.engineDownload, async (_event, typed: string): Promise<Attempt> => {
    const model = cleanModelName(String(typed ?? ''))
    if (!model) return { status: 'error', error: 'That is not the name of a model. It looks like “qwen3:8b” or “hf.co/someone/model-GGUF”.' }
    try {
      await engine.download(model)
      return { status: 'done', value: null }
    } catch (error) {
      if (isAbort(error)) return { status: 'cancelled' }
      return { status: 'error', error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.on(IPC.engineCancel, () => engine.cancel())

  ipcMain.on(IPC.engineRest, () => {
    // Only when replies really come from elsewhere: that is read here, not taken from the page.
    void getSettings()
      .then(({ connection }) => (connection.kind === 'ollama' ? undefined : engine.rest()))
      .catch(() => {})
  })

  ipcMain.handle(IPC.engineRemove, async (_event, typed: string): Promise<Attempt> => {
    const model = cleanModelName(String(typed ?? ''))
    if (!model) return { status: 'error', error: 'That is not the name of a model.' }
    if (modelBusy()) return { status: 'error', error: 'A reply is being written. Wait for it to end, then try again.' }
    try {
      await engine.remove(model)
      // The model in use is gone: better no model, which the app says, than one that fails at the next message.
      const { connection } = await getSettings()
      if (connection.kind === 'ollama' && connection.model && sameOllamaModel(connection.model, model)) {
        await updateSettings({ connection: { model: null } })
      }
      return { status: 'done', value: null }
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : String(error) }
    }
  })

  // API keys go in, and never come back out: the page only learns which ones exist.
  ipcMain.handle(IPC.keysStatus, () => keys.status())

  ipcMain.handle(IPC.keysSet, async (_event, slot: string, key: string) => {
    checkSlot(slot)
    await keys.set(slot, key)
    return keys.status()
  })

  ipcMain.handle(IPC.keysRemove, async (_event, slot: string) => {
    checkSlot(slot)
    await keys.remove(slot)
    return keys.status()
  })

  // --- Characters ------------------------------------------------------------

  ipcMain.handle(IPC.charactersList, async (): Promise<Character[]> => {
    const activity = db.lastActivity()
    return (await listCharacters()).map((character) => {
      const lastChatAt = activity.get(character.id)
      return lastChatAt ? { ...character, lastChatAt } : character
    })
  })

  ipcMain.handle(IPC.charactersImport, (_event, paths: string[]) => importCards(paths))

  ipcMain.handle(IPC.charactersCreate, (_event, draft: CharacterDraft, portrait?: Uint8Array) =>
    createCharacter(draft, portrait),
  )

  ipcMain.handle(IPC.charactersUpdate, async (_event, id: string, draft: CharacterDraft, portrait?: Uint8Array) => {
    const before = await getCharacter(id)
    const saved = await updateCharacter(id, draft, portrait)

    // When the greetings changed, the chats nothing was said in yet open on the new ones:
    // otherwise a character that just got its opening message would still greet with nothing.
    if (before) {
      const persona = activePersona(await getSettings())
      const was = openingOf(before, persona).texts
      const now = openingOf(saved, persona)
      if (was.length !== now.texts.length || was.some((text, index) => text !== now.texts[index])) {
        for (const chat of db.listChats(saved.id)) {
          if (chat.messageCount <= 1) db.refreshGreeting(chat.id, was, now.greeting && { ...now.greeting, id: crypto.randomUUID() }, now.alternatives)
        }
      }
    }
    return saved
  })

  // Ready-to-play scenarios: the characters the app comes with.
  ipcMain.handle(IPC.scenariosList, () => listScenarios())

  ipcMain.handle(IPC.scenariosPlay, async (_event, id: string): Promise<Character> => {
    const file = await scenarioFile(String(id))
    if (!file) throw new Error('This scenario is not part of the app.')
    return adoptCard(file, String(id))
  })

  ipcMain.handle(IPC.charactersFavorite, (_event, id: string, favorite: boolean) => setFavorite(id, favorite === true))

  ipcMain.handle(IPC.charactersColor, async (_event, id: string) => {
    const file = await portraitFile(id)
    return file ? colorOfPicture(file) : null
  })

  // The app's background follows the character on screen: the window's own background
  // (seen while it is resized) and, on Windows, the strip behind its three buttons follow too.
  ipcMain.on(IPC.windowColor, (event, color: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !/^#[0-9a-f]{6}$/i.test(color)) return
    window.setBackgroundColor(color)
    if (process.platform === 'win32') window.setTitleBarOverlay({ color })
  })

  ipcMain.handle(IPC.charactersDelete, async (_event, id: string): Promise<void> => {
    const file = await cardFile(id)
    if (!file) throw new Error('This character no longer exists.')

    // The card goes to the system trash, where it can still be recovered.
    // Its chats are only removed once that worked.
    await shell.trashItem(file)
    db.deleteChatsOf(id)
    db.removeGuest(id) // And it leaves the chats of other characters it had been added to.
  })

  // --- Chats and messages ------------------------------------------------------

  ipcMain.handle(IPC.chatsList, (_event, characterId: string) => db.listChats(characterId))

  ipcMain.handle(IPC.chatsOpen, (_event, chatId: string) => db.getMessages(chatId))

  /**
   * What a chat with `character` opens on: its main greeting as a message, and its other
   * greetings, which become versions of that message. A card may have none at all.
   */
  function openingOf(character: Character, persona: Persona): { texts: string[]; greeting: ChatMessage | null; alternatives: string[] } {
    const macros = { char: character.name, user: persona.name, persona: persona.description }
    const texts = [character.firstMessage, ...character.alternateGreetings].filter((text) => text.trim()).map((text) => applyMacros(text, macros))
    const [first, ...alternatives] = texts
    const greeting: ChatMessage | null = first
      ? { id: crypto.randomUUID(), role: 'assistant', content: first, createdAt: Date.now(), author: character.name, characterId: character.id }
      : null
    return { texts, greeting, alternatives }
  }

  ipcMain.handle(IPC.chatsCreate, async (_event, characterId: string): Promise<OpenedChat> => {
    const character = await getCharacter(characterId)
    if (!character) throw new Error('This character no longer exists.')

    const { greeting, alternatives } = openingOf(character, activePersona(await getSettings()))
    const chat = db.createChat(characterId, greeting, alternatives)
    return { chat, messages: db.getMessages(chat.id) }
  })

  ipcMain.handle(IPC.chatsDelete, (_event, chatId: string) => db.deleteChat(chatId))

  ipcMain.handle(
    IPC.chatsSetScene,
    async (_event, chatId: string, scene: { members: ChatMember[]; turnMode: TurnMode }): Promise<ChatSummary> => {
      const chat = db.getChat(chatId)
      if (!chat) throw new Error('This chat no longer exists.')

      // The chat's own character always stays, and stays first. The others must be
      // real characters, each once, within the limit.
      const known = new Set((await listCharacters()).map((character) => character.id))
      const guests: ChatMember[] = []
      for (const member of scene.members) {
        const id = member.characterId
        if (id === chat.characterId || !known.has(id) || guests.some((guest) => guest.characterId === id)) continue
        guests.push({ characterId: id, quiet: member.quiet === true })
      }
      if (guests.length > MAX_CHAT_MEMBERS - 1) throw new Error(`A chat can hold ${MAX_CHAT_MEMBERS} characters at most.`)

      const ownerQuiet = scene.members.find((member) => member.characterId === chat.characterId)?.quiet === true
      return db.setScene(chatId, guests, scene.turnMode === 'last' ? 'last' : 'round', ownerQuiet)!
    },
  )

  ipcMain.handle(IPC.messagesEdit, (_event, messageId: string, content: string): ChatMessage => {
    const message = db.editMessage(messageId, content)
    if (!message) throw new Error('This message no longer exists.')
    return message
  })

  ipcMain.handle(IPC.messagesDelete, (_event, messageId: string): void => {
    if (db.deleteMessagesFrom(messageId) === 0) throw new Error('This message cannot be deleted.')
  })

  ipcMain.handle(IPC.messagesSelectSwipe, (_event, messageId: string, index: number): ChatMessage => {
    const message = db.selectSwipe(messageId, index)
    if (!message) throw new Error('This message no longer exists.')
    return message
  })

  // The user corrected where the scene is, or emptied it. It is theirs to say: the reply
  // before is no longer what the place is taken from, and another version of the last
  // reply is told this place too.
  ipcMain.handle(IPC.chatsSetPlace, (_event, chatId: string, typed: unknown): ChatSummary => {
    const place = cleanNote(typed, PLACE_MAX_LENGTH)
    const saved = db.setPlace(chatId, { now: place, before: place, messageId: db.placeOf(chatId)?.messageId ?? null })
    if (!saved) throw new Error('This chat no longer exists.')
    return saved
  })

  // The same for what a character of the chat is wearing: written by the user before the
  // app noted anything, or to correct what it noted.
  ipcMain.handle(IPC.chatsSetOutfit, (_event, chatId: string, characterId: string, typed: unknown): ChatSummary => {
    const outfit = cleanNote(typed, OUTFIT_MAX_LENGTH)
    const who = String(characterId)
    const saved = db.setOutfit(chatId, who, { now: outfit, before: outfit, messageId: db.outfitOf(chatId, who)?.messageId ?? null })
    if (!saved) throw new Error('This chat no longer exists.')
    return saved
  })

  // The user rewrote the note on where the story is heading, or emptied it.
  ipcMain.handle(IPC.chatsSetStory, (_event, chatId: string, note: string): ChatSummary => {
    const saved = db.setStory(chatId, String(note).slice(0, 2000))
    if (!saved) throw new Error('This chat no longer exists.')
    return saved
  })

  // --- Adapts to you (beta): the user's tastes, and where each story is heading ----
  //
  // Every so often, after a reply, the model is given the latest messages of the chat
  // and notes what it sees (see src/core/prompt/notice.ts). It happens in the background:
  // the user never waits for it. As soon as something else is asked of the model (a new
  // reply, a character to write), it is stopped, and tried again after the next reply.

  let noticing: AbortController | null = null
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  /** The question "where is the scene now?", asked after a reply (see below). */
  let placing: AbortController | null = null

  /** Whatever the model is doing in the background stops: something the user waits for comes first. */
  function stopNoticing(): void {
    cancelNotice()
    placing?.abort()
    placing = null
  }

  function cancelNotice(): void {
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = null
    noticing?.abort()
    noticing = null
  }

  // --- Where the scene is, what the character wears (see src/core/prompt/place.ts) -----
  //
  // Once a reply is written, the model is asked where the scene now is and what the
  // character who spoke has on: a few words each, kept with the chat and told to the next
  // reply. The question is asked apart from the conversation, with the last messages only,
  // which is how the scene is read best; except of a server on this computer that may
  // hold one conversation in memory and no more, which is asked in the conversation the
  // reply was written in, so that the next reply does not have to read everything again.

  interface SceneJob {
    chatId: string
    /** The reply just written, who wrote it, and what the model read to write it. */
    messageId: string
    speaker: { id: string; name: string }
    messages: LlmMessage[]
    reply: string
    /** Whether the conversation, the reply and one more question still fit in what the model reads. */
    fits: boolean
    /** The last messages, by name, the reply included: what a question asked apart is given. */
    lines: () => TranscriptLine[]
    /** What the reply was told: where the scene was, what the character wore. */
    told: { place: string | null; outfit: string | null }
    target: ProviderTarget
    model: string
    sender: Electron.WebContents
  }

  async function noteScene(job: SceneJob): Promise<void> {
    const controller = new AbortController()
    placing?.abort()
    placing = controller
    const startedAt = Date.now()
    let answered = false
    let apart = true
    try {
      const ollama = job.target.kind === 'ollama' ? ((await engine.current().catch(() => null))?.version ?? null) : null
      if (controller.signal.aborted) return
      apart = asksApart({ cloud: job.target.kind === 'cloud', fits: job.fits, ollama })
      let written = ''
      const stream = streamChat({
        ...job.target,
        model: job.model,
        messages: apart ? sceneFromLines(job.lines(), job.speaker.name, job.told) : sceneAfter(job.messages, job.reply, job.speaker.name, job.told),
        temperature: PLACE_TEMPERATURE,
        maxTokens: PLACE_REPLY_TOKENS,
        thinking: false,
        signal: controller.signal,
      })
      for await (const part of stream) {
        if (part.type !== 'text') continue
        written += part.delta
        // Both lines are there. A small model goes on after them (a question to the user,
        // more of the story): the model is told to stop, which leaves it free sooner.
        if (sceneAnswered(written)) {
          answered = true
          break
        }
      }
      if (answered) controller.abort()
      else if (controller.signal.aborted) return

      // Nothing told ("unknown", or the model went on with the story): things are taken to be as they were.
      const read = readScene(written)
      const place = read.place ?? job.told.place
      const outfit = read.outfit ?? job.told.outfit
      db.setPlace(job.chatId, { now: place, before: job.told.place, messageId: job.messageId })
      const saved = db.setOutfit(job.chatId, job.speaker.id, { now: outfit, before: job.told.outfit, messageId: job.messageId })
      const event: PlaceEvent = { chatId: job.chatId, place, outfits: saved?.outfits ?? {} }
      if (saved && !job.sender.isDestroyed()) job.sender.send(IPC.chatPlace, event)

      const say = (now: string | null, readNow: string | null, before: string | null): string =>
        readNow ? `"${readNow}"${before && readNow !== before ? ` (was "${before}")` : ''}` : now ? `not told, still "${now}"` : 'not told'
      console.log(
        `[scene] ${job.model}: place ${say(place, read.place, job.told.place)}; ${job.speaker.name} wears ${say(outfit, read.outfit, job.told.outfit)}, ${Date.now() - startedAt} ms${apart ? '' : ', asked in the conversation'}`,
      )
    } catch (caught) {
      // Stopped to make way for a reply, or the server failed: things stay as they were known.
      if (controller.signal.aborted && !answered) console.log(`[scene] ${job.model}: stopped to make way`)
      else console.warn('[scene] could not note where the scene is:', caught instanceof Error ? caught.message : caught)
    } finally {
      if (placing === controller) placing = null
    }
  }

  function noticeSoon(chatId: string, sender: Electron.WebContents): void {
    cancelNotice() // Not the question on where the scene is, which was just asked.
    noticeTimer = setTimeout(() => {
      noticeTimer = null
      void notice(chatId, sender).catch((error) => console.warn('[notice] failed:', error instanceof Error ? error.message : error))
    }, NOTICE_DELAY_MS)
  }

  async function notice(chatId: string, sender: Electron.WebContents): Promise<void> {
    const settings = await getSettings()
    const { adapt, connection, generation } = settings
    if (!adapt.learnTastes && !adapt.followStory) return

    const chat = db.getChat(chatId)
    const model = connection.model
    if (!chat || !model) return

    // Only what was written since the last time is read, and only once there is enough of it.
    const history = db.getMessages(chatId)
    const fresh = history.slice(Math.min(db.noticedCount(chatId), history.length))
    if (!dueForNotice(fresh.map((message) => message.role))) return

    const target = await targetOf(connection)
    if (target.kind === 'cloud' && !target.apiKey) return

    const controller = new AbortController()
    noticing = controller
    const startedAt = Date.now()
    try {
      const persona = activePersona(settings)
      const cast = new Map<string, string>()
      for (const member of chat.members) cast.set(member.characterId, (await getCharacter(member.characterId))?.name ?? '')
      const nameOf = (message: ChatMessage): string =>
        message.role === 'user'
          ? (message.author ?? persona.name)
          : cast.get(message.characterId ?? chat.characterId) || message.author || 'The character'

      const detected = generation.autoContext
        ? await contextLengthOf(target, model, { signal: controller.signal }).catch(() => null)
        : null
      const contextSize = effectiveContextSize(generation, detected)
      const lines = latestLines(
        fresh.map((message) => ({ name: nameOf(message), content: message.content })),
        Math.floor(contextSize * 0.6) - 800,
      )

      let written = ''
      const stream = streamChat({
        ...target,
        model,
        messages: noticeRequest({
          lines,
          userName: persona.name,
          wantStory: adapt.followStory,
          story: chat.story ?? '',
          wantTastes: adapt.learnTastes,
          tastes: adapt,
          removed: adapt.removed,
        }),
        temperature: NOTICE_TEMPERATURE,
        maxTokens: NOTICE_REPLY_TOKENS + (generation.thinking ? THINKING_TOKEN_ALLOWANCE : 0),
        thinking: generation.thinking,
        signal: controller.signal,
      })
      for await (const part of stream) if (part.type === 'text') written += part.delta
      if (controller.signal.aborted) return

      const noticed = readNotice(written)
      // The user may have changed their mind, or their tags, while the model was reading.
      const now = (await getSettings()).adapt
      const event: NoticeEvent = { chatId, added: { likes: [], dislikes: [] } }

      if (now.followStory && noticed.story && db.setStory(chatId, noticed.story)) event.story = noticed.story
      if (now.learnTastes) {
        const next = addTastes(now, noticed)
        event.added = next.added
        if (next.added.likes.length + next.added.dislikes.length > 0) {
          await updateSettings({ adapt: { likes: next.likes, dislikes: next.dislikes } })
        }
      }
      db.setNoticedCount(chatId, history.length)

      const news = event.story !== undefined || event.added.likes.length + event.added.dislikes.length > 0
      if (news && !sender.isDestroyed()) sender.send(IPC.chatNotice, event)
      console.log(
        `[notice] ${model}: done, ${lines.length} messages read, story ${event.story !== undefined ? 'written' : 'unchanged'}, ` +
          `+${event.added.likes.length} likes, +${event.added.dislikes.length} dislikes, ${Date.now() - startedAt} ms`,
      )
    } catch (caught) {
      // Stopped to make way for a reply, or the server failed: either way nothing is
      // marked as read, so it is tried again after the next reply.
      if (controller.signal.aborted) console.log(`[notice] ${model}: stopped to make way`)
      else console.warn('[notice] could not read the latest messages:', caught instanceof Error ? caught.message : caught)
    } finally {
      if (noticing === controller) noticing = null
    }
  }

  // The user rewrote what the chat remembers, or asked to start it over (null).
  ipcMain.handle(IPC.chatsSetMemory, (_event, chatId: string, summary: string | null): ChatSummary => {
    const chat = db.getChat(chatId)
    if (!chat) throw new Error('This chat no longer exists.')
    const saved = db.setMemory(chatId, summary === null ? { summary: '', count: 0 } : { summary, count: chat.memory?.count ?? 0 })
    if (!saved) throw new Error('This chat no longer exists.')
    return saved
  })

  // --- Generation ------------------------------------------------------------

  ipcMain.handle(IPC.chatStart, async (event, request: GenerateRequest): Promise<ChatOutcome> => {
    const fail = (error: string): ChatOutcome => ({ status: 'error', message: null, error })

    const chat = db.getChat(request.chatId)
    if (!chat) return fail('This chat no longer exists.')

    stopNoticing() // The reply comes first: the model is not kept busy reading in the background.

    const settings = await getSettings()
    const { connection, generation, adapt } = settings
    const persona = activePersona(settings)

    // Save what the user wrote first, so it is never lost if generation fails.
    if (request.userMessage) {
      db.addMessage(chat.id, { ...request.userMessage, role: 'user', author: persona.name, createdAt: Date.now() })
    }

    // The model reads the conversation so far. For a new version of the last
    // reply ("swipe"), that reply is left out: the model writes it again.
    let history = db.getMessages(chat.id)
    let swipedMessage: ChatMessage | null = null
    if (request.newSwipe) {
      const last = history.at(-1)
      if (!last || last.role !== 'assistant' || history.length < 2) {
        return fail('There is no reply to write another version of.')
      }
      swipedMessage = last
      history = history.slice(0, -1)
    }

    // For the rest of a reply that was cut short, the model reads everything, that reply
    // included, and what it writes is added to that same message.
    let continuedMessage: ChatMessage | null = null
    if (request.continueReply) {
      const last = history.at(-1)
      if (!last || last.role !== 'assistant') return fail('There is no reply to continue.')
      continuedMessage = last
    }

    // Who replies: the character asked for, the one who wrote the reply being redone,
    // or else the chat's own. In a chat with several characters the others are
    // introduced to the model in a line each (see src/core/prompt/scene.ts).
    const speakerId =
      (swipedMessage ?? continuedMessage)?.characterId ??
      (continuedMessage ? undefined : request.speakerId) ??
      chat.characterId
    if (!chat.members.some((member) => member.characterId === speakerId)) {
      return fail('This character is not part of this chat.')
    }
    const character = await getCharacter(speakerId)
    if (!character) return fail("This character's card file is missing from the characters folder.")

    // A stage direction ("something happens", …) goes with a new reply. Another version
    // of a reply follows the direction the reply was written under.
    const direction = continuedMessage ? undefined : swipedMessage ? swipedMessage.direction : isDirection(request.direction) ? request.direction : undefined
    // "Something happens": the app draws two kinds of thing for the model to choose from,
    // never those of the time before in this chat. Another version of the reply draws again.
    const eventKinds = direction === 'event' ? pickEvents(lastEvents.get(chat.id)) : undefined
    if (eventKinds) lastEvents.set(chat.id, eventKinds)

    const others: Character[] = []
    for (const member of chat.members) {
      const other = member.characterId === speakerId ? null : await getCharacter(member.characterId)
      if (other) others.push(other)
    }

    const model = connection.model
    if (!model) return fail('No model is selected. Pick one in Settings.')

    let target: ProviderTarget
    try {
      target = await targetOf(connection)
    } catch (caught) {
      return fail(caught instanceof Error ? caught.message : String(caught))
    }
    // The model that reads moods gets ready while the reply is written, not after it.
    sense.warm()
    if (target.kind === 'cloud' && !target.apiKey) {
      return fail(`There is no ${serviceName(target)} API key. Add one in Settings > Connection.`)
    }

    const controller = new AbortController()
    runningChats.set(request.requestId, controller)
    const startedAt = Date.now()

    // Where the scene is and what the character wears, for the model to keep both. A reply
    // written again is told how things were before it (see src/core/prompt/place.ts).
    const rewriting = (swipedMessage ?? continuedMessage)?.id ?? null
    const toldPlace = generation.keepPlace ? whatToTell(db.placeOf(chat.id), rewriting) : null
    const toldOutfit = generation.keepPlace ? whatToTell(db.outfitOf(chat.id, character.id), rewriting) : null

    // How much the model can read: asked to its server when the setting is automatic.
    // Ollama only knows once the model is in memory, so it is loaded first if need be
    // (it would be loaded for the reply anyway).
    const detected = generation.autoContext
      ? await contextLengthOf(target, model, { load: true, signal: controller.signal }).catch(() => null)
      : null
    const contextSize = effectiveContextSize(generation, detected)

    // Lorebook notes the chat talks about without their keywords, read by the small model
    // that reads moods (see src/core/prompt/loreMeaning.ts). Only with replies from this
    // computer, and never for long: the keywords answer alone when it is not there.
    const loreCalled =
      generation.loreByMeaning && connection.kind === 'ollama'
        ? await loreByMeaning(character, history.map((message) => message.content), persona.name).catch(() => undefined)
        : undefined

    const send = (chatEvent: ChatEvent): void => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.chatEvent, chatEvent)
    }

    // The messages for the model: the card, what is remembered of the chat's oldest
    // messages, then the messages that came after those, as many as fit.
    const fitWith = (memory: ChatMemory, recalled?: Recalled[]) =>
      fitToContext(
        buildMessages({
          character,
          persona,
          systemPrompt: generation.systemPrompt,
          // A reply without a character on record was written by the chat's own.
          history: history.slice(memory.count).map((message) => ({
            ...message,
            characterId: message.role === 'assistant' ? (message.characterId ?? chat.characterId) : undefined,
          })),
          others,
          useCardPrompts: generation.useCardPrompts,
          contextSize,
          replyLength: generation.maxTokens,
          continuing: continuedMessage !== null,
          direction,
          events: eventKinds,
          memory: memory.summary,
          story: adapt.followStory ? chat.story : undefined,
          tastes: adapt.learnTastes ? adapt : undefined,
          place: generation.keepPlace ? toldPlace : undefined,
          outfit: toldOutfit,
          loreByMeaning: loreCalled,
          recalled,
        }),
        { contextSize, replyTokens: replyTokens(generation) },
      )

    // A memory that covers more messages than there are is out of date (it cannot be, but a
    // chat edited by hand in the file could say so): start from none.
    let memory: ChatMemory = chat.memory && chat.memory.count <= history.length ? chat.memory : { summary: '', count: 0 }
    let fit = fitWith(memory)
    let foldedCount = 0

    // Long memory: when messages would be left out, the oldest are summed up first, so
    // that the model keeps a trace of them (see src/core/prompt/memory.ts).
    const nameOf = (message: ChatMessage): string => {
      if (message.role === 'user') return message.author ?? persona.name
      const speaker = [character, ...others].find((item) => item.id === (message.characterId ?? chat.characterId))
      return speaker?.name ?? message.author ?? character.name
    }
    if (generation.memory && fit.droppedCount > 0) {
      const pending = history.slice(memory.count)
      const cardTokens = estimateTokens(fitWith({ summary: '', count: history.length }).messages[0]?.content ?? '')
      const room = fit.budgetTokens - cardTokens - memoryTokens(contextSize)
      const toFold = pending.slice(0, planFold(pending.map((message) => message.content), room))

      if (toFold.length > 0) {
        send({ requestId: request.requestId, type: 'memory' })
        const lines: TranscriptLine[] = toFold.map((message) => ({ name: nameOf(message), content: message.content }))
        // What one request can hold besides its instructions, the memory so far and the new memory.
        const requestRoom = Math.floor(contextSize * 0.9) - 2 * memoryReplyTokens(contextSize) - 400
        try {
          for (const batch of foldBatches(lines, requestRoom).slice(0, MAX_FOLD_REQUESTS)) {
            let written = ''
            const stream = streamChat({
              ...target,
              model,
              messages: memoryRequest({ summary: memory.summary, lines: batch, contextSize }),
              temperature: MEMORY_TEMPERATURE,
              maxTokens: memoryReplyTokens(contextSize) + (generation.thinking ? THINKING_TOKEN_ALLOWANCE : 0),
              thinking: generation.thinking,
              signal: controller.signal,
            })
            for await (const part of stream) if (part.type === 'text') written += part.delta

            const summary = cleanMemory(written)
            if (!summary) break // Nothing usable: keep the memory as it was, the reply matters more.
            memory = { summary, count: memory.count + batch.length }
            foldedCount += batch.length
            db.setMemory(chat.id, memory) // Saved batch by batch: a later failure loses nothing.
          }
        } catch (caught) {
          if (controller.signal.aborted) {
            runningChats.delete(request.requestId)
            console.log(`[chat] ${model}: stopped while summing up old messages (${foldedCount} folded)`)
            return { status: 'stopped', message: null }
          }
          // The memory could not be updated. The reply is still written: the oldest
          // messages are left out for now, and folding is tried again next time.
          console.warn('[chat] could not sum up old messages:', caught instanceof Error ? caught.message : caught)
        }
        fit = fitWith(memory)
      }
    }

    // Old moments the chat comes back to, word for word: the messages the model no longer
    // reads (summed up, or left out) are searched by meaning (see src/core/prompt/recall.ts).
    const unseen = memory.count + fit.droppedCount
    if (generation.recallByMeaning && connection.kind === 'ollama' && unseen > 0 && !continuedMessage) {
      const recalled = await recall(
        history.slice(0, unseen).map((message) => ({ role: message.role, name: nameOf(message), content: message.content })),
        history.map((message) => message.content),
        contextSize,
        [persona.name, character.name, ...others.map((other) => other.name)],
      ).catch(() => undefined)
      if (recalled?.length) fit = fitWith(memory, recalled)
    }

    // In a scene, models tend to sign their lines ("Elara: …") and to go on writing
    // the others' lines. The first is removed as the text arrives, the second is cut short.
    const inScene = others.length > 0
    const ownName = inScene ? createNameFilter(character.name) : null

    let content = ''
    let thinkingLength = 0
    let finishReason: string | null = null
    let status: ChatOutcome['status'] = 'done'
    let error: string | undefined

    try {
      const stream = streamChat({
        ...target,
        model,
        messages: fit.messages,
        temperature: generation.temperature,
        maxTokens: replyTokens(generation),
        thinking: generation.thinking,
        stop: inScene ? sceneStops(others, persona.name) : undefined,
        signal: controller.signal,
      })
      const write = (text: string): void => {
        if (!text) return
        // The rest of a reply: a space goes before it when the two halves need one.
        if (continuedMessage && !content) text = joinContinuation(continuedMessage.content, text) + text
        content += text
        send({ requestId: request.requestId, type: 'text', delta: text })
      }

      for await (const part of stream) {
        if (part.type === 'text') {
          write(ownName ? ownName.push(part.delta) : part.delta)
        } else if (part.type === 'thinking') {
          // The reasoning itself is not shown; the UI only needs to know it started.
          if (thinkingLength === 0) send({ requestId: request.requestId, type: 'thinking' })
          thinkingLength += part.delta.length
        } else {
          finishReason = part.reason
        }
      }
      write(ownName?.flush() ?? '')

      // Nothing more to add to a reply is an answer too: it was complete after all.
      if (!content.trim() && !(continuedMessage && finishReason !== 'length')) {
        status = 'error'
        error = describeEmptyReply({ sawThinking: thinkingLength > 0, finishReason })
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        status = 'stopped'
      } else {
        status = 'error'
        error = describeConnectionError(caught, target)
        // A key problem is fixed in the settings: say where, since the chat screen is not there.
        if (caught instanceof HttpError && caught.status === 401) error += ' You can change the key in Settings > Connection.'
      }
    } finally {
      runningChats.delete(request.requestId)
    }

    // Keep whatever was written, even if the reply was stopped or failed halfway.
    // A reply that ran into the length limit is marked, so that its rest can be asked for.
    const cut = finishReason === 'length'
    let message: ChatMessage | null = null
    if (continuedMessage) {
      // Stopped or failed halfway: the reply is still not finished.
      if (content.trim() || status === 'done') {
        message = db.extendMessage(continuedMessage.id, continuedMessage.content + (content.trim() ? content : ''), cut || status !== 'done')
      }
    } else if (content.trim()) {
      const createdAt = Date.now()
      const meta = status === 'done' ? { model, durationMs: createdAt - startedAt } : undefined

      if (swipedMessage) {
        message = db.addSwipe(swipedMessage.id, { content, createdAt, meta, ...(cut && { cut }) })
      } else {
        message = {
          id: request.replyId,
          role: 'assistant',
          content,
          createdAt,
          author: character.name,
          characterId: character.id,
          ...(meta && { meta }),
          ...(cut && { cut }),
          ...(direction && { direction }),
        }
        db.addMessage(chat.id, message)
      }
    }

    // One line per reply in the terminal that runs `pnpm dev`, to see what happened.
    console.log(
      `[chat] ${model}${inScene ? ` as ${character.name}` : ''}: ${status}${continuedMessage ? ' (continuing)' : ''}${direction ? ` (direction: ${direction}${eventKinds ? `, kinds ${eventKinds.map((kind) => kind + 1).join(' or ')}` : ''})` : ''}, ${content.length} chars of text, ${thinkingLength} chars of thinking, ` +
        `finish=${finishReason ?? 'none'}, ${Date.now() - startedAt} ms, ` +
        `context ~${fit.usedTokens}/${fit.budgetTokens} tokens of ${contextSize}` +
        (generation.autoContext ? (detected ? ` (server says ${detected})` : ' (server does not say)') : ' (set by hand)') +
        (memory.count ? ` (memory: ${memory.count} messages${foldedCount ? `, ${foldedCount} just summed up` : ''})` : '') +
        (fit.droppedCount ? ` (${fit.droppedCount} oldest messages left out)` : '') +
        (generation.keepPlace ? ` (told: place ${toldPlace ? `"${toldPlace}"` : 'as it is'}${toldOutfit ? `, wearing "${toldOutfit}"` : ''})` : '') +
        (error ? ` | ${error}` : ''),
    )
    // A whole reply: where is the scene now, and what is the character wearing? Asked at
    // once, while the model still has it all in mind.
    if (status === 'done' && message && !cut && generation.keepPlace) {
      const written = message
      void noteScene({
        chatId: chat.id,
        messageId: written.id,
        speaker: { id: character.id, name: character.name },
        messages: fit.messages,
        reply: content,
        fits: fit.usedTokens + estimateTokens(content) + PLACE_REPLY_TOKENS + 200 <= contextSize,
        lines: () =>
          [...history.slice(1 - SCENE_LINES), written].map((item) => ({
            name:
              item.role === 'user'
                ? (item.author ?? persona.name)
                : ([character, ...others].find((member) => member.id === (item.characterId ?? chat.characterId))?.name ?? item.author ?? character.name),
            content: item.content,
          })),
        told: { place: toldPlace, outfit: toldOutfit },
        target,
        model,
        sender: event.sender,
      })
    }
    // A whole new reply: the model may now read the latest messages, once things are quiet.
    if (status === 'done' && !continuedMessage) noticeSoon(chat.id, event.sender)
    return { status, message, ...(error && { error }) }
  })

  ipcMain.on(IPC.chatCancel, (_event, requestId: string) => {
    runningChats.get(requestId)?.abort()
  })

  // --- Writing a character from an idea ----------------------------------------
  // The connected model writes a whole card (see src/core/cards/writeCard.ts). Nothing
  // is saved here: the text goes to the character editor, where the user reads it,
  // changes what they like and creates the character.

  /**
   * Has the model write a card, or a part of one, and sends the text to the page as it
   * arrives (on the chat's own channel, under `requestId`). `what` names the job in the log.
   */
  async function writeCard(
    event: Electron.IpcMainInvokeEvent,
    requestId: string,
    job: { messages: LlmMessage[]; maxTokens: number; temperature: number; what: string },
  ): Promise<WriteCharacterOutcome> {
    const fail = (error: string): WriteCharacterOutcome => ({ status: 'error', text: '', error })

    stopNoticing()
    const { connection, generation } = await getSettings()
    const model = connection.model
    if (!model) return fail('No model is selected. Pick one in Settings > Connection.')

    let target: ProviderTarget
    try {
      target = await targetOf(connection)
    } catch (caught) {
      return fail(caught instanceof Error ? caught.message : String(caught))
    }
    if (target.kind === 'cloud' && !target.apiKey) {
      return fail(`There is no ${serviceName(target)} API key. Add one in Settings > Connection.`)
    }

    const controller = new AbortController()
    runningChats.set(requestId, controller)
    const startedAt = Date.now()
    const send = (chatEvent: ChatEvent): void => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.chatEvent, chatEvent)
    }

    let text = ''
    let thinkingLength = 0
    let finishReason: string | null = null
    let status: WriteCharacterOutcome['status'] = 'done'
    let error: string | undefined
    try {
      const stream = streamChat({
        ...target,
        model,
        messages: job.messages,
        temperature: job.temperature,
        maxTokens: job.maxTokens + (generation.thinking ? THINKING_TOKEN_ALLOWANCE : 0),
        thinking: generation.thinking,
        signal: controller.signal,
      })
      for await (const part of stream) {
        if (part.type === 'text') {
          text += part.delta
          send({ requestId, type: 'text', delta: part.delta })
        } else if (part.type === 'thinking') {
          if (thinkingLength === 0) send({ requestId, type: 'thinking' })
          thinkingLength += part.delta.length
        } else {
          finishReason = part.reason
        }
      }
      if (!text.trim()) {
        status = 'error'
        error = describeEmptyReply({ sawThinking: thinkingLength > 0, finishReason })
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        status = 'stopped'
      } else {
        status = 'error'
        error = describeConnectionError(caught, target)
        if (caught instanceof HttpError && caught.status === 401) error += ' You can change the key in Settings > Connection.'
      }
    } finally {
      runningChats.delete(requestId)
    }

    console.log(
      `[card] ${model}: ${status} (${job.what}), ${text.length} chars of text, ${thinkingLength} chars of thinking, ` +
        `finish=${finishReason ?? 'none'}, ${Date.now() - startedAt} ms` +
        (error ? ` | ${error}` : ''),
    )
    return { status, text, ...(finishReason === 'length' && { cut: true }), ...(error && { error }) }
  }

  // "Describe your character": the whole card, from an idea.
  ipcMain.handle(IPC.charactersWrite, async (event, request: WriteCharacterRequest): Promise<WriteCharacterOutcome> => {
    const { adapt } = await getSettings()
    // "Use my tastes": only while the user has the app learn them.
    const tastes = request.useTastes && adapt.learnTastes ? { likes: adapt.likes, dislikes: adapt.dislikes } : undefined
    const moods = cleanMoods(request.moods)
    const idea = typeof request.idea === 'string' ? request.idea : ''
    return writeCard(event, request.requestId, {
      messages: cardRequest(idea, tastes, moods),
      maxTokens: CARD_REPLY_TOKENS,
      temperature: CARD_TEMPERATURE,
      what: [idea.trim() ? 'whole card' : 'whole card, no idea given', tastes && 'with tastes', moods.length > 0 && `moods: ${describeMoods(moods)}`]
        .filter(Boolean)
        .join(', '),
    })
  })

  // Advice on a character: the one part of the card a piece of advice is about.
  ipcMain.handle(IPC.charactersImprove, async (event, request: ImproveCharacterRequest): Promise<WriteCharacterOutcome> => {
    const messages = isTipId(request.tip) ? improveRequest(request.card, request.tip) : null
    if (!messages) return { status: 'error', text: '', error: 'There is nothing to write for this advice.' }
    return writeCard(event, request.requestId, {
      messages,
      maxTokens: IMPROVE_REPLY_TOKENS,
      temperature: IMPROVE_TEMPERATURE,
      what: request.tip,
    })
  })

  // --- Data & privacy ---------------------------------------------------------
  // What these do to the files is in userData.ts. Here: the file dialogs, and
  // keeping the rest of the app in step when the files change under it.

  /** Runs something that can fail, and turns a failure into a message for the page. */
  async function attempt<T>(run: () => Promise<Attempt<T>>): Promise<Attempt<T>> {
    if (runningChats.size > 0) return { status: 'error', error: 'A reply is being written. Wait for it to end, then try again.' }
    stopNoticing() // Nothing may be written to the data while it is replaced or erased.
    try {
      return await run()
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : String(error) }
    }
  }

  const windowOf = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null => BrowserWindow.fromWebContents(event.sender)
  const backupFiles = [{ name: 'SillySimple backup', extensions: ['zip'] }]

  ipcMain.handle(IPC.dataSummary, async (): Promise<DataSummary> => {
    return {
      folder: dataFolder,
      characters: await countCharacters(dataFolder),
      ...db.counts(),
      bytes: await measureData(dataFolder),
    }
  })

  ipcMain.handle(IPC.dataOpenFolder, async () => {
    await shell.openPath(dataFolder)
  })

  ipcMain.handle(IPC.dataBackup, (event) =>
    attempt<BackupInfo>(async () => {
      const window = windowOf(event)
      const today = new Date().toLocaleDateString('en-CA') // 2026-10-06
      const options = { title: 'Save a backup', defaultPath: `SillySimple backup ${today}.zip`, filters: backupFiles }
      const chosen = await (window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options))
      if (chosen.canceled || !chosen.filePath) return { status: 'cancelled' }

      const backup = await writeBackup(chosen.filePath, {
        folder: dataFolder,
        settings: await getSettings(),
        counts: db.counts(),
        snapshotChats: (target) => db.snapshot(target),
      })
      return { status: 'done', value: backup }
    }),
  )

  // Restoring takes two steps, so the user can see what a file holds before anything
  // is replaced. The file chosen in the first step is remembered here: the page never
  // names a file to restore.
  let chosenBackup: string | null = null

  ipcMain.handle(IPC.dataChooseBackup, (event) =>
    attempt<BackupInfo>(async () => {
      chosenBackup = null
      const window = windowOf(event)
      const options = { title: 'Choose a backup', filters: backupFiles, properties: ['openFile' as const] }
      const chosen = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
      const file = chosen.filePaths[0]
      if (chosen.canceled || !file) return { status: 'cancelled' }

      const backup = await readBackupInfo(file)
      chosenBackup = file
      return { status: 'done', value: backup }
    }),
  )

  ipcMain.handle(IPC.dataRestore, () =>
    attempt(async () => {
      const file = chosenBackup
      chosenBackup = null
      if (!file) return { status: 'error', error: 'Choose a backup file first.' }

      // Taken apart and checked first: a bad file is refused before anything is touched.
      const staging = join(dataFolder, 'restore-staging')
      await extractBackup(file, staging)
      await db.swap(() => replaceData(dataFolder, staging))
      forgetSettings()
      return { status: 'done', value: null }
    }),
  )

  ipcMain.handle(IPC.dataDeleteChats, () =>
    attempt(async () => {
      db.deleteAllChats()
      return { status: 'done', value: null }
    }),
  )

  ipcMain.handle(IPC.dataErase, () =>
    attempt(async () => {
      await db.swap(() => eraseData(dataFolder))
      await keys.clear()
      forgetSettings()
      modelLists.clear()
      // As on a first launch: the folder comes back, empty.
      await initCharacters(join(dataFolder, 'characters'))
      return { status: 'done', value: null }
    }),
  )
}
