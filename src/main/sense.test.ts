import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SENSE_MODEL } from '@core/engine/models'
import { ollamaVersion } from '@core/providers/ollama'
import { createEngine, type Engine } from './engine'
import { createSense, type SenseService } from './sense'

// Reading the mood by meaning, tried with a real process that answers like Ollama
// (fixtures/fake-ollama.cjs): its "embedding model" knows a few telling words, no more.
// It plays the Ollama a user runs themselves, which is the simplest way to have one.

const FAKE = resolve('src/main/fixtures/fake-ollama.cjs')
const MODEL = SENSE_MODEL.id

/** No word of the lists in it; the stand-in model knows "warmth" and "devotion". */
const FOND = '*She gazes at him with such warmth and devotion.* "There you are."'
const PLAIN = '"The harbour is two streets down. Turn left at the fountain."'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function freePort(): Promise<number> {
  return new Promise((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => done(port))
    })
  })
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Waited too long.')
    await new Promise((done) => setTimeout(done, 20))
  }
}

/** Waits for the model to be there and asked: what the first reply sets off. */
async function ready(sense: SenseService): Promise<void> {
  await until(async () => (await sense.status()).state === 'ready')
}

interface Setup {
  sense: SenseService
  engine: Engine
  lines: string[]
  /** What the settings say; a test changes it as a user would. */
  wanted: { on: boolean; local: boolean }
  /** How many times the engine was told replies come from elsewhere. */
  rests: { count: number }
}

/** `ollama`: false for a computer where none runs; otherwise what the stand-in is told. */
async function setup(
  options: { ollama?: Record<string, string> | false; supported?: boolean; patienceMs?: number; timeoutMs?: number; retryMs?: number } = {},
): Promise<Setup> {
  const port = await freePort()
  if (options.ollama !== false) {
    const models = mkdtempSync(join(tmpdir(), 'silly-sense-'))
    const child = spawn(process.execPath, [FAKE, 'serve'], {
      env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_MODELS: models, FAKE_PULL_MS: '2', ...options.ollama },
      stdio: 'ignore',
    })
    cleanups.push(() => void child.kill('SIGKILL'))
    await until(async () => (await ollamaVersion(`http://127.0.0.1:${port}`)) !== null)
  }

  const engine = createEngine({
    folder: join(mkdtempSync(join(tmpdir(), 'silly-sense-')), 'engine'),
    platform: process.platform,
    arch: process.arch,
    memoryBytes: 16 * 2 ** 30,
    busy: () => false,
    onChange: () => {},
    yoursUrl: `http://127.0.0.1:${port}`,
    package: null,
  })
  cleanups.push(() => engine.stop())

  const lines: string[] = []
  const wanted = { on: true, local: true }
  const rests = { count: 0 }
  const sense = createSense({
    engine: {
      ...engine,
      rest: () => {
        rests.count++
        return engine.rest()
      },
    },
    supported: options.supported ?? true,
    wanted: async () => ({ ...wanted }),
    log: (line) => lines.push(line),
    patienceMs: options.patienceMs,
    timeoutMs: options.timeoutMs,
    retryMs: options.retryMs,
  })
  return { sense, engine, lines, wanted, rests }
}

describe('the mood of a reply, with the model for it', () => {
  it('gets the model by itself the first time, then reads what the words do not say', async () => {
    const { sense, engine, lines } = await setup()
    expect(await engine.has(MODEL)).toBe(false)

    // The first reply sets the download off and is read by words: nothing waits for a download.
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
    await ready(sense)
    expect(await sense.mood(FOND)).toEqual({ mood: 'love', by: 'meaning' })
    expect(await engine.has(MODEL)).toBe(true)
    expect(lines.some((line) => line.includes('downloading') && line.includes(MODEL))).toBe(true)
    expect(lines.some((line) => line.includes('is ready'))).toBe(true)

    // The model is no chat model: it is not offered as one.
    expect((await engine.status()).models).toEqual([])
  })

  it('believes a telling word first, and shows nothing for a reply that shows no feeling', async () => {
    const { sense } = await setup()
    expect(await sense.mood('*Mara blushes and looks away.* "I... I did not mean it like that."')).toEqual({ mood: 'shy', by: 'words' })
    expect(await sense.mood(PLAIN)).toEqual({ mood: null, by: null })
    expect(await sense.mood('')).toEqual({ mood: null, by: null })
  })

  it('drops a mood a word told when no sentence of the character shows it: it was the user\'s', async () => {
    const { sense, lines } = await setup()
    const reply = '*You burst into tears, and she hands you a handkerchief without a word.* "The carriage leaves in ten minutes."'
    // Without the model the word stands: the lists look one word back, and miss "You".
    expect(await sense.mood(reply)).toEqual({ mood: 'sad', by: 'words' })
    await ready(sense)
    expect(await sense.mood(reply)).toEqual({ mood: null, by: null })
    expect(lines.some((line) => /words say sad, meaning says .* \(sad -\d+\.\d+\) -> nothing shown/.test(line))).toBe(true)
    // A word the meaning agrees with is shown as before.
    expect(await sense.mood('*She cries quietly, tears running down her cheeks.* "He promised."')).toEqual({ mood: 'sad', by: 'words' })
  })

  it('does not count what is told of the user', async () => {
    const { sense } = await setup()
    await ready(sense)
    expect((await sense.mood('*Ren gazes at her with warmth and devotion.* *She counts the crates and writes the numbers down.*', 'Ren')).mood).toBeNull()
    expect((await sense.mood('*Ren gazes at her with warmth and devotion.* *She counts the crates and writes the numbers down.*')).mood).toBe('love')
  })

  it('logs what each said, without the text of the reply', async () => {
    const { sense, lines } = await setup()
    await ready(sense)
    await sense.mood(FOND)
    const line = lines.find((item) => item.includes('meaning says'))
    expect(line).toMatch(/words say nothing, meaning says love \d+\.\d+.* -> love \(\d+ ms\)/)
    expect(lines.join('\n')).not.toContain('gazes')
  })

  it('asks the model once for the same reply', async () => {
    const { sense, lines } = await setup()
    await ready(sense)
    await sense.mood(FOND)
    await sense.mood(FOND)
    expect(lines.filter((line) => line.includes('meaning says'))).toHaveLength(1)
  })
})

describe('where the model cannot be of use', () => {
  it('reads the words alone on a computer that cannot run it, and downloads nothing', async () => {
    const { sense, engine } = await setup({ supported: false })
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
    expect(await sense.mood('*She sighs.*')).toEqual({ mood: 'sigh', by: 'words' })
    expect((await sense.status()).state).toBe('unsupported')
    expect(await engine.has(MODEL)).toBe(false)
  })

  it('follows the settings: off, or replies that come from elsewhere', async () => {
    const { sense, engine, wanted } = await setup()
    wanted.on = false
    expect((await sense.status()).state).toBe('off')
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })

    wanted.on = true
    wanted.local = false
    expect((await sense.status()).state).toBe('elsewhere')
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
    expect(await engine.has(MODEL)).toBe(false)

    wanted.local = true
    await ready(sense)
    expect((await sense.mood(FOND)).mood).toBe('love')
  })

  it('is asleep while no Ollama runs, and reads the words meanwhile', async () => {
    // That it starts none is the engine's doing: what it is given of it cannot (see engine.test.ts).
    const { sense, lines } = await setup({ ollama: false })
    expect((await sense.status()).state).toBe('asleep')
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
    expect(await sense.mood('*She sighs.*')).toEqual({ mood: 'sigh', by: 'words' })
    expect(lines).toEqual([])
  })

  it('stops reading by meaning as soon as the setting is turned off, even a reply it read before', async () => {
    const { sense, wanted } = await setup()
    await ready(sense)
    expect(await sense.mood(FOND)).toEqual({ mood: 'love', by: 'meaning' })
    wanted.on = false
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
  })

  it('lets the engine rest when replies start coming from elsewhere during the download', async () => {
    const { sense, engine, lines, wanted, rests } = await setup({ ollama: { FAKE_PULL_MS: '60' } })
    await sense.mood(FOND)
    await until(async () => (await sense.status()).state === 'downloading')
    wanted.local = false
    await until(() => engine.has(MODEL))
    await until(() => rests.count > 0)
    // The model was not loaded for nothing either.
    expect(lines.some((line) => line.includes('is ready'))).toBe(false)
    expect((await sense.status()).state).toBe('elsewhere')
  })

  it('says so when the Ollama that runs is too old for the model', async () => {
    const { sense, engine } = await setup({ ollama: { FAKE_VERSION: '0.39.2' } })
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
    const status = await sense.status()
    expect(status.state).toBe('failed')
    expect(status.problem).toContain('0.40.0')
    expect(status.problem).toContain('0.39.2')
    expect(await engine.has(MODEL)).toBe(false)
  })
})

describe('when it takes time, or fails', () => {
  it('does not make a reply wait for a download: the words answer meanwhile', async () => {
    const { sense } = await setup({ ollama: { FAKE_PULL_MS: '40' }, patienceMs: 60 })
    const started = Date.now()
    expect(await sense.mood('*She sighs.* "Fine."')).toEqual({ mood: 'sigh', by: 'words' })
    expect(Date.now() - started).toBeLessThan(400)

    await until(async () => (await sense.status()).state === 'downloading')
    const status = await sense.status()
    expect(status.progress).toBeGreaterThanOrEqual(0)
    expect(status).toMatchObject({ model: 'EmbeddingGemma 2', bytes: 378e6 })

    await until(async () => (await sense.status()).state === 'ready')
    // What was read by words alone meanwhile is read again, by meaning this time.
    expect(await sense.mood(FOND)).toEqual({ mood: 'love', by: 'meaning' })
  })

  it('does not wait for the download even once, however long a reading may take', async () => {
    // The usual patience of four seconds, and a download that takes about three.
    const { sense } = await setup({ ollama: { FAKE_PULL_MS: '250' } })
    for (const reply of [FOND, `${FOND} "Sit."`]) {
      const started = Date.now()
      expect(await sense.mood(reply)).toEqual({ mood: null, by: null })
      expect(Date.now() - started).toBeLessThan(700)
    }
    expect((await sense.status()).state).toBe('downloading')
    await until(async () => (await sense.status()).state === 'ready', 8000)
    expect((await sense.mood(FOND)).mood).toBe('love')
  })

  it('gets ready when the settings page looks, before any reply', async () => {
    const { sense, engine } = await setup()
    expect(['preparing', 'downloading']).toContain((await sense.status()).state)
    await until(async () => (await sense.status()).state === 'ready')
    expect(await engine.has(MODEL)).toBe(true)
  })

  it('does not show a mood late: past its patience the words answer, and the reading is kept for the next look', async () => {
    const { sense, lines } = await setup({ ollama: { FAKE_EMBED_MS: '400' }, patienceMs: 80 })
    await ready(sense)

    let started = Date.now()
    expect(await sense.mood('*She sighs.* "Whatever. I give up."')).toEqual({ mood: 'sigh', by: 'words' })
    expect(Date.now() - started).toBeLessThan(300)
    started = Date.now()
    expect(await sense.mood(FOND)).toEqual({ mood: null, by: null })
    expect(Date.now() - started).toBeLessThan(300)

    // The model answers in the end: it is said, with the time it took, and kept.
    await until(() => lines.filter((line) => line.includes('too late to show')).length === 2)
    expect(lines.some((line) => /words say nothing, meaning says love .* -> too late to show: love kept for the next look \(\d{3,} ms\)/.test(line))).toBe(true)
    started = Date.now()
    expect(await sense.mood(FOND)).toEqual({ mood: 'love', by: 'meaning' })
    expect(Date.now() - started).toBeLessThan(50)
  })

  it('gives up a question the model does not answer, and keeps what it knows of the moods', async () => {
    const { sense, lines } = await setup({ ollama: { FAKE_EMBED_MS: '600' }, patienceMs: 50, timeoutMs: 150, retryMs: 5 })
    await ready(sense)
    for (const reply of [FOND, `${FOND} "Sit."`]) {
      expect(await sense.mood(reply)).toEqual({ mood: null, by: null })
      await until(() => lines.filter((line) => line.includes('a reading failed')).length >= (reply === FOND ? 1 : 2))
      // After a failure it leaves the model alone for a moment (5 ms here).
      await new Promise((done) => setTimeout(done, 30))
    }
    // It is said, and the anchors were asked for once: a slow answer is not a model that is gone.
    expect(lines.filter((line) => line.includes('a reading failed') && line.includes('took more than'))).toHaveLength(2)
    expect(lines.filter((line) => line.includes('is ready'))).toHaveLength(1)
  })

  it('gets ready while a reply is written, so that its mood is read the moment it ends', async () => {
    const { sense, engine, wanted } = await setup()
    wanted.on = false
    sense.warm()
    await new Promise((done) => setTimeout(done, 150))
    expect(await engine.has(MODEL)).toBe(false) // Not wanted: nothing is fetched.

    wanted.on = true
    sense.warm()
    sense.warm()
    await ready(sense)
    const started = Date.now()
    expect(await sense.mood(FOND)).toEqual({ mood: 'love', by: 'meaning' })
    expect(Date.now() - started).toBeLessThan(300)
  })

  it('tries a download that failed again later, without ever giving up on it', async () => {
    // Four downloads fail, as with no network: more than the failures it gives up after.
    const { sense, lines } = await setup({ ollama: { FAKE_PULL_FAILS: '4' }, retryMs: 60 })
    await sense.mood(FOND)
    // Between two tries it says what is wrong.
    let between = await sense.status()
    await until(async () => (between = await sense.status()).state === 'failed')
    expect(between.problem).toContain('model library could not be reached')

    // The settings page looks every other second; here, as fast as it can.
    await ready(sense)
    expect(lines.filter((line) => line.includes('the download failed'))).toHaveLength(4)
    expect(lines.some((line) => line.includes('Left alone'))).toBe(false)
    expect((await sense.mood(FOND)).mood).toBe('love')
  })

  it('gets the model again if it was removed', async () => {
    const { sense, engine } = await setup({ retryMs: 10 })
    await ready(sense)
    expect((await sense.mood(FOND)).mood).toBe('love')
    await engine.remove(MODEL)

    // The first reply after that is read by words; the model is back for the next.
    expect(await sense.mood('"Whatever. My patience is running out with all of this."')).toEqual({ mood: null, by: null })
    await until(async () => (await sense.mood('"Whatever. My patience ran out long ago with all of this."')).by === 'meaning')
    expect(await engine.has(MODEL)).toBe(true)
  })

  it('gives up for this run after a few questions the model cannot answer, and says why', async () => {
    const { sense, lines } = await setup({ ollama: { FAKE_EMBED_FAIL: '1' }, retryMs: 5 })
    let replies = 0
    await until(async () => {
      expect(await sense.mood(`${FOND} ${replies++}`)).toEqual({ mood: null, by: null })
      return lines.some((line) => line.includes('Left alone'))
    })

    // Between two tries it already says what is wrong; after the third it stays that way.
    await new Promise((done) => setTimeout(done, 60))
    const status = await sense.status()
    expect(status.state).toBe('failed')
    expect(status.problem).toContain('mlx runner is not available')
    expect(lines.filter((line) => line.includes('failed'))).toHaveLength(3)
    // And the words still work.
    expect(await sense.mood('*She laughs.*')).toEqual({ mood: 'joy', by: 'words' })
  })
})
