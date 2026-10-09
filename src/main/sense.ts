import { SENSE_MODEL, type SenseModel } from '@core/engine/models'
import { compareVersions } from '@core/engine/release'
import { detectMood, type Mood } from '@core/mood/detectMood'
import { anchorList, buildSense, cutReply, senseMood, settleMood, type MoodReading, type Sense, type SenseReading } from '@core/mood/senseMood'
import { embedWithOllama } from '@core/providers/ollama'
import type { SenseStatus } from '@shared/types'
import type { Engine } from './engine'

// The app's own model for what a text means (EmbeddingGemma 2), and its first use: the
// mood of a reply, read from its meaning where the word lists are silent.
//
// It is a second, small model next to the chat model, in the same Ollama. The app gets
// it by itself, quietly, the first time it would be of use; until it is there, and
// wherever it cannot be (another kind of computer, replies that come from elsewhere, an
// Ollama too old), the mood is read from the words alone, as before. Nothing here can
// stop a reply or show an error to the user: a reading that fails is a reading by words.
//
// Nothing is started for it: it only works with an Ollama that runs anyway, because a
// reply was just written by it.

/**
 * How long a reply waits for its mood to be read by meaning. Past it, what the words say
 * is shown, or nothing: a symbol that pops up seconds after a reply reads as a mistake.
 * (Vivien, 7 October: a first reading took 3.8 s, the model loading, and he saw nothing.)
 * The reading itself goes on, and is kept for the next look at that reply.
 */
const PATIENCE_MS = 1200
/** A question the model has not answered after this long is given up, and counted against it. */
const TIMEOUT_MS = 8000
/** How long Ollama keeps the model in memory after a question: reading the next reply does not load it again. */
const KEEP_ALIVE = '30m'
/** After a failure, how long before it is tried again; twice as long after each one in a row. */
const RETRY_MS = 30_000
const LONGEST_RETRY_MS = 10 * 60_000
/**
 * After this many questions in a row that the model could not answer, it is left alone
 * until the app is started again: it does not work here. A download that fails is not
 * one of them: that is the network, and it is only tried again later.
 */
const MAX_FAILURES = 3
/** Readings kept: opening a chat again does not ask the model again. */
const REMEMBERED = 200

export interface SenseOptions {
  engine: Pick<Engine, 'current' | 'has' | 'fetchQuietly' | 'hold' | 'rest'>
  /** False on computers whose Ollama cannot run the model (see `senseSupported`). */
  supported: boolean
  /** Which file of the model (see `senseModel`). The compressed one, for a Mac with an Apple chip, when left out. */
  model?: SenseModel
  /**
   * What the settings say now: whether moods are read by meaning (`on`), whether lorebook
   * notes are called by meaning (`lore`), whether old moments of a chat are brought back
   * (`recall`), and whether replies come from this computer.
   */
  wanted: () => Promise<{ on: boolean; local: boolean; lore?: boolean; recall?: boolean }>
  log?: (line: string) => void
  patienceMs?: number
  timeoutMs?: number
  retryMs?: number
}

export interface SenseService {
  /** The mood of a reply. Never throws, never takes much longer than its patience. */
  mood(text: string, userName?: string): Promise<MoodReading>
  /**
   * Gets the model ready ahead of time, when it is wanted: called as a reply starts being
   * written, so that its mood can be read the moment it ends. Returns at once.
   */
  warm(): void
  /** Where reading by meaning stands, for the settings. Looking is enough to get it ready when it can be. */
  status(): Promise<SenseStatus>
  /**
   * The model's vectors for these texts, for the lorebook (see loreMeaning.ts) or for old
   * moments of a chat (`use` 'recall', see recall.ts). Null when that is not to be done here, when the model is not ready (it is then
   * got ready for next time), or when it does not answer within `waitMs`. Never throws.
   */
  embed(texts: string[], waitMs: number, use?: 'lore' | 'recall'): Promise<number[][] | null>
}

export function createSense(options: SenseOptions): SenseService {
  const log = options.log ?? (() => {})
  const patienceMs = options.patienceMs ?? PATIENCE_MS
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  const retryMs = options.retryMs ?? RETRY_MS
  const about = options.model ?? SENSE_MODEL
  const model = about.id

  /** The moods as the model sees them. Null until it was asked, and again when the model is gone. */
  let sense: Sense | null = null
  let preparing: Promise<void> | null = null
  /** From 0 to 1 while the model downloads. */
  let progress: number | null = null
  /** Readings waiting to know whether the model has to be downloaded first: they do not wait for a download. */
  const waiting = new Set<() => void>()
  /** Why it cannot work with the Ollama that runs now. Looked at again each time. */
  let outdated: string | null = null
  /** What went wrong the last time, until something works again. */
  let problem: string | null = null
  /** Failures in a row, of any kind: what the wait before the next try grows with. */
  let failures = 0
  /** The ones among them where the model was there and could not answer. */
  let strikes = 0
  let gaveUp = false
  /** Nothing is tried again before this. */
  let retryAt = 0
  const remembered = new Map<string, MoodReading>()

  function failed(error: unknown, doing: string, strike: boolean): void {
    // Stopped on purpose: the app is closing, or its Ollama was asked to stop.
    if (error instanceof Error && error.name === 'AbortError') return
    problem = error instanceof Error ? (error.name === 'TimeoutError' ? `The model took more than ${Math.round(timeoutMs / 1000)} seconds to answer.` : error.message) : String(error)
    failures++
    if (strike) strikes++
    gaveUp = strikes >= MAX_FAILURES
    const pause = Math.min(LONGEST_RETRY_MS, retryMs * 2 ** (failures - 1))
    retryAt = Date.now() + pause
    log(`mood: ${doing} failed: ${problem} ${gaveUp ? 'Left alone until the app is started again.' : `Tried again in ${Math.round(pause / 1000)} s.`}`)
  }

  function worked(): void {
    failures = 0
    strikes = 0
    problem = null
    retryAt = 0
  }

  /** Has the model downloaded if need be, then asks it where each mood is. */
  function prepare(): Promise<void> {
    preparing ??= (async () => {
      if (gaveUp || Date.now() < retryAt) return
      let server = await options.engine.current()
      if (!server) return
      // A build made by hand says 0.0.0: whoever runs one knows what is in it.
      outdated =
        server.version !== '0.0.0' && compareVersions(server.version, about.needsOllama) < 0
          ? `It takes Ollama ${about.needsOllama} or newer; the one running is ${server.version}.`
          : null
      if (outdated) return

      // The app's own Ollama is not stopped between the download and the first questions.
      const release = options.engine.hold()
      try {
        if (!(await options.engine.has(model))) {
          progress = 0
          for (const told of waiting) told()
          log(`mood: downloading ${model} (${Math.round(about.bytes / 1e6)} MB), to read moods by meaning`)
          try {
            await options.engine.fetchQuietly(model, ({ doneBytes, totalBytes }) => {
              progress = totalBytes > 0 ? Math.min(1, doneBytes / totalBytes) : 0
            })
          } catch (error) {
            failed(error, 'the download', false)
            return
          } finally {
            progress = null
          }

          // A download takes a while: the settings may have changed, and the Ollama in use too.
          const { on, local, lore, recall } = await options.wanted()
          if (!(on || lore || recall) || !local) return
          server = await options.engine.current()
          if (!server) return
        }

        const anchors = anchorList().map((anchor) => anchor.text)
        try {
          // The first question loads the model into memory: it may take a few seconds.
          const built = buildSense(await embedWithOllama(server.url, model, anchors, AbortSignal.timeout(60_000), KEEP_ALIVE))
          sense = built
          worked()
          log(`mood: reading by meaning is ready (${model}, ${anchors.length} anchors, scale ${built.scale.toFixed(3)})`)
        } catch (error) {
          failed(error, 'the first question', true)
        }
      } finally {
        release()
        // Replies come from elsewhere now: the app's own Ollama, kept for the download, has nothing left to do.
        const { local } = await options.wanted().catch(() => ({ local: true }))
        if (!local) await options.engine.rest().catch(() => {})
      }
    })()
      .catch((error: unknown) => failed(error, 'getting ready', false))
      .finally(() => {
        preparing = null
      })
    return preparing
  }

  async function read(text: string, userName?: string): Promise<SenseReading | null> {
    if (!sense) {
      // Asking the model for the first time takes a moment, which is waited for. A download
      // takes minutes: the words answer meanwhile, at once.
      const ready = prepare()
      if (progress !== null) return null
      let told = (): void => {}
      await Promise.race([ready, new Promise<void>((resolve) => waiting.add((told = resolve)))])
      waiting.delete(told)
    }
    const known = sense
    if (!known || Date.now() < retryAt) return null

    const pieces = cutReply(text, userName)
    if (pieces.length === 0) return senseMood(known, [])
    const server = await options.engine.current()
    if (!server) return null
    const release = options.engine.hold()
    try {
      const vectors = await embedWithOllama(server.url, model, pieces.map((piece) => piece.text), AbortSignal.timeout(timeoutMs), KEEP_ALIVE)
      if (failures > 0) worked()
      return senseMood(known, pieces.map((piece, index) => ({ vector: vectors[index]!, place: piece.place })))
    } catch (error) {
      // The model was removed: it is fetched again. Anything else leaves what is known of the moods as it is.
      const gone = error instanceof Error && /not found/i.test(error.message)
      if (gone) sense = null
      failed(error, 'a reading', !gone)
      return null
    } finally {
      release()
    }
  }

  /** True when the settings ask for moods read by meaning, here and now. */
  async function wanted(): Promise<boolean> {
    if (!options.supported || gaveUp) return false
    const { on, local } = await options.wanted()
    return on && local
  }

  /** True when the settings ask for the model for anything, here and now. */
  async function wantedAtAll(): Promise<boolean> {
    if (!options.supported || gaveUp) return false
    const { on, local, lore, recall } = await options.wanted()
    return (on || lore === true || recall === true) && local
  }

  function warm(): void {
    if (sense || preparing) return
    void wantedAtAll()
      .then((yes) => (yes ? prepare() : undefined))
      .catch(() => {})
  }

  async function embed(texts: string[], waitMs: number, use: 'lore' | 'recall' = 'lore'): Promise<number[][] | null> {
    try {
      if (texts.length === 0 || !options.supported || gaveUp) return null
      const asked = await options.wanted()
      if (!asked[use] || !asked.local) return null
      if (!sense) {
        // The first question loads the model: it is waited for, within `waitMs`. A download
        // is not: the keywords answer alone meanwhile.
        const ready = prepare()
        if (progress !== null) return null
        let told = (): void => {}
        await Promise.race([ready, wait(waitMs), new Promise<void>((resolve) => waiting.add((told = resolve)))])
        waiting.delete(told)
      }
      if (!sense || Date.now() < retryAt) return null
      const server = await options.engine.current()
      if (!server) return null
      const release = options.engine.hold()
      try {
        return await embedWithOllama(server.url, model, texts, AbortSignal.timeout(waitMs), KEEP_ALIVE)
      } finally {
        release()
      }
    } catch (error) {
      // Too slow this time is not the model failing: the keywords answer alone, once.
      const late = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      if (!late) failed(error, use === 'lore' ? 'a lorebook question' : 'an old-moments question', false)
      return null
    }
  }

  async function mood(text: string, userName?: string): Promise<MoodReading> {
    const words = detectMood(text, { userName })
    try {
      if (!(await wanted())) return settleMood(words, null)

      const key = `${userName ?? ''}\n${text}`
      const before = remembered.get(key)
      if (before) return before

      // A telling word does not wait for a model that is not ready: it is shown as it is.
      // Once the model is there, it has its say on the word too (see `settleMood`).
      if (words && !sense) {
        void prepare()
        return settleMood(words, null)
      }

      const started = Date.now()
      const keep = (meaning: SenseReading, late: boolean): MoodReading => {
        const settled = settleMood(words, meaning)
        tell(words, meaning, settled.mood, Date.now() - started, late)
        // Only what the model had its say in is kept: a reading by words alone may do better once it is ready.
        remembered.set(key, settled)
        if (remembered.size > REMEMBERED) remembered.delete(remembered.keys().next().value!)
        return settled
      }

      const reading = read(text, userName)
      const meaning = await Promise.race([reading, wait(patienceMs).then(() => 'late' as const)])
      if (meaning === 'late') {
        // Shown without it. When it comes, it is kept: the next look at this reply has it at once.
        void reading.then((late) => late && keep(late, true)).catch(() => {})
        return settleMood(words, null)
      }
      return meaning ? keep(meaning, false) : settleMood(words, null)
    } catch (error) {
      failed(error, 'a reading', false)
      return settleMood(words, null)
    }
  }

  /** One line per reply: the moods and how clear they are, never a word of the reply. */
  function tell(words: Mood | null, meaning: SenseReading, shown: Mood | null, ms: number, late: boolean): void {
    const closest = meaning.best ? `${meaning.best} ${meaning.strength.toFixed(2)}${meaning.next ? `, then ${meaning.next} ${meaning.nextStrength.toFixed(2)}` : ''}` : 'nothing'
    // What the meaning makes of the mood the words told, when it would have said another.
    const trace = words && words !== meaning.best && meaning.strengths[words] !== undefined ? ` (${words} ${meaning.strengths[words]!.toFixed(2)})` : ''
    const outcome = late ? `too late to show: ${shown ?? 'nothing'} kept for the next look` : (shown ?? 'nothing shown')
    log(`mood: words say ${words ?? 'nothing'}, meaning says ${closest}${trace} -> ${outcome} (${ms} ms)`)
  }

  async function status(): Promise<SenseStatus> {
    const info = { model: about.name, bytes: about.bytes }
    const stands = (state: SenseStatus['state'], extra: Partial<SenseStatus> = {}): SenseStatus => ({ state, progress: null, problem: null, ...info, ...extra })

    if (!options.supported) return stands('unsupported')
    const { on, local } = await options.wanted()
    if (!on) return stands('off')
    if (!local) return stands('elsewhere')
    if (gaveUp) return stands('failed', { problem })
    if (progress !== null) return stands('downloading', { progress })
    if (!(await options.engine.current())) return stands('asleep')
    if (sense && !problem) return stands('ready')
    // Between two tries: what went wrong is said, and it is tried again by itself.
    if (problem && Date.now() < retryAt) return stands('failed', { problem })
    // An Ollama runs and the model was not asked yet: now is as good a time as any.
    if (!sense && !preparing) void prepare()
    if (outdated) return stands('failed', { problem: outdated })
    return stands(sense ? 'ready' : 'preparing')
  }

  return { mood, status, warm, embed }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}
