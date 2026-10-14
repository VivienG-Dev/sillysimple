import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readNvidiaSmi, readWindowsRegistry, SMALLEST_CARD } from '@core/engine/graphics'
import type { GraphicsCard } from '@shared/types'

// Finds the graphics card of a PC (see src/core/engine/graphics.ts for why it matters).
// Asked once, in the background, when the app starts: nothing waits for it but the list
// of models. Every way fails quietly: no card found means "the processor alone".
//
//   1. nvidia-smi: comes with NVIDIA's driver, on Windows and Linux, and says it exactly.
//   2. Windows: the registry, where every display driver writes its card's memory.
//   3. Linux: what the AMD driver writes in /sys.

/** Runs a command and gives back what it wrote, or '' when it could not be run. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((done) => {
    execFile(command, args, { timeout: 5000, windowsHide: true, maxBuffer: 4 * 2 ** 20 }, (error, stdout) => done(error ? '' : String(stdout)))
  })
}

const DISPLAY_ADAPTERS = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'

export async function findGraphicsCard(platform: string): Promise<GraphicsCard | null> {
  const nvidia = readNvidiaSmi(await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']))
  if (nvidia) return nvidia
  if (platform === 'win32') return readWindowsRegistry(await run('reg', ['query', DISPLAY_ADAPTERS, '/s']))
  if (platform === 'linux') return linuxAmd()
  return null
}

async function linuxAmd(): Promise<GraphicsCard | null> {
  const cards = await readdir('/sys/class/drm').catch(() => [])
  let best: GraphicsCard | null = null
  for (const card of cards.filter((name) => /^card\d+$/.test(name))) {
    const bytes = Number((await readFile(join('/sys/class/drm', card, 'device', 'mem_info_vram_total'), 'utf8').catch(() => '')).trim())
    if (bytes >= SMALLEST_CARD && bytes > (best?.memoryBytes ?? 0)) best = { name: 'AMD graphics card', memoryBytes: bytes }
  }
  return best
}
