import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ollamaVersion } from '@core/providers/ollama'

// The Ollama a trial of the lab asks: yours, or the app's own when SillySimple is open
// and has started it. With neither, the one the app installed is started on a port of
// its own for the time the trial takes, without touching anything the app keeps.
//
//   SILLYSIMPLE_DATA=/path/to/the/app/data/folder   another data folder than the usual one

export interface LabOllama {
  /** Its address, without `/v1`. */
  url: string
  /** Which one it is, in words. */
  what: string
  /** Ends it, when the lab started it. */
  stop: () => Promise<void>
}

/** Where SillySimple keeps its data on this kind of computer (Electron's "userData"). */
export function appData(): string {
  if (process.env['SILLYSIMPLE_DATA']) return process.env['SILLYSIMPLE_DATA']
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'SillySimple')
  if (process.platform === 'win32') return join(process.env['APPDATA'] || join(homedir(), 'AppData', 'Roaming'), 'SillySimple')
  return join(process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config'), 'SillySimple')
}

export async function findOllama(): Promise<LabOllama> {
  const nothing = async (): Promise<void> => {}
  const yours = 'http://127.0.0.1:11434'
  if (await ollamaVersion(yours)) return { url: yours, what: 'your own Ollama', stop: nothing }

  const folder = join(appData(), 'engine')
  try {
    const saved = JSON.parse(readFileSync(join(folder, 'server.json'), 'utf8')) as { url?: unknown }
    if (typeof saved.url === 'string' && (await ollamaVersion(saved.url))) return { url: saved.url, what: "SillySimple's own Ollama (the app is open)", stop: nothing }
  } catch {
    // The app is not running its own.
  }

  // The Ollama the app installed, started here as the app would, but apart from it: another
  // port, and no note left in its folder, so that an app opened meanwhile neither finds it
  // nor ends it.
  const program = (existsSync(folder) ? readdirSync(folder, { withFileTypes: true }) : [])
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .flatMap((entry) => {
      try {
        const mark = JSON.parse(readFileSync(join(folder, entry.name, '.complete'), 'utf8')) as { binary?: unknown }
        const file = typeof mark.binary === 'string' ? join(folder, entry.name, mark.binary) : ''
        return file && existsSync(file) ? [file] : []
      } catch {
        return []
      }
    })
    .sort()
    .at(-1)
  if (!program) {
    throw new Error('No Ollama to ask. Open SillySimple and download a model once, which installs its Ollama, or start Ollama yourself; then run this again.')
  }

  const url = 'http://127.0.0.1:11634'
  const child = spawn(program, ['serve'], { env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11634', OLLAMA_NO_CLOUD: '1' }, stdio: 'ignore' })
  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const gone = new Promise<void>((done) => child.once('exit', () => done()))
    child.kill('SIGTERM')
    await Promise.race([gone, new Promise((done) => setTimeout(done, 5000))])
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  for (let tries = 0; tries < 150; tries++) {
    if (await ollamaVersion(url, 500)) return { url, what: 'the Ollama SillySimple installed, started for the lab', stop }
    if (child.exitCode !== null) break
    await new Promise((done) => setTimeout(done, 200))
  }
  await stop()
  throw new Error(`The Ollama SillySimple installed (${program}) did not start. Start Ollama yourself, then run this again.`)
}
