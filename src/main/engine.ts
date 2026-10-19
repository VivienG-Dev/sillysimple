import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, rmSync } from 'node:fs'
import { chmod, mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createZstdDecompress } from 'node:zlib'
import { describeEngineDownloadError, describePullError, EngineMissingError, isAbort } from '@core/engine/errors'
import { builtinModelBytes, engineContextLength, isEmbeddingModel, offersFor } from '@core/engine/models'
import { compareVersions, enginePackage, type EnginePackage } from '@core/engine/release'
import { deleteOllamaModel, listOllamaModels, ollamaVersion, pullOllamaModel, sameOllamaModel, type PullProgress } from '@core/providers/ollama'
import type { EngineJob, EngineState, EngineStatus, GraphicsCard, ModelInfo } from '@shared/types'

// "On this computer": replies come from Ollama, and there is only ever one.
//
//   - When the user runs an Ollama of their own (it answers at 127.0.0.1:11434), the
//     app uses that one and runs nothing itself.
//   - Otherwise the app runs its own: downloaded once into <data folder>/engine, started
//     when it is first needed, on a port of its own so that it never takes the place of
//     the user's, and stopped when the app quits.
//   - If the user starts their Ollama while the app's own runs, the app's own is stopped
//     (once the reply being written is over) and theirs takes over.
//
// Both keep their models in the same place, Ollama's usual folder (~/.ollama/models):
// a model downloaded by one is there for the other, so taking over changes nothing.
//
// Nothing here knows about Electron, so all of it is tested with plain folders, a real
// process and a local web server (engine.test.ts).

/** Where an Ollama the user runs themselves answers. */
export const YOUR_OLLAMA_URL = 'http://127.0.0.1:11434'
/** The port the app's own Ollama asks for first. Another one is taken when it is in use. */
const OWN_PORT = 11534
/** How often the app looks whether the user started their own Ollama, while its own runs. */
const WATCH_MS = 4000
const START_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 5000
/** How long the app's own Ollama keeps a model in memory after the last reply. It is stopped with the app anyway. */
const KEEP_ALIVE = '30m'
/**
 * How much room an engine takes once unpacked, as a multiple of its download. Measured on
 * Ollama 0.40.0: the Mac archive (gzip) grows 3.3 times, the Linux one (zstd) 1.5 times;
 * the Windows .zip was not measured. The download itself is still there meanwhile.
 */
const UNPACKED_RATIO = { tgz: 3.3, 'tar.zst': 1.5, zip: 2.5 } as const
/** Windows may hold a file of a folder for a moment after it is written (antivirus, indexing): moving the folder is tried again. */
const RENAME_TRIES = 12

export interface EngineOptions {
  /** Where the app's own Ollama is kept: <data folder>/engine. */
  folder: string
  platform: string
  arch: string
  memoryBytes: number
  /**
   * On a PC, the graphics card, found in the background (src/main/graphics.ts): null when
   * there is none. Left out on a Mac, whose memory is shared: the computer's memory counts.
   */
  graphics?: Promise<GraphicsCard | null>
  /** True while a reply is being written: the app's own Ollama is not stopped under it. */
  busy: () => boolean
  /** Called with the new status each time something changes, download progress included. */
  onChange: (status: EngineStatus) => void
  /** For the tests: another address for the user's Ollama, another download, another port. */
  yoursUrl?: string
  package?: EnginePackage | null
  ownPort?: number
  watchMs?: number
  env?: NodeJS.ProcessEnv
  /**
   * The context the user chose for the app's own Ollama (Settings › Generation, a size set
   * by hand), or null to let the app choose from the computer's memory. Read each time it
   * starts.
   */
  chosenContext?: () => Promise<number | null>
  /** How many bytes are free where a folder is. For the tests: a disk of another size than this computer's. */
  freeSpace?: (folder: string) => Promise<number | null>
  log?: (line: string) => void
}

export interface Engine {
  /**
   * The address replies "on this computer" come from, as an OpenAI-compatible base URL:
   * the user's Ollama when it answers, the app's own otherwise (started if need be).
   * Throws EngineMissingError when there is neither.
   */
  baseUrl(): Promise<string>
  /** Where things stand. `wake` starts the app's own Ollama if that is what it takes to list the models. */
  status(wake?: boolean): Promise<EngineStatus>
  /**
   * Gets a model: the app's own Ollama first when there is no Ollama at all, then the
   * model. Resolves once the model can be used; throws a sentence to show otherwise,
   * or an AbortError when `cancel` was called.
   */
  download(model: string): Promise<void>
  /** Stops the download under way. What was received is kept: asking again goes on from there. */
  cancel(): void
  /** Removes a model from the disk. */
  remove(model: string): Promise<void>
  /**
   * The Ollama in use right now and its version, or null when none runs. Unlike
   * `baseUrl`, it never starts one: for what is only worth doing when one is there anyway.
   */
  current(): Promise<{ url: string; version: string } | null>
  /** True when the Ollama in use holds this model. False when none runs. */
  has(model: string): Promise<boolean>
  /**
   * The Ollama to use, started if need be: the user's when it answers, the app's own
   * otherwise. Null when there is neither and the app's own is not downloaded: this never
   * downloads. For the app's small model when replies come from elsewhere (see sense.ts).
   */
  wake(): Promise<{ url: string; version: string } | null>
  /**
   * Downloads the app's own Ollama without a word to the page, when none is there to use:
   * for the app's small model, not for chatting. Throws a sentence to log when it cannot.
   */
  installQuietly(onProgress?: (fraction: number) => void): Promise<void>
  /** What `installQuietly` would download, in bytes: 0 when an Ollama is there already. */
  missingBytes(): Promise<number>
  /**
   * The context the app's own Ollama loads every model with. Ollama only tells it once a
   * model is in memory; the app knows it before, since it sets it. Null when replies come
   * from the user's Ollama, whose setting is theirs and cannot be read.
   */
  plannedContext(): Promise<number | null>
  /**
   * The context the user chose has changed: the app's own Ollama, if it runs with another,
   * is stopped once nothing is under way, and starts again with the new one when next needed.
   */
  contextChanged(): Promise<void>
  /**
   * Downloads one of the app's small models without a word to the page: it is no chat
   * model, and nothing waits for it. The app's own Ollama is not stopped under it.
   * Throws a sentence to log when it cannot be had.
   */
  fetchQuietly(model: string, onProgress?: (progress: PullProgress) => void): Promise<void>
  /**
   * Says the Ollama in use is being asked something the page knows nothing of: the app's
   * own is not stopped until the function this returns is called. For a few questions in
   * a row; a reply being written is known by `busy` already.
   */
  hold(): () => void
  /**
   * For when replies start coming from elsewhere (another server, an online service):
   * the app's own Ollama is stopped, unless it is in the middle of a download.
   */
  rest(): Promise<void>
  /** Stops the app's own Ollama and waits for it to be gone. A download under way is stopped too. */
  stop(): Promise<void>
  /** The same without waiting, for when the app quits. */
  stopNow(): void
}

interface Installed {
  version: string
  folder: string
  binary: string
}

interface OwnServer {
  url: string
  pid: number
  child: ChildProcess
  /** The context it loads every model with (OLLAMA_CONTEXT_LENGTH). */
  context: number
}

export function createEngine(options: EngineOptions): Engine {
  const yoursUrl = options.yoursUrl ?? YOUR_OLLAMA_URL
  const pkg = options.package !== undefined ? options.package : enginePackage(options.platform, options.arch)
  const log = options.log ?? (() => {})
  const freeSpace = options.freeSpace ?? freeSpaceAt
  const isWindows = options.platform === 'win32'
  const serverFile = join(options.folder, 'server.json')

  /** The app's own Ollama, once it answers. */
  let own: OwnServer | null = null
  /** The one that was just started and does not answer yet. */
  let pending: OwnServer | null = null
  let starting: Promise<string> | null = null
  /** Why the app's own Ollama could not be started the last time it was tried. */
  let problem: string | null = null
  /** The app is closing: nothing is started any more. */
  let quitting = false
  let job: EngineJob | null = null
  let jobAbort: AbortController | null = null
  /** Downloads the page is not told about (see `fetchQuietly`). */
  const quiet = new Set<AbortController>()
  /** Whoever is asking the Ollama in use something right now (see `hold`). */
  const holds = new Set<symbol>()
  /** True while the app's own Ollama is doing something that stopping it would break. */
  const inUse = (): boolean => options.busy() || job !== null || quiet.size > 0 || holds.size > 0
  let watcher: ReturnType<typeof setInterval> | null = null
  let looking = false

  // --- The user's own Ollama --------------------------------------------------------

  let seen: { at: number; version: string | null } = { at: 0, version: null }

  /**
   * The version of the user's Ollama when it answers, null otherwise. One answer serves
   * the few questions asked in a row for one request; beyond that it is asked again,
   * which costs nothing: it is on this computer.
   */
  async function yours(maxAgeMs = 250): Promise<string | null> {
    if (Date.now() - seen.at > maxAgeMs) seen = { at: Date.now(), version: await ollamaVersion(yoursUrl) }
    return seen.version
  }

  // --- The app's own Ollama on disk -------------------------------------------------
  // <folder>/<version>/ holds an unpacked release. The file ".complete" is written last:
  // a folder without it is a download that was interrupted, and is not used.

  async function installed(): Promise<Installed | null> {
    const entries = await readdir(options.folder, { withFileTypes: true }).catch(() => [])
    const found: Installed[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const folder = join(options.folder, entry.name)
      try {
        const mark = JSON.parse(await readFile(join(folder, '.complete'), 'utf8')) as { version?: unknown; binary?: unknown }
        if (typeof mark.version !== 'string' || typeof mark.binary !== 'string') continue
        const binary = join(folder, mark.binary)
        if ((await stat(binary)).isFile()) found.push({ version: mark.version, folder, binary })
      } catch {
        // Not an engine, or not a whole one.
      }
    }
    return found.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
  }

  // --- Starting and stopping --------------------------------------------------------

  async function address(): Promise<string> {
    if (await yours()) {
      // The user's Ollama answers: it is the one in use, and the app's own makes two.
      // It is only kept for as long as something is being done with it.
      if (own && !inUse()) await stopOwn()
      if (!own) return `${yoursUrl}/v1`
    }
    const server = own
    if (server && server.child.exitCode === null && server.child.signalCode === null) return `${server.url}/v1`
    return `${await start()}/v1`
  }

  function start(): Promise<string> {
    starting ??= launch()
      .then(
        (url) => {
          problem = null
          void emit() // The page learns that the app's own Ollama now runs.
          return url
        },
        (error: unknown) => {
          // Kept for the page to show: a model list that stays empty explains nothing.
          if (!(error instanceof EngineMissingError) && !isAbort(error)) problem = describe(error)
          throw error
        },
      )
      .finally(() => {
        starting = null
      })
    return starting
  }

  async function launch(): Promise<string> {
    const engine = await installed()
    if (!engine) throw new EngineMissingError()

    // One this app started and could not stop (it was closed badly) is ended first: there
    // is only ever one. It is known by the note the app left, and by answering like Ollama there.
    const left = await readServerFile()
    if (left) {
      if (isRunning(left.pid) && (await ollamaVersion(left.url)) !== null) {
        log(`engine: ending the app's own Ollama left running at ${left.url} (pid ${left.pid})`)
        terminateNow(left.pid)
        await waitUntil(() => !isRunning(left.pid), STOP_TIMEOUT_MS)
        if (isRunning(left.pid)) terminateNow(left.pid, true)
      }
      await rm(serverFile, { force: true })
    }
    // Whatever else still runs from the app's own Ollama: what an app that was ended hard
    // (a crash, a restart while developing) could not stop. Nothing else runs from there.
    await endStrays(options.folder)
    if (quitting) throw abortError()

    const context = await wantedContext()
    const port = await freePort(options.ownPort ?? OWN_PORT)
    const url = `http://127.0.0.1:${port}`
    const base = options.env ?? process.env
    const child = spawn(engine.binary, ['serve'], {
      cwd: engine.folder,
      env: {
        ...base,
        OLLAMA_HOST: `127.0.0.1:${port}`,
        // What the user set for their own Ollama is respected; the rest suits a roleplay chat.
        OLLAMA_CONTEXT_LENGTH: String(context),
        OLLAMA_KEEP_ALIVE: base['OLLAMA_KEEP_ALIVE'] || KEEP_ALIVE,
        // "Your chats never leave this computer": no model that runs on Ollama's servers.
        OLLAMA_NO_CLOUD: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // A process group of its own (macOS, Linux): Ollama runs each loaded model in a process
      // of its own, and the whole group is ended together (see terminateNow). Ended one by
      // one, the server could go and leave those behind, each holding its model in memory.
      detached: !isWindows,
    })

    // What Ollama says goes to a file, for when something has to be understood later.
    const output = createWriteStream(join(options.folder, 'server.log'))
    output.on('error', () => {})
    const lastLines: string[] = []
    const keep = (chunk: Buffer): void => {
      output.write(chunk)
      lastLines.push(...chunk.toString('utf8').split('\n').filter(Boolean))
      lastLines.splice(0, Math.max(0, lastLines.length - 12))
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)

    const server: OwnServer = { url, pid: child.pid ?? 0, child, context }
    pending = server
    // A program that cannot be run at all (missing, not allowed) says so here, not by exiting.
    const spawned: { failure: Error | null } = { failure: null }
    child.once('error', (error) => {
      spawned.failure = error
    })
    child.once('exit', (code, signal) => {
      output.end()
      log(`engine: the app's own Ollama ended (${signal ?? `code ${code}`})`)
      if (own !== server) return
      own = null
      stopWatching()
      void rm(serverFile, { force: true })
      void emit()
    })

    const deadline = Date.now() + START_TIMEOUT_MS
    while ((await ollamaVersion(url, 500)) === null) {
      const ended = child.exitCode !== null || child.signalCode !== null
      // Stopped on purpose (the app is closing, or was asked to stop): not a failure to report.
      const stopped = quitting || pending !== server
      if (spawned.failure || ended || stopped || Date.now() > deadline) {
        if (pending === server) pending = null
        terminateNow(server.pid)
        if (stopped) throw abortError()
        const reason = spawned.failure?.message ?? lastMeaningful(lastLines) ?? 'it did not answer in time'
        throw new Error(`The model engine could not start: ${reason}`)
      }
      await sleep(120)
    }
    if (quitting) {
      pending = null
      terminateNow(server.pid)
      throw abortError()
    }

    pending = null
    own = server
    await writeFile(serverFile, JSON.stringify({ url, pid: server.pid }), 'utf8').catch(() => {})
    log(`engine: started the app's own Ollama ${engine.version} at ${url} (pid ${server.pid}, context ${context})`)
    watch()
    return url
  }

  async function readServerFile(): Promise<{ url: string; pid: number } | null> {
    try {
      const saved = JSON.parse(await readFile(serverFile, 'utf8')) as { url?: unknown; pid?: unknown }
      if (typeof saved.url === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(saved.url) && typeof saved.pid === 'number' && saved.pid > 0) {
        return { url: saved.url, pid: saved.pid }
      }
    } catch {
      // No file: nothing was left running.
    }
    return null
  }

  /** Looks, from time to time, whether the user started their own Ollama: the app's own then gives way. */
  function watch(): void {
    stopWatching()
    watcher = setInterval(() => void look(), options.watchMs ?? WATCH_MS)
    watcher.unref?.()
  }

  function stopWatching(): void {
    if (watcher) clearInterval(watcher)
    watcher = null
  }

  async function look(): Promise<void> {
    if (looking || !own) return
    looking = true
    try {
      if ((await yours(0)) && own && !inUse()) {
        log("engine: an Ollama of the user's answers; stopping the app's own")
        await stopOwn()
        await emit()
      }
    } finally {
      looking = false
    }
  }

  async function stopOwn(): Promise<void> {
    const server = own
    if (!server) return
    own = null
    stopWatching()

    const { child } = server
    const gone = new Promise<void>((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', () => resolve())))
    terminateNow(server.pid)
    const stopped = await Promise.race([gone.then(() => true), sleep(STOP_TIMEOUT_MS).then(() => false)])
    if (!stopped) terminateNow(server.pid, true)
    await rm(serverFile, { force: true })
  }

  /** Asks an Ollama the app started to end, without waiting. `hard`: it did not listen the first time. */
  function terminateNow(pid: number, hard = false): void {
    if (!pid) return
    if (isWindows) {
      try {
        // Ollama runs each model in a process of its own: the whole family goes.
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 4000 })
      } catch {
        // Already gone.
      }
      return
    }
    // SIGTERM: Ollama unloads its models and ends by itself. Sent to its process group, so
    // that the processes it runs its models in go too, even if it ends before them.
    const signal = hard ? 'SIGKILL' : 'SIGTERM'
    try {
      process.kill(-pid, signal)
    } catch {
      // No group of that number (one started by an older version of the app): the process alone.
      try {
        process.kill(pid, signal)
      } catch {
        // Already gone.
      }
    }
  }

  /**
   * Ends every process that runs a program of `folder`: the app's own Ollama only, never
   * the user's. macOS and Linux; on Windows taskkill /T already takes a whole family.
   */
  async function endStrays(folder: string): Promise<void> {
    if (isWindows) return
    const listed = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 4000 })
    if (listed.status !== 0 || !listed.stdout) return
    const strays = strayPids(listed.stdout, folder).filter((pid) => pid !== process.pid)
    if (strays.length === 0) return
    log(`engine: ending ${strays.length} process(es) of the app's own Ollama left running (${strays.join(', ')})`)
    for (const pid of strays) terminateNow(pid)
    await waitUntil(() => strays.every((pid) => !isRunning(pid)), STOP_TIMEOUT_MS)
    for (const pid of strays) if (isRunning(pid)) terminateNow(pid, true)
  }

  // --- Status -----------------------------------------------------------------------

  let last: EngineStatus | null = null

  async function status(wake = false): Promise<EngineStatus> {
    let url: string | null = null
    if (wake) {
      url = await address().catch((error: unknown) => {
        if (!(error instanceof EngineMissingError)) log(`engine: ${describe(error)}`)
        return null
      })
    }
    const yourVersion = await yours()
    const engine = await installed()
    const state: EngineState = own ? 'running' : yourVersion ? 'yours' : engine ? 'stopped' : pkg ? 'missing' : 'unsupported'
    url ??= own ? own.url : yourVersion ? yoursUrl : null

    // Chat models only: the ones that turn text into numbers (the app's own included) cannot write a reply.
    const held: ModelInfo[] = url ? await listOllamaModels(url, AbortSignal.timeout(4000)).catch(() => []) : []
    const models = held.filter((model) => !isEmbeddingModel(model.id))
    const version = state === 'yours' ? yourVersion : (engine?.version ?? null)
    const graphics = options.graphics ? await options.graphics.catch(() => null) : undefined
    last = {
      state,
      version,
      engineBytes: pkg?.bytes ?? 0,
      memoryBytes: options.memoryBytes,
      ...(graphics !== undefined && { graphics }),
      ...offersFor(options.memoryBytes, models, graphics),
      models,
      job,
      problem,
    }
    return last
  }

  async function emit(): Promise<void> {
    options.onChange(await status())
  }

  let lastProgress = 0

  /** Download progress: sent a few times a second at most, without asking Ollama anything. */
  function setJob(next: EngineJob): void {
    const stepChanged = next.step !== job?.step
    const justEnded = next.totalBytes > 0 && next.doneBytes >= next.totalBytes && (job?.doneBytes ?? 0) < next.totalBytes
    job = next
    if (!stepChanged && !justEnded && Date.now() - lastProgress < 150) return
    lastProgress = Date.now()
    if (last) options.onChange({ ...last, job })
    else void emit()
  }

  // --- Downloading ------------------------------------------------------------------

  async function download(model: string): Promise<void> {
    if (job) throw new Error('Another download is under way. Wait for it to end, or stop it.')
    const controller = new AbortController()
    jobAbort = controller
    const signal = controller.signal
    setJob({ model, step: 'starting', doneBytes: 0, totalBytes: 0 })

    try {
      let base: string
      // The small model may be getting the engine already (installQuietly): one download of it is enough.
      await installingQuietly?.catch(() => {})
      if (!(await yours(0)) && !(await installed())) {
        if (!pkg) throw new Error('There is no Ollama for this kind of computer. Use another server or an online service.')
        const engine = pkg
        await install(engine, signal, (step, doneBytes) =>
          setJob(step === 'engine' ? { model, step, doneBytes, totalBytes: engine.bytes } : { model, step, doneBytes: 0, totalBytes: 0 }),
        )
        setJob({ model, step: 'starting', doneBytes: 0, totalBytes: 0 })
      }
      try {
        base = await address()
      } catch (error) {
        throw new Error(describe(error))
      }
      signal.throwIfAborted()

      await requireSpace(model)
      setJob({ model, step: 'model', doneBytes: 0, totalBytes: builtinModelBytes(model) ?? 0 })
      try {
        await pullOllamaModel(
          base,
          model,
          (progress) =>
            setJob({
              model,
              step: progress.phase === 'finishing' ? 'finishing' : 'model',
              doneBytes: progress.doneBytes,
              // Until Ollama says how much there is, the size the app knows for its own models.
              totalBytes: progress.totalBytes || (builtinModelBytes(model) ?? 0),
            }),
          signal,
        )
      } catch (error) {
        if (signal.aborted || isAbort(error)) throw abortError()
        throw new Error(describePullError(error, model))
      }
      log(`engine: downloaded ${model}`)
    } catch (error) {
      if (signal.aborted) throw abortError()
      throw error
    } finally {
      job = null
      jobAbort = null
      await emit().catch(() => {})
    }
  }

  /** Refuses to start a download the disk has no room for, with the numbers. Only for the app's own models: their size is known. */
  async function requireSpace(model: string): Promise<void> {
    const needed = builtinModelBytes(model)
    if (needed === null) return
    const folder = (options.env ?? process.env)['OLLAMA_MODELS'] || join(homedir(), '.ollama', 'models')
    // A download that was stopped left its files there: how much is still missing is
    // Ollama's to know, so nothing is refused then.
    const blobs = await readdir(join(folder, 'blobs')).catch(() => [])
    if (blobs.some((name) => name.includes('partial'))) return
    const free = await freeSpace(folder)
    if (free !== null && free < needed) {
      throw new Error(`This model takes about ${gigabytes(needed)} and the disk has ${gigabytes(free)} free. Free some space, then try again.`)
    }
  }

  // --- Installing the app's own Ollama ------------------------------------------------

  /** `report`: where the installation stands, as the download goes and when it is unpacked. */
  async function install(engine: EnginePackage, signal: AbortSignal, report: (step: 'engine' | 'unpacking', doneBytes: number) => void): Promise<void> {
    await mkdir(options.folder, { recursive: true })
    // Under its own name, extension included: some tools only open a ".zip" that is called one.
    const archive = join(options.folder, `download-${engine.file}`)

    try {
      const free = await freeSpace(options.folder)
      const already = await stat(archive).then((info) => info.size, () => 0)
      const needed = engine.bytes * (1 + UNPACKED_RATIO[engine.format]) - already
      if (free !== null && free < needed) {
        throw new Error(`Installing the model engine takes about ${gigabytes(needed)} and the disk has ${gigabytes(free)} free. Free some space, then try again.`)
      }

      await fetchArchive(engine, archive, (doneBytes) => report('engine', doneBytes), signal)
      signal.throwIfAborted()

      report('unpacking', 0)
      await checkArchive(engine, archive, signal)
      const target = join(options.folder, engine.version)
      const staging = `${target}.unpacking`
      await rm(staging, { recursive: true, force: true })
      await mkdir(staging, { recursive: true })
      await unpack(archive, engine.format, staging, signal)

      const binary = join(staging, engine.binary)
      if (!(await stat(binary).then((info) => info.isFile(), () => false))) {
        throw new Error('The model engine that was downloaded is not what was expected. Try again.')
      }
      if (!isWindows) await chmod(binary, 0o755)
      // macOS marks what a browser downloads so that it asks before running it. Node's
      // downloads are not marked; this is for the day that changes.
      if (options.platform === 'darwin') spawnSync('xattr', ['-dr', 'com.apple.quarantine', staging], { timeout: 10_000 })
      await writeFile(join(staging, '.complete'), JSON.stringify({ version: engine.version, binary: engine.binary }), 'utf8')

      await rm(target, { recursive: true, force: true })
      await renameWhenFree(staging, target)
      await rm(archive, { force: true })
      log(`engine: installed the app's own Ollama ${engine.version}`)
    } catch (error) {
      if (signal.aborted || isAbort(error)) throw abortError()
      throw new Error(describeEngineDownloadError(error))
    }
  }

  // --- The rest ---------------------------------------------------------------------

  async function remove(model: string): Promise<void> {
    await deleteOllamaModel(await address(), model)
    log(`engine: removed ${model}`)
    await emit()
  }

  // --- For what is only done when an Ollama is there anyway ---------------------------

  async function current(): Promise<{ url: string; version: string } | null> {
    const server = own
    if (server && server.child.exitCode === null && server.child.signalCode === null) {
      const version = await ollamaVersion(server.url)
      return version === null ? null : { url: server.url, version }
    }
    const version = await yours()
    return version === null ? null : { url: yoursUrl, version }
  }

  /**
   * The context the app's own Ollama is started with: the one the user chose, else the one
   * set for Ollama on this computer (OLLAMA_CONTEXT_LENGTH), else one that suits its memory.
   */
  async function wantedContext(): Promise<number> {
    const chosen = await options.chosenContext?.().catch(() => null)
    if (chosen && chosen > 0) return chosen
    const set = Number((options.env ?? process.env)['OLLAMA_CONTEXT_LENGTH'])
    const graphics = options.graphics ? await options.graphics.catch(() => null) : undefined
    return set > 0 ? set : engineContextLength(options.memoryBytes, graphics)
  }

  async function plannedContext(): Promise<number | null> {
    if (!own && (await yours())) return null
    return wantedContext()
  }

  async function contextChanged(): Promise<void> {
    const server = own
    if (!server || server.context === (await wantedContext())) return
    // Not under a reply or a download: it would be cut. The change waits for them.
    while (inUse() && own === server && !quitting) await sleep(1000)
    if (own !== server) return
    log(`engine: stopping the app's own Ollama, to start it again with a context of ${await wantedContext()}`)
    await stopOwn()
    await emit()
  }

  async function has(model: string): Promise<boolean> {
    const server = await current()
    if (!server) return false
    const held = await listOllamaModels(server.url, AbortSignal.timeout(4000)).catch(() => [])
    return held.some((item) => sameOllamaModel(item.id, model))
  }

  async function fetchQuietly(model: string, onProgress?: (progress: PullProgress) => void): Promise<void> {
    const controller = new AbortController()
    quiet.add(controller)
    try {
      const server = await current()
      if (!server) throw new EngineMissingError()
      await pullOllamaModel(server.url, model, (progress) => onProgress?.(progress), controller.signal)
      log(`engine: downloaded ${model}`)
    } catch (error) {
      if (controller.signal.aborted || isAbort(error)) throw abortError()
      throw new Error(describePullError(error, model))
    } finally {
      quiet.delete(controller)
    }
  }

  /** The engine being downloaded for the small model, so that a download from the page waits for it. */
  let installingQuietly: Promise<void> | null = null

  async function wake(): Promise<{ url: string; version: string } | null> {
    try {
      await address()
    } catch (error) {
      if (!(error instanceof EngineMissingError) && !isAbort(error)) log(`engine: ${describe(error)}`)
      return null
    }
    return current()
  }

  async function missingBytes(): Promise<number> {
    if ((await yours()) || (await installed())) return 0
    return pkg?.bytes ?? 0
  }

  function installQuietly(onProgress?: (fraction: number) => void): Promise<void> {
    installingQuietly ??= (async () => {
      if ((await yours(0)) || (await installed())) return
      if (!pkg) throw new Error('There is no Ollama for this kind of computer.')
      // A download from the page is getting it already: the small model waits for its turn.
      if (job) throw new Error('Another download is under way.')
      const engine = pkg
      const controller = new AbortController()
      quiet.add(controller)
      try {
        log(`engine: downloading the app's own Ollama ${engine.version} (${Math.round(engine.bytes / 1e6)} MB) for the small model`)
        await install(engine, controller.signal, (step, doneBytes) => onProgress?.(step === 'engine' ? Math.min(1, doneBytes / engine.bytes) : 1))
        await emit().catch(() => {})
      } finally {
        quiet.delete(controller)
      }
    })().finally(() => {
      installingQuietly = null
    })
    return installingQuietly
  }

  return {
    wake,
    installQuietly,
    missingBytes,
    baseUrl: address,
    status,
    download,
    cancel: () => jobAbort?.abort(),
    remove,
    current,
    has,
    plannedContext,
    contextChanged,
    fetchQuietly,
    hold() {
      const mine = Symbol('hold')
      holds.add(mine)
      return () => void holds.delete(mine)
    },
    async rest() {
      if (inUse()) return
      await starting?.catch(() => {})
      if (!own || inUse()) return
      await stopOwn()
      await emit()
    },
    async stop() {
      jobAbort?.abort()
      for (const controller of quiet) controller.abort()
      // One that is still starting is not waited for: it is ended as it is.
      const unready = pending
      pending = null
      if (unready) terminateNow(unready.pid)
      await starting?.catch(() => {})
      await stopOwn()
    },
    stopNow() {
      quitting = true
      jobAbort?.abort()
      for (const controller of quiet) controller.abort()
      stopWatching()
      for (const server of [own, pending]) if (server) terminateNow(server.pid)
      own = null
      pending = null
      rmSync(serverFile, { force: true })
    },
  }
}

// --- Files ----------------------------------------------------------------------------

/** Downloads the engine to `file`, going on from what a previous try left there. */
async function fetchArchive(engine: EnginePackage, file: string, onProgress: (doneBytes: number) => void, signal: AbortSignal): Promise<void> {
  let have = await stat(file).then((info) => info.size, () => 0)
  if (have > engine.bytes) {
    await rm(file, { force: true })
    have = 0
  }

  if (have < engine.bytes) {
    const response = await fetch(engine.url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, signal, redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`The download was refused (${response.status}).`)
    // 206: the server sends the rest. 200: it sends everything again, so the file starts over.
    const resumed = have > 0 && response.status === 206
    if (!resumed) have = 0

    let done = have
    onProgress(done)
    const count = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        done += chunk.length
        onProgress(done)
        callback(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(response.body as never), count, createWriteStream(file, { flags: resumed ? 'a' : 'w' }), { signal })
  }
  onProgress(engine.bytes)
}

/**
 * Checks the downloaded file against the checksum the app was built with. A file that
 * does not match is thrown away: it arrived damaged, or it is not the release expected.
 */
async function checkArchive(engine: EnginePackage, file: string, signal: AbortSignal): Promise<void> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk as Buffer)
  if (hash.digest('hex') !== engine.sha256) {
    await rm(file, { force: true })
    throw new Error('The download arrived damaged. Try again.')
  }
}

/** Unpacks an archive into `folder` with the computer's own `tar` (it reads .zip too on Windows). */
async function unpack(archive: string, format: EnginePackage['format'], folder: string, signal: AbortSignal): Promise<void> {
  if (format === 'zip') {
    // Windows' own tar reads .zip files. Another "tar" found first on the PATH (Git, MSYS2) may not.
    const windowsTar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
    try {
      await run(windowsTar, ['-xf', archive, '-C', folder], signal)
      return
    } catch (error) {
      if (signal.aborted) throw error
      // Before Windows 10 had tar, PowerShell could already do it (slowly). Its command is
      // one piece of text: each path goes in quotes of its own.
      const quoted = (path: string): string => `'${path.replace(/'/g, "''")}'`
      const command = `Expand-Archive -LiteralPath ${quoted(archive)} -DestinationPath ${quoted(folder)} -Force`
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], signal).catch(() => {
        throw error // What tar said is the reason worth showing.
      })
      return
    }
  }

  // The archive is decompressed here and handed to tar as it comes: no tar has to know zstd.
  const tar = spawn('tar', ['-xf', '-', '-C', folder], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
  let complaint = ''
  tar.stderr?.on('data', (chunk: Buffer) => (complaint = (complaint + chunk.toString('utf8')).slice(-600)))
  const stop = (): void => void tar.kill()
  signal.addEventListener('abort', stop, { once: true })

  try {
    await new Promise<void>((resolve, reject) => {
      const source = createReadStream(archive)
      const plain = format === 'tar.zst' ? createZstdDecompress() : createGunzip()
      // An archive that cannot be read is a failure. What tar thinks of its input is not:
      // it may stop listening once it has seen the end of the archive, and its exit code says how it went.
      source.once('error', reject)
      plain.once('error', reject)
      tar.stdin?.on('error', () => {})
      tar.once('error', reject)
      tar.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`The engine could not be unpacked: ${complaint.trim() || `tar ended with code ${code}`}`))))
      source.pipe(plain).pipe(tar.stdin!)
    })
  } catch (error) {
    stop()
    throw error
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

function run(command: string, args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, signal })
    let complaint = ''
    child.stderr?.on('data', (chunk: Buffer) => (complaint = (complaint + chunk.toString('utf8')).slice(-600)))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`The engine could not be unpacked: ${complaint.trim() || `${command} ended with code ${code}`}`))))
  })
}

/** Moves a folder, trying again for a few seconds when something still holds one of its files. */
async function renameWhenFree(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= RENAME_TRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error
      await sleep(500)
    }
  }
}

/** How many bytes are free where `path` is, or will be. Null when the computer does not say. */
async function freeSpaceAt(path: string): Promise<number | null> {
  for (let folder = path; ; folder = dirname(folder)) {
    try {
      const info = await statfs(folder)
      return info.bavail * info.bsize
    } catch {
      if (dirname(folder) === folder) return null
    }
  }
}

/** `preferred` when nothing listens there, any free port otherwise. */
function freePort(preferred: number): Promise<number> {
  const tryPort = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const probe = createServer()
      probe.once('error', reject)
      probe.listen(port, '127.0.0.1', () => {
        const address = probe.address()
        probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No port.'))))
      })
    })
  return tryPort(preferred).catch(() => tryPort(0))
}

/** The processes of a `ps -axo pid=,command=` listing whose program is in `folder`. */
export function strayPids(listing: string, folder: string): number[] {
  const inside = folder.endsWith('/') ? folder : `${folder}/`
  const pids: number[] = []
  for (const line of listing.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match && match[2]!.startsWith(inside)) pids.push(Number(match[1]))
  }
  return pids
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: it runs, as someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check() && Date.now() < deadline) await sleep(100)
}

/** The last thing Ollama said that reads like a reason, without its timestamps. */
function lastMeaningful(lines: string[]): string | null {
  const line = [...lines].reverse().find((item) => /error|fail|cannot|denied|in use/i.test(item)) ?? lines.at(-1)
  if (!line) return null
  const message = /msg="([^"]+)"/.exec(line)?.[1] ?? line.replace(/^Error:\s*/, '')
  return message.trim().slice(0, 300) || null
}

function gigabytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

function abortError(): Error {
  const error = new Error('Stopped.')
  error.name = 'AbortError'
  return error
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
