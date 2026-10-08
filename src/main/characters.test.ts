import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPngTextChunks } from '@core/cards/png'
import { EMPTY_CHARACTER } from '@shared/defaults'
import {
  cardFile,
  createCharacter,
  getCharacter,
  importCards,
  initCharacters,
  listCharacters,
  portraitFile,
  setFavorite,
  setVoice,
  updateCharacter,
} from './characters'

// A minimal PNG card: signature, then a tEXt chunk "chara" holding base64 JSON, then IEND.
function pngCard(name: string): Uint8Array {
  const json = JSON.stringify({ spec: 'chara_card_v2', data: { name, first_mes: `I am ${name}.`, tags: ['Test'] } })
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json))) // UTF-8 first, like real cards
  const text = new TextEncoder().encode(`chara\0${base64}`)
  const chunk = (type: string, data: Uint8Array): number[] => {
    const length = new Uint8Array(4)
    new DataView(length.buffer).setUint32(0, data.length)
    return [...length, ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0]
  }
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('tEXt', text), ...chunk('IEND', new Uint8Array())])
}

// A picture without any card inside, as the editor sends one: signature, some "pixels", IEND.
function picture(marker: number): Uint8Array {
  const chunk = (type: string, data: number[]): number[] => [0, 0, 0, data.length, ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0]
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IDAT', [marker, marker, marker]), ...chunk('IEND', [])])
}

const readJson = (file: string): { data: Record<string, unknown> } => JSON.parse(readFileSync(file, 'utf8'))

function scratchFolder(): string {
  return mkdtempSync(join(tmpdir(), 'silly-cards-'))
}

/** A characters folder that already holds two .json cards: "elara-voss" and "professor-quill". */
async function folderWithTwo(): Promise<string> {
  const folder = join(scratchFolder(), 'characters')
  await initCharacters(folder)
  await createCharacter({ ...EMPTY_CHARACTER, name: 'Elara Voss', description: '{{char}} keeps the Saltmere light.', firstMessage: 'You are late.' })
  await createCharacter({ ...EMPTY_CHARACTER, name: 'Professor Quill', firstMessage: 'Sit down.' })
  return folder
}

describe('characters folder', () => {
  it('starts empty, and leaves alone what is already there', async () => {
    const folder = join(scratchFolder(), 'characters')

    // No character is written for the user: the app's own are the ready-to-play scenarios.
    await initCharacters(folder)
    expect(await listCharacters()).toEqual([])

    writeFileSync(join(folder, 'mira.png'), pngCard('Mira'))
    await initCharacters(folder)
    expect(readdirSync(folder)).toEqual(['mira.png'])
  })

  it('imports PNG and JSON cards, and reports the files that are not cards', async () => {
    const downloads = scratchFolder()
    writeFileSync(join(downloads, 'Some Download (3).png'), pngCard('Nyx Ærin'))
    writeFileSync(join(downloads, 'card.json'), JSON.stringify({ name: 'Juno Kade', first_mes: 'Signal lost.' }))
    writeFileSync(join(downloads, 'holiday.png'), new Uint8Array([1, 2, 3]))
    writeFileSync(join(downloads, 'notes.txt'), 'hello')
    await initCharacters(join(scratchFolder(), 'characters'))

    const result = await importCards(
      ['Some Download (3).png', 'card.json', 'holiday.png', 'notes.txt'].map((file) => join(downloads, file)),
    )

    // Files are renamed after the character, not after the download.
    expect(result.imported.map((character) => character.id)).toEqual(['nyx-ærin', 'juno-kade'])
    expect(result.failed).toEqual([
      { file: 'holiday.png', error: 'This file is not a PNG image.' },
      { file: 'notes.txt', error: 'Only .png and .json cards can be imported.' },
    ])

    const nyx = await getCharacter('nyx-ærin')
    expect(nyx).toMatchObject({ name: 'Nyx Ærin', firstMessage: 'I am Nyx Ærin.', tags: ['Test'] })
    expect(nyx?.portraitUrl).toMatch(/^card:\/\/portrait\/nyx-%C3%A6rin\?v=\d+$/)
    expect((await getCharacter('juno-kade'))?.portraitUrl).toBeUndefined()
    expect(await listCharacters()).toHaveLength(2)
  })

  it('keeps both cards when the same character is imported twice', async () => {
    const downloads = scratchFolder()
    writeFileSync(join(downloads, 'a.png'), pngCard('Aldric'))
    await initCharacters(join(scratchFolder(), 'characters'))

    await importCards([join(downloads, 'a.png')])
    const second = await importCards([join(downloads, 'a.png')])

    expect(second.imported[0]?.id).toBe('aldric-2')
  })

  it('only serves pictures of cards that are in the folder', async () => {
    const downloads = scratchFolder()
    writeFileSync(join(downloads, 'a.png'), pngCard('Aldric'))
    const folder = await folderWithTwo()
    await importCards([join(downloads, 'a.png')])

    expect(await portraitFile('aldric')).toBe(join(folder, 'aldric.png'))
    expect(await cardFile('elara-voss')).toBe(join(folder, 'elara-voss.json'))
    expect(await cardFile('../settings')).toBeNull()
    expect(await portraitFile('elara-voss')).toBeNull() // a JSON card has no picture
    expect(await portraitFile('../settings')).toBeNull()
    expect(await getCharacter('nobody')).toBeNull()
  })

  it('creates a character as a .json card, or as a .png when it has a picture', async () => {
    const folder = join(scratchFolder(), 'characters')
    await initCharacters(folder)
    const draft = { ...EMPTY_CHARACTER, name: 'Nyx Ærin', tagline: 'Night pilot', firstMessage: 'Strap in.', alternateGreetings: ['Engines cold.'] }

    const plain = await createCharacter(draft)
    const pictured = await createCharacter({ ...draft, name: 'Nyx Ærin' }, picture(9))

    expect(plain).toMatchObject({ id: 'nyx-ærin', name: 'Nyx Ærin', tagline: 'Night pilot', alternateGreetings: ['Engines cold.'] })
    expect(plain.portraitUrl).toBeUndefined()
    expect(readJson(join(folder, 'nyx-ærin.json'))).toMatchObject({ spec: 'chara_card_v2', data: { first_mes: 'Strap in.' } })

    expect(pictured.id).toBe('nyx-ærin-2') // The name was taken.
    expect(pictured.portraitUrl).toMatch(/^card:/)
    expect([...readPngTextChunks(readFileSync(join(folder, 'nyx-ærin-2.png'))).keys()]).toEqual(['chara'])

    await expect(createCharacter({ ...draft, name: '   ' })).rejects.toThrow('needs a name')
  })

  it('marks a favourite in the card file, .json or .png, and changes nothing else in it', async () => {
    const folder = await folderWithTwo()
    writeFileSync(join(folder, 'nyx.png'), pngCard('Nyx'))
    const jsonBefore = readJson(join(folder, 'elara-voss.json'))

    expect((await setFavorite('elara-voss', true)).favorite).toBe(true)
    expect((await setFavorite('nyx', true)).favorite).toBe(true)
    expect((await listCharacters()).filter((character) => character.favorite).map((character) => character.id).sort()).toEqual(['elara-voss', 'nyx'])

    const jsonAfter = readJson(join(folder, 'elara-voss.json'))
    expect(jsonAfter.data['extensions']).toMatchObject({ fav: true })
    expect({ ...jsonAfter.data, extensions: null }).toEqual({ ...jsonBefore.data, extensions: null })
    expect((await getCharacter('nyx'))?.firstMessage).toBe('I am Nyx.')

    expect(await setFavorite('nyx', false)).not.toHaveProperty('favorite')
    await expect(setFavorite('nobody', true)).rejects.toThrow('no longer exists')
  })

  it('gives a character a voice in its card file, .json or .png, and takes it away', async () => {
    const folder = await folderWithTwo()
    writeFileSync(join(folder, 'nyx.png'), pngCard('Nyx'))

    expect((await setVoice('elara-voss', 'elevenlabs', { id: 'v1', name: 'Rachel' })).voices).toEqual({ elevenlabs: { id: 'v1', name: 'Rachel' } })
    expect((await setVoice('nyx', 'server', { id: 'alloy', name: 'Alloy' })).voices).toEqual({ server: { id: 'alloy', name: 'Alloy' } })
    // Read again from the files, as after a restart.
    expect((await getCharacter('elara-voss'))?.voices).toEqual({ elevenlabs: { id: 'v1', name: 'Rachel' } })
    expect(await getCharacter('nyx')).toMatchObject({ firstMessage: 'I am Nyx.', voices: { server: { id: 'alloy', name: 'Alloy' } } })
    expect(readJson(join(folder, 'elara-voss.json')).data).toMatchObject({ first_mes: 'You are late.', description: '{{char}} keeps the Saltmere light.' })

    expect(await setVoice('nyx', 'server', null)).not.toHaveProperty('voices')
    await expect(setVoice('nobody', 'server', null)).rejects.toThrow('no longer exists')
  })

  it('saves edits into the card file, keeping its name and what the editor does not show', async () => {
    const folder = await folderWithTwo()
    const file = join(folder, 'elara-voss.json')
    const card = readJson(file)
    card.data['character_book'] = { entries: [{ keys: ['lamp'], content: 'The lamp is cracked.' }] }
    card.data['creator'] = 'someone'
    writeFileSync(file, JSON.stringify(card))

    const elara = (await getCharacter('elara-voss'))!
    const updated = await updateCharacter('elara-voss', { ...elara, name: 'Elara Voss-Marlow', scenario: 'A calm dawn.' })

    // Renamed, but the file (and so the id, and the chats) stays.
    expect(updated).toMatchObject({ id: 'elara-voss', name: 'Elara Voss-Marlow', scenario: 'A calm dawn.' })
    expect(updated.lorebook?.entries).toHaveLength(1)
    expect(readJson(file).data).toMatchObject({ creator: 'someone', description: elara.description })
    expect(readdirSync(folder).filter((name) => name.endsWith('.tmp'))).toEqual([])
    await expect(updateCharacter('nobody', elara)).rejects.toThrow('no longer exists')
  })

  it('turns a .json card into a .png when it gets its first picture', async () => {
    const folder = await folderWithTwo()
    const quill = (await getCharacter('professor-quill'))!

    const updated = await updateCharacter('professor-quill', quill, picture(5))

    expect(updated.id).toBe('professor-quill')
    expect(updated.portraitUrl).toMatch(/^card:\/\/portrait\/professor-quill/)
    expect(readdirSync(folder).filter((name) => name.startsWith('professor-quill'))).toEqual(['professor-quill.png'])
    expect(await listCharacters()).toHaveLength(2)
  })

  it('edits a .png card in place: same picture unless a new one is given, every copy of the card updated', async () => {
    const downloads = scratchFolder()
    writeFileSync(join(downloads, 'a.png'), pngCard('Aldric'))
    const folder = join(scratchFolder(), 'characters')
    await initCharacters(folder)
    await importCards([join(downloads, 'a.png')])
    const aldric = (await getCharacter('aldric'))!

    await updateCharacter('aldric', { ...aldric, description: 'A tired knight.' })
    expect((await getCharacter('aldric'))?.description).toBe('A tired knight.')
    expect(readFileSync(join(folder, 'aldric.png')).includes(Buffer.from([9, 9, 9]))).toBe(false)

    await updateCharacter('aldric', { ...aldric, description: 'A rested knight.' }, picture(9))
    const bytes = readFileSync(join(folder, 'aldric.png'))
    expect(bytes.includes(Buffer.from([9, 9, 9]))).toBe(true) // The new picture.
    expect((await getCharacter('aldric'))?.description).toBe('A rested knight.')
    expect([...readPngTextChunks(bytes).keys()]).toEqual(['chara'])
  })
})
