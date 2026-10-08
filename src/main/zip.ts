import { open, type FileHandle } from 'node:fs/promises'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { crc32 } from '@core/cards/png'

// A backup is an ordinary .zip file, so that anyone can open one and see what is in
// it. Writing and reading the few things a backup needs takes little code, and saves
// the app a dependency: files are stored one after the other, each compressed on its
// own ("deflate") or left as it is, followed by a list of what the archive holds.
//
// Not supported, because a backup never needs it: archives over 4 GB (zip64),
// encryption, several disks. Reading one of those fails with a clear message.

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_ARCHIVE = 0x06054b50
const NAMES_ARE_UTF8 = 0x0800
const STORED = 0
const DEFLATED = 8
const LIMIT = 0xffffffff

export interface ZipEntry {
  name: string
  /** Size of the file once taken out of the archive. */
  size: number
}

interface Located extends ZipEntry {
  method: number
  crc: number
  compressedSize: number
  offset: number
}

/**
 * Writes an archive, one file at a time: only one file is in memory at once.
 * Call `add` for each file, then `close`.
 */
export async function createZip(file: string): Promise<{
  add(name: string, data: Uint8Array, options?: { compress?: boolean }): Promise<void>
  close(): Promise<void>
}> {
  const handle = await open(file, 'w')
  const written: Located[] = []
  let position = 0
  const { time, date } = dosTime(new Date())

  const write = async (bytes: Uint8Array): Promise<void> => {
    await handle.write(bytes)
    position += bytes.length
  }

  return {
    async add(name, data, options = {}) {
      // Pictures are compressed already: squeezing them again only costs time.
      const packed = options.compress === false ? null : deflateRawSync(data)
      const body = packed && packed.length < data.length ? packed : data
      const entry: Located = {
        name,
        size: data.length,
        method: body === data ? STORED : DEFLATED,
        crc: crc32(data),
        compressedSize: body.length,
        offset: position,
      }
      if (entry.size > LIMIT || position + body.length > LIMIT) throw new Error('This is too large for a backup file.')

      const nameBytes = Buffer.from(name, 'utf8')
      const header = Buffer.alloc(30)
      header.writeUInt32LE(LOCAL_HEADER, 0)
      header.writeUInt16LE(20, 4) // Version needed to read it.
      header.writeUInt16LE(NAMES_ARE_UTF8, 6)
      header.writeUInt16LE(entry.method, 8)
      header.writeUInt16LE(time, 10)
      header.writeUInt16LE(date, 12)
      header.writeUInt32LE(entry.crc, 14)
      header.writeUInt32LE(entry.compressedSize, 18)
      header.writeUInt32LE(entry.size, 22)
      header.writeUInt16LE(nameBytes.length, 26)
      await write(header)
      await write(nameBytes)
      await write(body)
      written.push(entry)
    },

    async close() {
      try {
        const start = position
        for (const entry of written) {
          const nameBytes = Buffer.from(entry.name, 'utf8')
          const header = Buffer.alloc(46)
          header.writeUInt32LE(CENTRAL_HEADER, 0)
          header.writeUInt16LE(20, 4) // Version that wrote it.
          header.writeUInt16LE(20, 6)
          header.writeUInt16LE(NAMES_ARE_UTF8, 8)
          header.writeUInt16LE(entry.method, 10)
          header.writeUInt16LE(time, 12)
          header.writeUInt16LE(date, 14)
          header.writeUInt32LE(entry.crc, 16)
          header.writeUInt32LE(entry.compressedSize, 20)
          header.writeUInt32LE(entry.size, 24)
          header.writeUInt16LE(nameBytes.length, 28)
          header.writeUInt32LE(entry.offset, 42)
          await write(header)
          await write(nameBytes)
        }

        const end = Buffer.alloc(22)
        end.writeUInt32LE(END_OF_ARCHIVE, 0)
        end.writeUInt16LE(written.length, 8)
        end.writeUInt16LE(written.length, 10)
        end.writeUInt32LE(position - start, 12)
        end.writeUInt32LE(start, 16)
        await write(end)
      } finally {
        await handle.close()
      }
    },
  }
}

/**
 * Opens an archive to read it. `entries` lists what it holds; `read` takes one file
 * out, checked against the checksum the archive keeps for it.
 */
export async function openZip(file: string): Promise<{
  entries: ZipEntry[]
  read(name: string): Promise<Buffer>
  close(): Promise<void>
}> {
  const handle = await open(file, 'r')
  try {
    const located = await readDirectory(handle)
    const byName = new Map(located.map((entry) => [entry.name, entry]))

    return {
      entries: located.map(({ name, size }) => ({ name, size })),

      async read(name) {
        const entry = byName.get(name)
        if (!entry) throw new Error(`The archive has no file named ${name}.`)

        // The file's own header says how long its name and extra fields are.
        const header = await readAt(handle, entry.offset, 30)
        if (header.readUInt32LE(0) !== LOCAL_HEADER) throw new Error(DAMAGED)
        const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
        const body = await readAt(handle, start, entry.compressedSize)

        let data: Buffer
        if (entry.method === STORED) data = body
        else if (entry.method === DEFLATED) data = inflateRawSync(body, { maxOutputLength: Math.max(entry.size, 1) })
        else throw new Error('This archive is compressed in a way SillySimple cannot read.')

        if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(DAMAGED)
        return data
      },

      close: () => handle.close(),
    }
  } catch (error) {
    await handle.close()
    throw error
  }
}

const DAMAGED = 'This file is damaged, or it is not a zip archive.'

/** Finds the list of files at the end of the archive and reads it. */
async function readDirectory(handle: FileHandle): Promise<Located[]> {
  const { size } = await handle.stat()
  // The end record is the last thing in the file, unless a comment follows it (64 KB at most).
  const tailLength = Math.min(size, 22 + 0xffff)
  const tail = await readAt(handle, size - tailLength, tailLength)
  let end = -1
  for (let index = tail.length - 22; index >= 0; index--) {
    if (tail.readUInt32LE(index) === END_OF_ARCHIVE) {
      end = index
      break
    }
  }
  if (end === -1) throw new Error(DAMAGED)

  const count = tail.readUInt16LE(end + 10)
  const length = tail.readUInt32LE(end + 12)
  const start = tail.readUInt32LE(end + 16)
  if (count === 0xffff || length === LIMIT || start === LIMIT) throw new Error('This archive is too large for SillySimple.')
  if (start + length > size) throw new Error(DAMAGED)

  const directory = await readAt(handle, start, length)
  const entries: Located[] = []
  let position = 0
  for (let index = 0; index < count; index++) {
    if (position + 46 > directory.length || directory.readUInt32LE(position) !== CENTRAL_HEADER) throw new Error(DAMAGED)
    const flags = directory.readUInt16LE(position + 8)
    if (flags & 1) throw new Error('This archive is protected by a password.')
    const nameLength = directory.readUInt16LE(position + 28)
    const next = position + 46 + nameLength + directory.readUInt16LE(position + 30) + directory.readUInt16LE(position + 32)
    if (next > directory.length) throw new Error(DAMAGED)

    entries.push({
      name: directory.toString('utf8', position + 46, position + 46 + nameLength),
      method: directory.readUInt16LE(position + 10),
      crc: directory.readUInt32LE(position + 16),
      compressedSize: directory.readUInt32LE(position + 20),
      size: directory.readUInt32LE(position + 24),
      offset: directory.readUInt32LE(position + 42),
    })
    position = next
  }
  return entries
}

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  if (bytesRead !== length) throw new Error(DAMAGED)
  return buffer
}

/** Dates in a zip are in the old MS-DOS layout: two 16-bit numbers, to the nearest two seconds. */
function dosTime(now: Date): { time: number; date: number } {
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    date: ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  }
}
