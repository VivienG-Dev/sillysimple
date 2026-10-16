import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createServer as createTcpServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { EngineMissingError } from '@core/engine/errors'
import type { EnginePackage } from '@core/engine/release'
import { ollamaVersion } from '@core/providers/ollama'
import type { EngineStatus } from '@shared/types'
import { createEngine, type Engine, type EngineOptions } from './engine'

// The engine is tried for real: a small web server plays GitHub and hands out an archive,
// which is unpacked with the computer's tar, and the program inside is started and
// stopped as a process. That program is fixtures/fake-ollama.cjs, which answers like
// Ollama. A second copy of it, started by the test, plays the Ollama a user runs themselves.

const FAKE = resolve('src/main/fixtures/fake-ollama.cjs')
const GIB = 2 ** 30
// The fake is a script: these tests need a system that runs one from its first line.
const runnable = process.platform !== 'win32'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'silly-engine-'))
}

async function freePort(): Promise<number> {
  return new Promise((done) => {
    const probe = createTcpServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => done(port))
    })
  })
}

/** An archive holding the fake program, as `ollama` (or `bin/ollama`), and what a download of it looks like. */
function archive(format: 'tgz' | 'tar.zst', binary = 'ollama'): { bytes: Buffer; sha256: string; format: typeof format; binary: string } {
  const folder = scratch()
  mkdirSync(join(folder, 'content', binary, '..'), { recursive: true })
  copyFileSync(FAKE, join(folder, 'content', binary))
  chmodSync(join(folder, 'content', binary), 0o755)
  const made = spawnSync('tar', ['-cf', join(folder, 'engine.tar'), '-C', join(folder, 'content'), '.'])
  expect(made.status).toBe(0)
  const tar = readFileSync(join(folder, 'engine.tar'))
  if (format === 'tgz') spawnSync('gzip', ['-k', join(folder, 'engine.tar')])
  const bytes = format === 'tgz' ? readFileSync(join(folder, 'engine.tar.gz')) : zstdCompressSync(tar)
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), format, binary }
}

interface Downloads {
  url: string
  /** What each request asked for: the Range header, or "" for the whole file. */
  ranges: string[]
}

/** Plays GitHub: serves `bytes`, whole or from where a Range header says. `cutAfter`: the first answer stops there. */
async function downloads(bytes: Buffer, options: { cutAfter?: number } = {}): Promise<Downloads> {
  const ranges: string[] = []
  let cut = options.cutAfter
  const server: Server = createServer((request, response) => {
    const range = request.headers.range ?? ''
    ranges.push(range)
    const from = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
    response.writeHead(from > 0 ? 206 : 200, { 'Content-Length': bytes.length - from })
    if (cut !== undefined) {
      // A connection that drops on the way.
      response.write(bytes.subarray(from, cut))
      cut = undefined
      setTimeout(() => response.destroy(), 20)
      return
    }
    response.end(bytes.subarray(from))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  cleanups.push(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/ollama.tgz`, ranges }
}

/** Starts a copy of the fake as the Ollama a user runs themselves. */
async function yourOllama(models: string, port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [FAKE, 'serve'], { env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_MODELS: models }, stdio: 'ignore' })
  cleanups.push(() => void child.kill('SIGKILL'))
  await until(async () => (await ollamaVersion(`http://127.0.0.1:${port}`)) !== null)
  return child
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Waited too long.')
    await new Promise((done) => setTimeout(done, 25))
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

interface Setup {
  engine: Engine
  folder: string
  /** The models folder the app's own Ollama and the user's share. */
  models: string
  yoursPort: number
  seen: EngineStatus[]
  busy: { now: boolean }
  downloads: Downloads
  /** The process of the app's own Ollama, read from what the fake wrote when it started. */
  ownPid(): number
}

async function setup(
  overrides: Partial<EngineOptions> & { cutAfter?: number; pullMs?: number; format?: 'tgz' | 'tar.zst'; binary?: string; fake?: Record<string, string> } = {},
): Promise<Setup> {
  // `fake`: what the stand-in program is told, on top of the rest.
  const { cutAfter, pullMs, format, binary, fake, ...options } = overrides
  const made = archive(format ?? 'tgz', binary)
  const served = await downloads(made.bytes, { cutAfter })
  const folder = join(scratch(), 'engine')
  const models = scratch()
  const yoursPort = await freePort()
  const ownPort = await freePort()
  const seen: EngineStatus[] = []
  const busy = { now: false }
  const pkg: EnginePackage = { version: '9.9.9', file: 'ollama.tgz', url: served.url, bytes: made.bytes.length, sha256: made.sha256, format: made.format, binary: made.binary }

  const engine = createEngine({
    folder,
    platform: process.platform,
    arch: process.arch,
    memoryBytes: 32 * GIB,
    busy: () => busy.now,
    onChange: (status) => seen.push(status),
    yoursUrl: `http://127.0.0.1:${yoursPort}`,
    package: pkg,
    ownPort,
    watchMs: 40,
    // Whatever room the computer running the tests has left.
    freeSpace: async () => 500e9,
    env: { ...process.env, OLLAMA_MODELS: models, FAKE_PULL_MS: String(pullMs ?? 2), OLLAMA_CONTEXT_LENGTH: '', OLLAMA_KEEP_ALIVE: '', ...fake },
    ...options,
  })
  cleanups.push(() => engine.stop())

  return {
    engine,
    folder,
    models,
    yoursPort,
    seen,
    busy,
    downloads: served,
    ownPid: () => {
      const file = readdirSync(models).find((name) => name.startsWith('started-') && name !== `started-${yoursPort}.json`)
      return file ? (JSON.parse(readFileSync(join(models, file), 'utf8')) as { pid: number }).pid : 0
    },
  }
}

describe('with no Ollama anywhere', () => {
  it('says so, and offers the models this computer can run', async () => {
    const { engine } = await setup()
    const status = await engine.status(true)

    expect(status.state).toBe('missing')
    expect(status.models).toEqual([])
    expect(status.engineBytes).toBeGreaterThan(0)
    // 32 GB: the three sizes, none installed, the largest recommended.
    expect(status.offers.map((offer) => [offer.tier, offer.installed, offer.recommended])).toEqual([
      ['small', false, false],
      ['medium', false, false],
      ['large', false, true],
    ])
    await expect(engine.baseUrl()).rejects.toBeInstanceOf(EngineMissingError)
  })

  it('offers only what fits a small computer, and says how many models are left out', async () => {
    const { engine } = await setup({ memoryBytes: 8 * GIB })
    const status = await engine.status()
    expect(status.offers.map((offer) => offer.tier)).toEqual(['small'])
    expect(status.offers[0]!.recommended).toBe(true)
    expect(status.tooLarge).toBe(2)
  })

  it('has nothing to download for a kind of computer Ollama does not exist for', async () => {
    const { engine } = await setup({ package: null })
    expect((await engine.status()).state).toBe('unsupported')
    await expect(engine.download('gemma4:e2b-it-q4_K_M')).rejects.toThrow(/no Ollama for this kind of computer/)
  })
})

describe.runIf(runnable)("the app's own Ollama", () => {
  it('is downloaded, unpacked and started, then downloads the model that was asked for', async () => {
    const { engine, folder, models, seen, ownPid } = await setup()

    await engine.download('gemma4:12b-it-q4_K_M')

    // Every step was shown, in order, and the job is over at the end.
    const steps = seen.map((status) => status.job?.step).filter((step, index, all) => step !== all[index - 1])
    expect(steps).toEqual(['starting', 'engine', 'unpacking', 'starting', 'model', 'finishing', undefined])
    const engineSteps = seen.filter((status) => status.job?.step === 'engine')
    expect(engineSteps.at(-1)!.job!.doneBytes).toBe(engineSteps.at(-1)!.job!.totalBytes)
    const modelSteps = seen.filter((status) => status.job?.step === 'model')
    expect(modelSteps.at(-1)!.job).toMatchObject({ model: 'gemma4:12b-it-q4_K_M', totalBytes: 5000 })

    const status = await engine.status()
    expect(status.state).toBe('running')
    expect(status.version).toBe('9.9.9')
    expect(status.models.map((model) => model.id)).toEqual(['gemma4:12b-it-q4_K_M'])
    expect(status.offers.find((offer) => offer.tier === 'medium')!.installed).toBe(true)
    expect(status.offers.find((offer) => offer.tier === 'large')!.installed).toBe(false)

    // It answers at the address the app is given, on a port of its own.
    const url = await engine.baseUrl()
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/)
    expect(await ollamaVersion(url)).toBe('9.9.9-fake')

    // What it was started with: a context that suits a roleplay chat on 32 GB, nothing in the cloud.
    const started = JSON.parse(readFileSync(join(models, readdirSync(models).find((name) => name.startsWith('started-'))!), 'utf8'))
    expect(started).toMatchObject({ context: '16384', keepAlive: '30m', noCloud: '1' })
    expect(started.pid).toBe(ownPid())

    // On disk: the unpacked release, marked whole; the download is gone.
    expect(existsSync(join(folder, '9.9.9', '.complete'))).toBe(true)
    expect(readdirSync(folder).some((name) => name.startsWith('download-') || name.endsWith('.unpacking'))).toBe(false)
  })

  it('reads a .tar.zst release too, with the program in a folder of it', async () => {
    const { engine, folder } = await setup({ format: 'tar.zst', binary: 'bin/ollama' })
    await engine.download('gemma4:e2b-it-q4_K_M')
    expect((await engine.status()).state).toBe('running')
    expect(statSync(join(folder, '9.9.9', 'bin', 'ollama')).isFile()).toBe(true)
  })

  it('gives a smaller context to a computer with less memory, and keeps what the user set themselves', async () => {
    const small = await setup({ memoryBytes: 16 * GIB })
    await small.engine.download('gemma4:e2b-it-q4_K_M')
    const read = (models: string): { context: string; keepAlive: string } =>
      JSON.parse(readFileSync(join(models, readdirSync(models).find((name) => name.startsWith('started-'))!), 'utf8'))
    expect(read(small.models).context).toBe('8192')

    const models = scratch()
    const set = await setup({ env: { ...process.env, OLLAMA_MODELS: models, OLLAMA_CONTEXT_LENGTH: '32000', OLLAMA_KEEP_ALIVE: '5m', FAKE_PULL_MS: '1' } })
    await set.engine.download('gemma4:e2b-it-q4_K_M')
    expect(read(models)).toMatchObject({ context: '32000', keepAlive: '5m' })
  })

  it('knows the context it will load a model with before any model is loaded', async () => {
    const large = await setup()
    expect(await large.engine.plannedContext()).toBe(16384)
    await large.engine.download('gemma4:e2b-it-q4_K_M')
    expect(await large.engine.plannedContext()).toBe(16384)

    expect(await (await setup({ memoryBytes: 16 * GIB })).engine.plannedContext()).toBe(8192)
    const set = await setup({ env: { ...process.env, OLLAMA_CONTEXT_LENGTH: '32000' } })
    expect(await set.engine.plannedContext()).toBe(32000)
  })

  it('loads models with the size set by hand, and starts again with a new one once nothing is under way', async () => {
    const chosen = { size: 32768 as number | null }
    const { engine, models, busy } = await setup({ chosenContext: async () => chosen.size })
    await engine.download('gemma4:e2b-it-q4_K_M')
    const started = (): { context: string; pid: number }[] =>
      readdirSync(models)
        .filter((name) => name.startsWith('started-'))
        .map((name) => JSON.parse(readFileSync(join(models, name), 'utf8')))
    expect(started().map((item) => item.context)).toEqual(['32768'])
    expect(await engine.plannedContext()).toBe(32768)

    // The same size: nothing to do.
    const first = started()[0]!.pid
    await engine.contextChanged()
    expect(isRunning(first)).toBe(true)

    // Another size while a reply is being written: it waits for the reply to end.
    chosen.size = 8192
    busy.now = true
    const changing = engine.contextChanged()
    await new Promise((done) => setTimeout(done, 300))
    expect(isRunning(first)).toBe(true)
    busy.now = false
    await changing
    await until(() => !isRunning(first))

    // The next request starts it again, with the new size.
    await engine.baseUrl()
    expect(started().map((item) => item.context)).toEqual(['8192'])
    expect(await engine.plannedContext()).toBe(8192)

    // Back to automatic: what suits 32 GB.
    chosen.size = null
    await engine.contextChanged()
    await engine.baseUrl()
    expect(started().map((item) => item.context)).toEqual(['16384'])
  })

  it('goes on from where a download stopped', async () => {
    const { engine, downloads: served } = await setup({ cutAfter: 700 })

    await expect(engine.download('gemma4:e2b-it-q4_K_M')).rejects.toThrow(/Check your internet connection/)
    expect((await engine.status()).state).toBe('missing')

    await engine.download('gemma4:e2b-it-q4_K_M')
    expect((await engine.status()).state).toBe('running')
    // The second request asked for the rest only.
    expect(served.ranges).toEqual(['', 'bytes=700-'])
  })

  it('throws away a download that is not the release it expects', async () => {
    const made = archive('tgz')
    const served = await downloads(made.bytes)
    const { engine, folder } = await setup({
      package: { version: '9.9.9', file: 'ollama.tgz', url: served.url, bytes: made.bytes.length, sha256: 'f'.repeat(64), format: 'tgz', binary: 'ollama' },
    })

    await expect(engine.download('gemma4:e2b-it-q4_K_M')).rejects.toThrow(/arrived damaged/)
    expect((await engine.status()).state).toBe('missing')
    expect(readdirSync(folder)).toEqual([])
  })

  it('stops with the app, and starts again when it is needed', async () => {
    const { engine, ownPid } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    const first = ownPid()
    expect(isRunning(first)).toBe(true)

    await engine.stop()
    expect(isRunning(first)).toBe(false)
    expect((await engine.status()).state).toBe('stopped')
    // Looking at the status does not start it; needing it does.
    expect(isRunning(ownPid())).toBe(false)

    expect(await ollamaVersion(await engine.baseUrl())).toBe('9.9.9-fake')
    expect(ownPid()).not.toBe(first)
    expect((await engine.status()).state).toBe('running')
  })

  it('is asked to end at once when the app quits', async () => {
    const { engine, ownPid } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    const pid = ownPid()

    engine.stopNow()
    await until(() => !isRunning(pid))
  })

  it('is put to rest when replies come from elsewhere, but not in the middle of a download', async () => {
    const { engine, seen, ownPid } = await setup({ pullMs: 40 })
    await engine.download('gemma4:e2b-it-q4_K_M')
    const pid = ownPid()

    // A second model is on its way when the user picks an online service to chat meanwhile.
    const download = engine.download('gemma4:26b-a4b-it-q4_K_M')
    await until(() => seen.some((status) => status.job?.model === 'gemma4:26b-a4b-it-q4_K_M' && status.job.step === 'model'))
    await engine.rest()
    expect(isRunning(pid)).toBe(true)
    await download
    expect((await engine.status()).models).toHaveLength(2)

    await engine.rest()
    expect(isRunning(pid)).toBe(false)
    expect(seen.at(-1)!.state).toBe('stopped')
  })

  it('is started once, however many things need it at the same time', async () => {
    const { engine, models } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    await engine.stop()
    for (const name of readdirSync(models)) if (name.startsWith('started-')) writeFileSync(join(models, name), '{}')

    const urls = await Promise.all([engine.baseUrl(), engine.baseUrl(), engine.status(true).then(() => engine.baseUrl())])
    expect(new Set(urls).size).toBe(1)
    expect(readdirSync(models).filter((name) => name.startsWith('started-'))).toHaveLength(1)
  })

  it('is started again if it ended by itself', async () => {
    const { engine, ownPid } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    const first = ownPid()

    process.kill(first, 'SIGKILL')
    await until(async () => (await engine.status()).state === 'stopped')

    await engine.baseUrl()
    expect(ownPid()).not.toBe(first)
  })

  it('ends the one an app closed badly left running, and starts a fresh one', async () => {
    const first = await setup()
    await first.engine.download('gemma4:e2b-it-q4_K_M')
    const left = first.ownPid()
    expect(isRunning(left)).toBe(true)

    // The app starts again on the same folder, knowing nothing of the process still there.
    const again = createEngine({
      folder: first.folder,
      platform: process.platform,
      arch: process.arch,
      memoryBytes: 32 * GIB,
      busy: () => false,
      onChange: () => {},
      yoursUrl: `http://127.0.0.1:${first.yoursPort}`,
      package: null,
      ownPort: await freePort(),
      env: { ...process.env, OLLAMA_MODELS: first.models },
    })
    cleanups.push(() => again.stop())

    expect(await ollamaVersion(await again.baseUrl())).toBe('9.9.9-fake')
    // Never two: the old one is gone, and the one that answers is new.
    expect(isRunning(left)).toBe(false)
    const pids = readdirSync(first.models)
      .filter((name) => name.startsWith('started-'))
      .map((name) => (JSON.parse(readFileSync(join(first.models, name), 'utf8')) as { pid: number }).pid)
    expect(pids.filter(isRunning)).toHaveLength(1)
  })

  it('leaves nothing behind when the app quits while it is still starting', async () => {
    const { engine } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    await engine.stop()

    const slow = await setup({ fake: { FAKE_START_MS: '600' } })
    await slow.engine.download('gemma4:e2b-it-q4_K_M')
    await slow.engine.stop()

    // Started, not answering yet: the app quits.
    const wanted = slow.engine.baseUrl()
    await new Promise((done) => setTimeout(done, 200))
    const started = spawnSync('pgrep', ['-f', `${slow.folder}/9.9.9/ollama serve`]).stdout.toString().trim().split('\n').filter(Boolean).map(Number)
    expect(started).toHaveLength(1)
    slow.engine.stopNow()

    await expect(wanted).rejects.toMatchObject({ name: 'AbortError' })
    await until(() => !isRunning(started[0]!))
    // Stopped on purpose: nothing to report as a failure.
    expect((await slow.engine.status()).problem).toBeNull()
  })

  it('can be stopped while it is still starting, and started again afterwards', async () => {
    const { engine, ownPid } = await setup({ fake: { FAKE_START_MS: '400' } })
    await engine.download('gemma4:e2b-it-q4_K_M')
    const first = ownPid()
    expect(first).toBeGreaterThan(0)
    await engine.stop()
    expect(isRunning(first)).toBe(false)

    const wanted = engine.baseUrl()
    await new Promise((done) => setTimeout(done, 150))
    await engine.stop()
    await expect(wanted).rejects.toMatchObject({ name: 'AbortError' })

    expect(await ollamaVersion(await engine.baseUrl())).toBe('9.9.9-fake')
  })

  it('says why when it cannot start', async () => {
    const { engine } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    await engine.stop()

    const broken = await setup({ fake: { FAKE_FAIL: '1' } })
    await expect(broken.engine.download('gemma4:e2b-it-q4_K_M')).rejects.toThrow(/could not start: .*address already in use/)
    const status = await broken.engine.status(true)
    expect(status.job).toBeNull()
    // The page is told too: an installed engine with an empty list would explain nothing.
    expect(status.state).toBe('stopped')
    expect(status.problem).toMatch(/could not start: .*address already in use/)
  })
})

describe.runIf(runnable)("the app's own Ollama, for the small model only", () => {
  it('is downloaded without a word to the page, then started by wake', async () => {
    const { engine, folder, seen } = await setup()
    expect(await engine.missingBytes()).toBeGreaterThan(0)
    // Nothing to start yet, and wake never downloads.
    expect(await engine.wake()).toBeNull()

    const fractions: number[] = []
    await engine.installQuietly((fraction) => fractions.push(fraction))
    expect(fractions.at(-1)).toBe(1)
    expect(existsSync(join(folder, '9.9.9', '.complete'))).toBe(true)
    expect(await engine.missingBytes()).toBe(0)
    // The page saw no download of its own.
    expect(seen.some((status) => status.job !== null)).toBe(false)

    const server = await engine.wake()
    expect(server?.version).toBe('9.9.9-fake')
    expect((await engine.status()).state).toBe('running')
  })

  it("downloads nothing when the user's Ollama answers", async () => {
    const { engine, folder, models, yoursPort } = await setup()
    await yourOllama(models, yoursPort)
    expect(await engine.missingBytes()).toBe(0)
    await engine.installQuietly()
    expect(existsSync(join(folder, '9.9.9'))).toBe(false)
    expect((await engine.wake())?.url).toBe(`http://127.0.0.1:${yoursPort}`)
  })
})

describe.runIf(runnable)('downloading a model', () => {
  it('can be stopped, and leaves nothing half done', async () => {
    const { engine, seen } = await setup({ pullMs: 60 })
    const download = engine.download('gemma4:26b-a4b-it-q4_K_M')
    await until(() => seen.some((status) => status.job?.step === 'model' && status.job.doneBytes > 0))

    engine.cancel()
    await expect(download).rejects.toMatchObject({ name: 'AbortError' })

    const status = await engine.status()
    expect(status.job).toBeNull()
    expect(status.models).toEqual([])
    // The engine itself stays: only the model was stopped.
    expect(status.state).toBe('running')
  })

  it('can be stopped while the engine itself is still coming', async () => {
    const { engine, folder } = await setup({ cutAfter: 50 })
    // The first try leaves a piece of the download behind; the second is stopped at once.
    await expect(engine.download('gemma4:e2b-it-q4_K_M')).rejects.toThrow()
    const download = engine.download('gemma4:e2b-it-q4_K_M')
    engine.cancel()
    await expect(download).rejects.toMatchObject({ name: 'AbortError' })
    expect((await engine.status()).state).toBe('missing')
    expect(existsSync(join(folder, '9.9.9'))).toBe(false)
  })

  it('refuses a second one while the first is under way', async () => {
    const { engine } = await setup({ pullMs: 30 })
    const first = engine.download('gemma4:e2b-it-q4_K_M')
    await expect(engine.download('gemma4:12b-it-q4_K_M')).rejects.toThrow(/Another download/)
    await first
  })

  it('explains a name Ollama does not know, and a library that cannot be reached', async () => {
    const { engine } = await setup()
    await expect(engine.download('nothing:here')).rejects.toThrow(/no model called “nothing:here”/)
    await expect(engine.download('no:network')).rejects.toThrow(/library could not be reached/)
    expect((await engine.status()).job).toBeNull()
  })

  it('refuses a download the disk has no room for, with the numbers, before anything is fetched', async () => {
    // Room for the engine, not for an 18 GB model.
    const { engine, seen } = await setup({ freeSpace: async () => 6e9 })
    await expect(engine.download('gemma4:26b-a4b-it-q4_K_M')).rejects.toThrow('This model takes about 18.0 GB and the disk has 6.0 GB free.')
    expect(seen.some((status) => status.job?.step === 'model' && status.job.doneBytes > 0)).toBe(false)
    // The small one fits. A model the app does not know the size of is left to Ollama.
    await engine.download('gemma4:e2b-it-q4_K_M')
    await engine.download('someone/other:7b')
    expect((await engine.status()).models).toHaveLength(2)
  })

  it('refuses to fetch the engine when the disk has no room to unpack it', async () => {
    const { engine, downloads: served } = await setup({ freeSpace: async () => 1000 })
    await expect(engine.download('gemma4:e2b-it-q4_K_M')).rejects.toThrow(/Installing the model engine takes about .* and the disk has .* free/)
    expect(served.ranges).toEqual([])
    expect((await engine.status()).state).toBe('missing')
  })

  it('removes a model from the disk', async () => {
    const { engine } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    await engine.download('someone/other:7b')
    expect((await engine.status()).models).toHaveLength(2)

    await engine.remove('gemma4:e2b-it-q4_K_M')
    const status = await engine.status()
    expect(status.models.map((model) => model.id)).toEqual(['someone/other:7b'])
    expect(status.offers.find((offer) => offer.tier === 'small')!.installed).toBe(false)
    // Removing what is not there is not a failure.
    await engine.remove('gemma4:e2b-it-q4_K_M')
  })
})

describe.runIf(runnable)('when the user runs an Ollama of their own', () => {
  it("uses theirs and never starts the app's own", async () => {
    const { engine, folder, models, yoursPort, downloads: served } = await setup()
    await yourOllama(models, yoursPort)

    expect((await engine.status()).state).toBe('yours')
    expect(await engine.baseUrl()).toBe(`http://127.0.0.1:${yoursPort}/v1`)

    // A model is downloaded through theirs: no engine is fetched for that.
    await engine.download('gemma4:12b-it-q4_K_M')
    const status = await engine.status()
    expect(status.state).toBe('yours')
    expect(status.version).toBe('9.9.9-fake')
    expect(status.models.map((model) => model.id)).toEqual(['gemma4:12b-it-q4_K_M'])
    expect(served.ranges).toEqual([])
    expect(existsSync(folder)).toBe(false)

    // What theirs loads a model with is their setting: the app does not guess it.
    expect(await engine.plannedContext()).toBeNull()
  })

  it("stops the app's own as soon as theirs starts, so that there are never two", async () => {
    const { engine, models, yoursPort, seen, ownPid } = await setup()
    await engine.download('gemma4:12b-it-q4_K_M')
    const own = ownPid()
    const ownUrl = await engine.baseUrl()
    expect(isRunning(own)).toBe(true)

    // The user opens Ollama while the app is running.
    await yourOllama(models, yoursPort)
    await until(() => !isRunning(own))

    // The app was told, and now talks to theirs. The model is there too: same folder.
    await until(() => seen.at(-1)?.state === 'yours')
    expect(await engine.baseUrl()).toBe(`http://127.0.0.1:${yoursPort}/v1`)
    expect(await ollamaVersion(ownUrl)).toBeNull()
    expect((await engine.status()).models.map((model) => model.id)).toEqual(['gemma4:12b-it-q4_K_M'])
  })

  it('waits for the reply being written to end before stopping its own', async () => {
    const { engine, models, yoursPort, busy, ownPid } = await setup()
    await engine.download('gemma4:12b-it-q4_K_M')
    const own = ownPid()
    const ownUrl = await engine.baseUrl()

    busy.now = true
    await yourOllama(models, yoursPort)
    await new Promise((done) => setTimeout(done, 250))
    // Still there, and still the one in use: the reply is not cut.
    expect(isRunning(own)).toBe(true)
    expect(await engine.baseUrl()).toBe(ownUrl)

    busy.now = false
    await until(() => !isRunning(own))
    expect(await engine.baseUrl()).toBe(`http://127.0.0.1:${yoursPort}/v1`)
  })

  it('does not stop its own in the middle of a download', async () => {
    const { engine, models, yoursPort, seen, ownPid } = await setup({ pullMs: 40 })
    await engine.download('gemma4:e2b-it-q4_K_M')
    const own = ownPid()

    const download = engine.download('gemma4:26b-a4b-it-q4_K_M')
    await until(() => seen.some((status) => status.job?.model === 'gemma4:26b-a4b-it-q4_K_M' && status.job.step === 'model'))
    await yourOllama(models, yoursPort)
    await download
    // Asked while one Ollama hands over to the other, the list may lag a moment (see below).
    await until(async () => (await engine.status()).models.length === 2)

    // Once the download is over, theirs takes over.
    await until(() => !isRunning(own))
  })

  it('does not stop its own under a download the page is not told about', async () => {
    // Long enough for the user's Ollama to start, and be seen, while it is still under way.
    const { engine, models, yoursPort, seen, ownPid } = await setup({ pullMs: 150 })
    await engine.download('gemma4:e2b-it-q4_K_M')
    const own = ownPid()
    const told = seen.length

    const progress: number[] = []
    const quiet = engine.fetchQuietly('embeddinggemma-2:270m-nvfp4-text', ({ doneBytes }) => progress.push(doneBytes))
    await until(() => progress.length > 2)
    await yourOllama(models, yoursPort)
    await new Promise((done) => setTimeout(done, 150))
    expect(isRunning(own)).toBe(true)
    await quiet

    // The page never saw a download: no job, in any status it was sent.
    expect(seen.slice(told).every((status) => status.job === null)).toBe(true)
    // Asked while one Ollama hands over to the other, the answer may lag a moment: the model is
    // in the shared folder, and it is said so once the Ollama in use answers.
    await until(() => engine.has('embeddinggemma-2:270m-nvfp4-text'))
    // Once it is over, theirs takes over.
    await until(() => !isRunning(own))
  })

  it('does not stop its own while it is held for a few questions', async () => {
    const { engine, models, yoursPort, ownPid } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    const own = ownPid()

    const release = engine.hold()
    const other = engine.hold()
    await yourOllama(models, yoursPort)
    await new Promise((done) => setTimeout(done, 250))
    expect(isRunning(own)).toBe(true)
    release()
    release() // Letting go twice lets go once.
    await new Promise((done) => setTimeout(done, 150))
    expect(isRunning(own)).toBe(true)

    other()
    await until(() => !isRunning(own))
  })

  it('stops a download the page is not told about when the app stops', async () => {
    const { engine } = await setup({ pullMs: 150 })
    await engine.download('gemma4:e2b-it-q4_K_M')

    let seen = 0
    const quiet = engine.fetchQuietly('embeddinggemma-2:270m-nvfp4-text', () => seen++)
    const outcome = quiet.then(() => 'done', (error: Error) => error.name)
    await until(() => seen > 1)
    await engine.stop()
    expect(await outcome).toBe('AbortError')
  })

  it('lists chat models only: one that turns text into numbers cannot write a reply', async () => {
    const { engine, models, yoursPort } = await setup()
    await yourOllama(models, yoursPort)
    expect(await engine.current()).toEqual({ url: `http://127.0.0.1:${yoursPort}`, version: '9.9.9-fake' })
    await engine.download('gemma4:12b-it-q4_K_M')
    await engine.fetchQuietly('embeddinggemma-2:270m-nvfp4-text')
    await engine.fetchQuietly('nomic-embed-text')

    expect((await engine.status()).models.map((model) => model.id)).toEqual(['gemma4:12b-it-q4_K_M'])
    expect(await engine.has('nomic-embed-text:latest')).toBe(true)
    expect(await engine.has('gemma4:26b-a4b-it-q4_K_M')).toBe(false)
  })

  it('does nothing quietly when no Ollama runs: it never starts one for that', async () => {
    const { engine } = await setup()
    await engine.download('gemma4:e2b-it-q4_K_M')
    await engine.stop()

    expect(await engine.current()).toBeNull()
    expect(await engine.has('gemma4:e2b-it-q4_K_M')).toBe(false)
    await expect(engine.fetchQuietly('embeddinggemma-2:270m-nvfp4-text')).rejects.toThrow()
    expect((await engine.status()).state).toBe('stopped')
  })

  it("goes back to the app's own when theirs is closed", async () => {
    const { engine, models, yoursPort, ownPid } = await setup()
    await engine.download('gemma4:12b-it-q4_K_M')
    const first = ownPid()
    const theirs = await yourOllama(models, yoursPort)
    await until(() => !isRunning(first))

    theirs.kill('SIGKILL')
    await until(async () => (await ollamaVersion(`http://127.0.0.1:${yoursPort}`)) === null)
    await until(async () => (await engine.status()).state === 'stopped')

    const url = await engine.baseUrl()
    expect(url).not.toBe(`http://127.0.0.1:${yoursPort}/v1`)
    expect(await ollamaVersion(url)).toBe('9.9.9-fake')
    expect((await engine.status()).state).toBe('running')
  })
})
