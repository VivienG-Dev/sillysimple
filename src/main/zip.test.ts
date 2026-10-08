import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createZip, openZip } from './zip'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'silly-zip-'))

async function archive(files: Record<string, Uint8Array>, options?: { compress?: boolean }): Promise<string> {
  const file = join(scratch(), 'test.zip')
  const zip = await createZip(file)
  for (const [name, data] of Object.entries(files)) await zip.add(name, data, options)
  await zip.close()
  return file
}

const text = (value: string): Buffer => Buffer.from(value, 'utf8')
const hasUnzip = ((): boolean => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe('zip archives', () => {
  it('gives back what was put in, names with accents and spaces included', async () => {
    const picture = Buffer.from(Array.from({ length: 5000 }, (_, index) => (index * 37) % 251))
    const file = await archive({
      'settings.json': text('{"a":1}'.repeat(200)),
      'characters/Élodie la fée.png': picture,
      'empty.txt': new Uint8Array(),
    })

    const zip = await openZip(file)
    expect(zip.entries).toEqual([
      { name: 'settings.json', size: 1400 },
      { name: 'characters/Élodie la fée.png', size: 5000 },
      { name: 'empty.txt', size: 0 },
    ])
    expect((await zip.read('settings.json')).toString('utf8')).toBe('{"a":1}'.repeat(200))
    expect((await zip.read('characters/Élodie la fée.png')).equals(picture)).toBe(true)
    expect((await zip.read('empty.txt')).length).toBe(0)
    await zip.close()
  })

  it('makes text smaller, and leaves alone what asks not to be compressed', async () => {
    const repeated = text('the same line again and again\n'.repeat(1000))
    const packed = readFileSync(await archive({ 'a.txt': repeated }))
    const stored = readFileSync(await archive({ 'a.txt': repeated }, { compress: false }))
    expect(packed.length).toBeLessThan(repeated.length / 10)
    expect(stored.length).toBeGreaterThan(repeated.length)
  })

  it.runIf(hasUnzip)('writes archives other tools can open', async () => {
    const file = await archive({ 'folder/hello.txt': text('hello\n'.repeat(50)), 'stored.bin': text('raw') })
    expect(() => execFileSync('unzip', ['-t', file], { stdio: 'pipe' })).not.toThrow()
    expect(execFileSync('unzip', ['-p', file, 'folder/hello.txt']).toString('utf8')).toBe('hello\n'.repeat(50))
  })

  it.runIf(hasUnzip)('reads archives made by other tools', async () => {
    const folder = scratch()
    writeFileSync(join(folder, 'note.txt'), 'made elsewhere\n'.repeat(40))
    execFileSync('zip', ['-q', 'other.zip', 'note.txt'], { cwd: folder })

    const zip = await openZip(join(folder, 'other.zip'))
    expect((await zip.read('note.txt')).toString('utf8')).toBe('made elsewhere\n'.repeat(40))
    await zip.close()
  })

  it('refuses a file that is not an archive', async () => {
    const file = join(scratch(), 'not.zip')
    writeFileSync(file, 'just some text, long enough to hold an end record: ' + 'x'.repeat(100))
    await expect(openZip(file)).rejects.toThrow('not a zip archive')
  })

  it('notices a file whose content was damaged', async () => {
    const file = await archive({ 'a.txt': text('important words that must not change') }, { compress: false })
    const bytes = readFileSync(file)
    bytes[40] = bytes[40]! ^ 0xff // Inside the stored text.
    writeFileSync(file, bytes)

    const zip = await openZip(file)
    await expect(zip.read('a.txt')).rejects.toThrow('damaged')
    await zip.close()
  })

  it('says so when a file is not in the archive', async () => {
    const zip = await openZip(await archive({ 'a.txt': text('a') }))
    await expect(zip.read('b.txt')).rejects.toThrow('no file named b.txt')
    await zip.close()
  })
})
