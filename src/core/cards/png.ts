// A PNG character card is a normal picture with the card's JSON hidden in a text chunk.
// A PNG file is a signature followed by chunks: [length:4][type:4][data:length][crc:4].

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const latin1 = new TextDecoder('latin1')

/** The chunks a card can live in: `ccv3` for V3 cards, `chara` for V1 and V2. */
const CARD_KEYWORDS = ['ccv3', 'chara'] as const
export type CardKeyword = (typeof CARD_KEYWORDS)[number]

interface Chunk {
  type: string
  /** The whole chunk, length and CRC included. */
  bytes: Uint8Array
  data: Uint8Array
}

/** Walks the chunks of a PNG. Throws if the bytes are not a PNG. Stops quietly at a truncated chunk. */
function* chunksOf(bytes: Uint8Array): Generator<Chunk> {
  if (bytes.length < 8 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('This file is not a PNG image.')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8))
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) return // Truncated file: keep what was read so far.

    yield { type, bytes: bytes.subarray(offset, dataEnd + 4), data: bytes.subarray(dataStart, dataEnd) }
    if (type === 'IEND') return

    offset = dataEnd + 4
  }
}

/** The keyword of a text chunk ("chara", "Software"…), or null for any other chunk. */
function keywordOf(chunk: Chunk): string | null {
  if (chunk.type !== 'tEXt') return null
  const separator = chunk.data.indexOf(0)
  return separator > 0 ? latin1.decode(chunk.data.subarray(0, separator)) : null
}

/** Returns the text chunks of a PNG as keyword -> text. Throws if the bytes are not a PNG. */
export function readPngTextChunks(bytes: Uint8Array): Map<string, string> {
  const chunks = new Map<string, string>()
  for (const chunk of chunksOf(bytes)) {
    const keyword = keywordOf(chunk)
    if (keyword) chunks.set(keyword, latin1.decode(chunk.data.subarray(keyword.length + 1)))
  }
  return chunks
}

/**
 * Finds the card inside a PNG and returns it as parsed JSON.
 * V3 cards live in the `ccv3` chunk, V1 and V2 cards in `chara`; both hold base64-encoded JSON.
 */
export function readCardFromPng(bytes: Uint8Array): unknown {
  const cards = readCardsFromPng(bytes)
  const card = cards.get('ccv3') ?? cards.get('chara')
  if (card === undefined) throw new Error('This image has no character data inside. Is it a character card?')
  return card
}

/** Every card a PNG carries, by chunk. Tools often write the same character twice: once as V2, once as V3. */
export function readCardsFromPng(bytes: Uint8Array): Map<CardKeyword, unknown> {
  const texts = readPngTextChunks(bytes)
  const cards = new Map<CardKeyword, unknown>()

  for (const keyword of CARD_KEYWORDS) {
    const encoded = texts.get(keyword)
    if (encoded === undefined) continue
    try {
      const binary = atob(encoded.trim())
      const utf8 = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      cards.set(keyword, JSON.parse(new TextDecoder().decode(utf8)))
    } catch {
      throw new Error('The character data inside this image is damaged.')
    }
  }
  return cards
}

/**
 * Returns the picture `bytes` carrying the given cards, in place of any card it had.
 * The picture itself is not touched: only text chunks are removed and added.
 */
export function writeCardsToPng(bytes: Uint8Array, cards: Map<CardKeyword, unknown>): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.from(SIGNATURE)]
  let complete = false

  for (const chunk of chunksOf(bytes)) {
    if ((CARD_KEYWORDS as readonly string[]).includes(keywordOf(chunk) ?? '')) continue // The old card.

    if (chunk.type === 'IEND') {
      // The card goes last, right before the chunk that ends the file, where SillyTavern puts it.
      for (const [keyword, card] of cards) parts.push(textChunk(keyword, toBase64(JSON.stringify(card))))
      complete = true
    }
    parts.push(chunk.bytes)
  }
  if (!complete) throw new Error('This PNG image is incomplete.')

  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function textChunk(keyword: string, value: string): Uint8Array {
  const body = new TextEncoder().encode(`tEXt${keyword}\0${value}`) // Type, then data. Base64 is plain ASCII.
  const chunk = new Uint8Array(body.length + 8)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, body.length - 4)
  chunk.set(body, 4)
  view.setUint32(chunk.length - 4, crc32(body))
  return chunk
}

/** Text -> UTF-8 -> base64, in slices so that a big lorebook does not overflow the call stack. */
function toBase64(value: string): string {
  const utf8 = new TextEncoder().encode(value)
  let binary = ''
  for (let offset = 0; offset < utf8.length; offset += 0x8000) {
    binary += String.fromCharCode(...utf8.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

// The checksum that ends every PNG chunk (CRC-32, computed over the type and the data).
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
