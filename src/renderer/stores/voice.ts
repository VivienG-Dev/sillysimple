import { NEXT_CHUNK, speechChunks, speechParts, speechText } from '@core/voice/speechText'
import type { Character, VoiceChoice, VoiceService, VoiceStatus } from '@shared/types'

// Replies read aloud. This store knows which voice a character speaks with, asks the
// main process for the sound (the voice service and its key are there) and plays it.
//
// One thing is heard at a time: a message, or the sample of a voice. A message is asked
// for in pieces, the first one short, so that the first sound comes quickly; the next
// piece is fetched while the one before plays. What was already spoken is kept while
// the app runs: listening again costs nothing.

/** What is being heard, or about to be: "message:<id>" or "sample:<voice id>". */
type Playing = { key: string; state: 'loading' | 'playing' }

/** How many messages are kept ready to be heard again. */
const KEPT_MESSAGES = 12

export const useVoiceStore = defineStore('voice', () => {
  const settingsStore = useSettingsStore()
  const charactersStore = useCharactersStore()

  const settings = computed(() => settingsStore.settings.voice)
  /** The voice service in use, or null when nothing reads the replies aloud. */
  const service = computed<VoiceService | null>(() => (settings.value.engine === 'off' ? null : settings.value.engine))
  const enabled = computed(() => service.value !== null)

  /** The voice of the characters that have none of their own. */
  const defaultVoice = computed<VoiceChoice | null>(() =>
    service.value === 'elevenlabs' ? settings.value.elevenlabsVoice : service.value === 'server' ? settings.value.serverVoice : null,
  )

  /** The voice that tells what is not said, when replies are read with a narrator. Null: none chosen. */
  const narratorVoice = computed<VoiceChoice | null>(() =>
    service.value === 'elevenlabs' ? settings.value.elevenlabsNarrator : service.value === 'server' ? settings.value.serverNarrator : null,
  )

  /** The voice a character speaks with: its own, or the one chosen for everyone. */
  function voiceOf(character: Character | null | undefined): VoiceChoice | null {
    if (!service.value) return null
    return character?.voices?.[service.value] ?? defaultVoice.value
  }

  // --- What the service offers -------------------------------------------------------

  const status = ref<VoiceStatus | null>(null)
  const checking = ref(false)
  let latestCheck = 0

  /** Asks the voice service what it offers. `apiKey`: a key being typed, not saved yet. */
  async function check(apiKey?: string): Promise<VoiceStatus | null> {
    const thisCheck = ++latestCheck
    if (!enabled.value) {
      status.value = null
      checking.value = false
      return null
    }
    checking.value = true
    const result = await window.api.voice.check(toPlain(settings.value), apiKey)
    if (thisCheck !== latestCheck) return result // A newer check is running: its answer is the one that counts.
    status.value = result
    checking.value = false
    return result
  }

  /** The voices, asked for once: the places that only need the list call this. */
  async function ensureChecked(): Promise<void> {
    if (enabled.value && !status.value && !checking.value) await check()
  }

  const voices = computed(() => (status.value?.ok ? status.value.voices : []))

  // --- Playing -----------------------------------------------------------------------

  const playing = ref<Playing | null>(null)
  /** Why the last thing asked for could not be heard. Shown where it was asked. */
  const problem = ref<{ key: string; message: string } | null>(null)

  let audio: HTMLAudioElement | null = null
  /** Raised each time what is heard changes: whatever was under way sees it and gives up. */
  let turn = 0
  const pending = new Set<string>()
  /** Messages read automatically, waiting for the one being heard to end. */
  let queue: { id: string; content: string; characterId: string }[] = []
  const kept = new Map<string, Blob[]>()

  function silence(): void {
    turn++
    for (const requestId of pending) window.api.voice.cancel(requestId)
    pending.clear()
    if (audio) {
      audio.pause()
      if (audio.src) URL.revokeObjectURL(audio.src)
      audio.removeAttribute('src')
    }
    playing.value = null
  }

  /** Stops what is being heard, and forgets what was waiting to be. */
  function stop(): void {
    queue = []
    silence()
  }

  /** Plays one piece of sound to its end. Resolves false when it was cut short. */
  function play(blob: Blob, mine: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      audio ??= new Audio()
      const player = audio
      const url = URL.createObjectURL(blob)
      const done = (outcome: boolean | Error): void => {
        player.onended = player.onerror = player.onpause = null
        URL.revokeObjectURL(url)
        if (outcome instanceof Error) reject(outcome)
        else resolve(outcome)
      }
      player.onended = () => done(true)
      player.onerror = () => done(new Error('This sound could not be played.'))
      // Paused by silence(): someone asked for something else.
      player.onpause = () => {
        if (!player.ended) done(false)
      }
      player.src = url
      player.play().catch((error: unknown) => {
        if (mine !== turn) done(false)
        else done(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  /** Asks the main process for a sound, and turns its answer into something to play. Null when stopped. */
  async function fetchSound(ask: (requestId: string) => ReturnType<typeof window.api.voice.speak>): Promise<Blob | null> {
    const requestId = crypto.randomUUID()
    pending.add(requestId)
    try {
      const outcome = await ask(requestId)
      if (outcome.status === 'stopped') return null
      if (outcome.status === 'error') throw new Error(outcome.error)
      return new Blob([outcome.audio as BlobPart], { type: outcome.mime })
    } finally {
      pending.delete(requestId)
    }
  }

  /** Hears `pieces` one after the other under `key`. Each is a sound, or how to get it. */
  async function hear(key: string, pieces: (() => Promise<Blob | null>)[]): Promise<void> {
    silence()
    const mine = turn
    problem.value = null
    playing.value = { key, state: 'loading' }
    try {
      let next = pieces[0]?.() ?? Promise.resolve(null)
      for (let index = 0; index < pieces.length; index++) {
        const blob = await next
        if (mine !== turn || !blob) return
        // The piece after this one is fetched while this one plays.
        next = pieces[index + 1]?.() ?? Promise.resolve(null)
        next.catch(() => {}) // Its failure is told when its turn comes.
        playing.value = { key, state: 'playing' }
        if (!(await play(blob, mine))) return
      }
    } catch (error) {
      if (mine === turn) problem.value = { key, message: error instanceof Error ? error.message : String(error) }
    } finally {
      if (mine === turn) {
        playing.value = null
        void readNext()
      }
    }
  }

  const stateOf = (key: string): 'idle' | 'loading' | 'playing' => (playing.value?.key === key ? playing.value.state : 'idle')

  // --- Messages ----------------------------------------------------------------------

  const messageKey = (id: string): string => `message:${id}`

  async function readMessage(id: string, content: string, character: Character | null | undefined): Promise<void> {
    const key = messageKey(id)
    const voice = voiceOf(character)
    if (!voice) {
      problem.value = { key, message: 'No voice is chosen yet. Pick one in Settings › Voice.' }
      return
    }
    // What is to be said, and by whom. With a narrator, the message is cut where the voice
    // changes; a narrator who has the character's own voice is no narrator, and nothing is cut.
    const narrator = narratorVoice.value ?? defaultVoice.value ?? voice
    const twoVoices = settings.value.read === 'narrator' && narrator.id !== voice.id
    const said = twoVoices
      ? speechParts(content).map((part) => ({ voiceId: part.by === 'narrator' ? narrator.id : voice.id, text: part.text }))
      : [{ voiceId: voice.id, text: speechText(content, settings.value.read === 'speech' ? 'speech' : 'all') }]
    // Each stretch is asked for in pieces; only the very first piece is a short one.
    const pieces = said.flatMap((part, index) =>
      speechChunks(part.text, ...(index === 0 ? [] : [NEXT_CHUNK])).map((text) => ({ voiceId: part.voiceId, text })),
    )
    if (pieces.length === 0) {
      problem.value = { key, message: 'There is nothing said aloud in this message.' }
      return
    }

    // The same words in the same voices were already spoken: they are played again as they are.
    const signature = JSON.stringify([service.value, settings.value.elevenlabsModel, settings.value.serverModel, settings.value.baseUrl, pieces])
    const sounds = kept.get(signature) ?? []
    kept.delete(signature)
    kept.set(signature, sounds)
    for (const oldest of [...kept.keys()].slice(0, Math.max(0, kept.size - KEPT_MESSAGES))) kept.delete(oldest)

    await hear(
      key,
      pieces.map((piece, index) => async () => {
        const ready = sounds[index]
        if (ready) return ready
        const blob = await fetchSound((requestId) => window.api.voice.speak({ requestId, text: piece.text, voiceId: piece.voiceId }))
        if (blob) sounds[index] = blob
        return blob
      }),
    )
  }

  /** The speaker button of a message: reads it, or stops reading it. */
  function toggleMessage(id: string, content: string, character: Character | null | undefined): void {
    if (playing.value?.key === messageKey(id)) {
      stop()
      return
    }
    queue = []
    void readMessage(id, content, character)
  }

  /**
   * A reply was just written: reads it when the user asked for replies to be read as
   * they come. In a scene the characters speak in turn, each waiting for the one before.
   */
  function replyWritten(message: { id: string; content: string; characterId?: string | null }): void {
    if (!enabled.value || !settings.value.autoRead) return
    queue.push({ id: message.id, content: message.content, characterId: message.characterId ?? '' })
    if (!playing.value) void readNext()
  }

  async function readNext(): Promise<void> {
    const next = queue.shift()
    if (!next) return
    const character = charactersStore.characters.find((item) => item.id === next.characterId) ?? charactersStore.active
    await readMessage(next.id, next.content, character)
  }

  // --- Samples -----------------------------------------------------------------------

  const sampleKey = (voiceId: string): string => `sample:${voiceId}`

  /** The play button next to a voice: lets it be heard before it is chosen, or stops it. */
  function toggleSample(voiceId: string): void {
    const key = sampleKey(voiceId)
    if (playing.value?.key === key) {
      stop()
      return
    }
    queue = []
    void hear(key, [() => fetchSound((requestId) => window.api.voice.sample({ requestId, voiceId }))])
  }

  // Another chat on screen: what was being read belongs to the one before.
  const chatStore = useChatStore()
  watch(
    () => chatStore.activeChatId,
    () => stop(),
  )

  // Another voice service: what was listed and what was heard belong to the one before.
  watch(
    // One text, so that saving any other setting does not look like a change of service.
    () => `${settings.value.engine} ${settings.value.baseUrl}`,
    () => {
      stop()
      status.value = null
      problem.value = null
    },
  )

  return {
    settings,
    service,
    enabled,
    defaultVoice,
    narratorVoice,
    voiceOf,
    status,
    checking,
    voices,
    check,
    ensureChecked,
    playing,
    problem,
    stateOf,
    messageKey,
    sampleKey,
    toggleMessage,
    replyWritten,
    toggleSample,
    stop,
  }
})
