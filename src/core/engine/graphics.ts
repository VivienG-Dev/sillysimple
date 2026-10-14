import type { GraphicsCard } from '@shared/types'

// The graphics card of a PC, read from what the system says (src/main/graphics.ts runs the
// commands, this reads their answers). On a PC it is the card's own memory, not the
// computer's, that decides how large a model runs quickly: what does not fit on the card
// runs on the processor, many times slower. A Mac with an Apple chip has no such card: its
// memory is shared, and the computer's memory is the one that counts.

const MIB = 2 ** 20

/** Less than this is a chip in the processor with a little memory set aside, not a card a model runs on. */
export const SMALLEST_CARD = 2 * 2 ** 30

/** The one a model would run on: the card with the most memory. */
function largest(cards: GraphicsCard[]): GraphicsCard | null {
  const real = cards.filter((card) => card.memoryBytes >= SMALLEST_CARD)
  return real.sort((a, b) => b.memoryBytes - a.memoryBytes)[0] ?? null
}

/**
 * The answer of `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`:
 * one line a card, "NVIDIA GeForce RTX 4070 Laptop GPU, 8188" (in MiB).
 */
export function readNvidiaSmi(text: string): GraphicsCard | null {
  const cards = text
    .split(/\r?\n/)
    .map((line) => /^(.+?),\s*(\d+)\s*$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: match[1]!.trim(), memoryBytes: Number(match[2]) * MIB }))
  return largest(cards)
}

/**
 * The answer of `reg query HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-…} /s` on
 * Windows: a block a display adapter (…\0000, …\0001), with its name (DriverDesc) and the
 * memory of the card in HardwareInformation.qwMemorySize (a 64-bit number), or, from older
 * drivers, HardwareInformation.MemorySize (32 bits, as a number or as four bytes).
 * The usual WMI answer (AdapterRAM) stops at 4 GB, which is why it is not used.
 */
export function readWindowsRegistry(text: string): GraphicsCard | null {
  const cards = new Map<string, { name: string; memoryBytes: number }>()
  let adapter: string | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (/^HKEY_/i.test(line)) {
      adapter = /\\(\d{4})(?:\\|$)/.exec(line)?.[1] ?? null
      continue
    }
    if (!adapter) continue
    const value = /^\s+(\S[^\t]*?)\s{2,}(REG_\w+)\s{2,}(.*)$/.exec(line) ?? /^\s+(\S+)\s+(REG_\w+)\s+(.*)$/.exec(line)
    if (!value) continue
    const [, name, type, data] = value as unknown as [string, string, string, string]
    const card = cards.get(adapter) ?? { name: '', memoryBytes: 0 }
    if (name === 'DriverDesc') card.name = data.trim()
    else if (name === 'HardwareInformation.qwMemorySize') card.memoryBytes = Math.max(card.memoryBytes, Number(BigInt(data.trim())))
    else if (name === 'HardwareInformation.MemorySize' && card.memoryBytes === 0) {
      const bytes = type === 'REG_BINARY' ? littleEndian(data.trim()) : Number(data.trim())
      if (Number.isFinite(bytes)) card.memoryBytes = bytes
    }
    cards.set(adapter, card)
  }
  return largest([...cards.values()].filter((card) => card.name !== ''))
}

/** "00000080" (four bytes, the lowest first) -> 0x80000000. */
function littleEndian(hex: string): number {
  const bytes = hex.match(/../g) ?? []
  return bytes.reduceRight((total, byte) => total * 256 + parseInt(byte, 16), 0)
}
