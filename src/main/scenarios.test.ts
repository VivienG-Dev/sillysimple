import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCardFile } from '@core/cards/parseCard'
import { reviewCard } from '@core/cards/reviewCard'
import { adoptCard, initCharacters, listCharacters, updateCharacter } from './characters'
import { initScenarios, listScenarios, scenarioFile } from './scenarios'

function scratchFolder(): string {
  return mkdtempSync(join(tmpdir(), 'silly-scenarios-'))
}

const card = (data: Record<string, unknown>): string => JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data })

// A minimal PNG card: signature, then a tEXt chunk "chara" holding base64 JSON, then IEND.
function pngCard(data: Record<string, unknown>): Uint8Array {
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(card(data))))
  const text = new TextEncoder().encode(`chara\0${base64}`)
  const chunk = (type: string, bytes: Uint8Array): number[] => {
    const length = new Uint8Array(4)
    new DataView(length.buffer).setUint32(0, bytes.length)
    return [...length, ...new TextEncoder().encode(type), ...bytes, 0, 0, 0, 0]
  }
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('tEXt', text), ...chunk('IEND', new Uint8Array())])
}

const mira = {
  name: 'Mira',
  creator_notes: 'Caravan guide',
  description: 'Mira leads caravans. She knows every well. She hates maps.',
  scenario: '{{user}} hired {{char}} to cross the salt flats.',
  first_mes: 'You are late.',
  alternate_greetings: ['The well is dry.', '  '],
  tags: ['Fantasy', 'Adventure'],
}

describe('the scenarios the app comes with', () => {
  it('lists the cards of the folder, by name, with what the gallery shows', async () => {
    const folder = scratchFolder()
    writeFileSync(join(folder, 'mira.json'), card(mira))
    writeFileSync(join(folder, 'old-inspector.png'), pngCard({ name: 'Inspector Hale', first_mes: 'Sit down.' }))
    initScenarios(folder)

    const [hale, guide] = await listScenarios()
    expect(guide).toEqual({
      id: 'mira',
      name: 'Mira',
      tagline: 'Caravan guide',
      pitch: '{{user}} hired {{char}} to cross the salt flats.',
      tags: ['Fantasy', 'Adventure'],
      greetings: 2,
      pictureUrl: undefined,
    })
    expect(hale?.id).toBe('old-inspector')
    expect(hale?.greetings).toBe(1)
    const stamp = Math.round(statSync(join(folder, 'old-inspector.png')).mtimeMs)
    expect(hale?.pictureUrl).toBe(`card://scenario/old-inspector?v=${stamp}`)
  })

  it('puts the scenarios that have a picture first, and prefers the picture of two files of the same name', async () => {
    const folder = scratchFolder()
    writeFileSync(join(folder, 'abel.json'), card({ ...mira, name: 'Abel' }))
    writeFileSync(join(folder, 'zoe.png'), pngCard({ ...mira, name: 'Zoe' }))
    writeFileSync(join(folder, 'mira.json'), card({ ...mira, creator_notes: 'Without a picture' }))
    writeFileSync(join(folder, 'mira.png'), pngCard({ ...mira, creator_notes: 'With a picture' }))
    initScenarios(folder)

    const scenarios = await listScenarios()
    expect(scenarios.map((scenario) => scenario.id)).toEqual(['mira', 'zoe', 'abel'])
    expect(scenarios[0]?.tagline).toBe('With a picture')
    expect(await scenarioFile('mira')).toBe(join(folder, 'mira.png'))
  })

  it('gives a picture a new address when the file changes, so the old one is not shown', async () => {
    const folder = scratchFolder()
    const file = join(folder, 'mira.png')
    writeFileSync(file, pngCard(mira))
    initScenarios(folder)
    const before = (await listScenarios())[0]?.pictureUrl

    utimesSync(file, new Date(2030, 0, 1), new Date(2030, 0, 1))
    expect((await listScenarios())[0]?.pictureUrl).not.toBe(before)
  })

  it('tells the story from the description when the card has no scenario', async () => {
    const folder = scratchFolder()
    writeFileSync(join(folder, 'mira.json'), card({ ...mira, scenario: ' ' }))
    initScenarios(folder)
    expect((await listScenarios())[0]?.pitch).toBe('Mira leads caravans. She knows every well.')
  })

  it('leaves out what is not a card, and names that could not be an id', async () => {
    const folder = scratchFolder()
    writeFileSync(join(folder, 'mira.json'), card(mira))
    writeFileSync(join(folder, 'notes.txt'), 'to do')
    writeFileSync(join(folder, 'broken.json'), '{ not json')
    writeFileSync(join(folder, 'picture.png'), new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
    writeFileSync(join(folder, 'My Card.json'), card(mira))
    writeFileSync(join(folder, '.hidden.json'), card(mira))
    initScenarios(folder)
    expect((await listScenarios()).map((scenario) => scenario.id)).toEqual(['mira'])
  })

  it('is an empty gallery when the folder is missing', async () => {
    initScenarios(join(scratchFolder(), 'nowhere'))
    expect(await listScenarios()).toEqual([])
    expect(await scenarioFile('mira')).toBeNull()
  })

  it('only ever finds a file of its own folder', async () => {
    const folder = scratchFolder()
    writeFileSync(join(folder, 'mira.json'), card(mira))
    initScenarios(folder)
    expect(await scenarioFile('mira')).toBe(join(folder, 'mira.json'))
    for (const id of ['unknown', '', '../mira', 'mira.json', 'Mira', 'mira/', '..']) expect(await scenarioFile(id)).toBeNull()
  })
})

describe('playing a scenario', () => {
  async function library(): Promise<{ scenarios: string; characters: string }> {
    const scenarios = scratchFolder()
    const characters = scratchFolder()
    writeFileSync(join(scenarios, 'mira.json'), card(mira))
    initScenarios(scenarios)
    await initCharacters(characters)
    return { scenarios, characters }
  }

  it('makes it one of the user’s characters, under the same id', async () => {
    const { scenarios } = await library()
    const before = (await listCharacters()).length

    const played = await adoptCard((await scenarioFile('mira'))!, 'mira')
    expect(played.id).toBe('mira')
    expect(played.name).toBe('Mira')
    expect(played.firstMessage).toBe('You are late.')
    expect(await listCharacters()).toHaveLength(before + 1)
    // The scenario itself is left as it was.
    expect(readFileSync(join(scenarios, 'mira.json'), 'utf8')).toBe(card(mira))
  })

  it('is done once: played again, the user’s own character comes back, with what they changed', async () => {
    const { scenarios } = await library()
    const file = (await scenarioFile('mira'))!
    const played = await adoptCard(file, 'mira')
    await updateCharacter('mira', { ...played, tagline: 'My guide' })
    const count = (await listCharacters()).length

    const again = await adoptCard(file, 'mira')
    expect(again.tagline).toBe('My guide')
    expect(await listCharacters()).toHaveLength(count)
    expect(readFileSync(join(scenarios, 'mira.json'), 'utf8')).toBe(card(mira))
  })

  it('refuses a file that is not a card', async () => {
    const { scenarios } = await library()
    writeFileSync(join(scenarios, 'broken.json'), '{ not json')
    writeFileSync(join(scenarios, 'notes.txt'), card(mira))
    await expect(adoptCard(join(scenarios, 'broken.json'), 'broken')).rejects.toThrow()
    await expect(adoptCard(join(scenarios, 'notes.txt'), 'notes')).rejects.toThrow('This is not a character card.')
    await expect(adoptCard(join(scenarios, 'mira.json'), '../mira')).rejects.toThrow('This is not a character card.')
    expect((await listCharacters()).some((character) => ['broken', 'notes'].includes(character.id))).toBe(false)
  })
})

describe('the scenarios of this project', () => {
  it('that come with the app all have a picture', async () => {
    initScenarios(join(__dirname, '../../scenarios'))
    const scenarios = await listScenarios()
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    // Since 0.1.1, a story waits in scenarios/drafts until its picture is made.
    for (const scenario of scenarios) expect(scenario.pictureUrl, scenario.id).toBeDefined()
  })

  it('are all complete cards, with nothing left for the advice to say', async () => {
    // Those of the app, and those waiting for a picture: both are held to the same advice.
    const all = []
    for (const folder of [join(__dirname, '../../scenarios'), join(__dirname, '../../scenarios/drafts')]) {
      initScenarios(folder)
      for (const scenario of await listScenarios()) all.push({ scenario, file: (await scenarioFile(scenario.id))! })
    }
    expect(all.length).toBeGreaterThanOrEqual(8)
    expect(new Set(all.map(({ scenario }) => scenario.name)).size).toBe(all.length)

    // The app's own: written for it, held to its own advice. A partner's card (it names
    // its creator) comes as its author wrote it, and is only checked to be credited.
    for (const { scenario } of all.filter((item) => item.scenario.creator)) {
      expect(scenario.creator?.name.trim(), scenario.id).not.toBe('')
      expect(scenario.tagline, scenario.id).not.toBe('')
    }

    for (const { scenario, file } of all.filter((item) => !item.scenario.creator)) {
      expect(scenario.tagline, scenario.id).not.toBe('')
      expect(scenario.pitch, scenario.id).toContain('{{user}}')
      expect(scenario.greetings, scenario.id).toBeGreaterThan(1)
      expect(scenario.tags.length, scenario.id).toBeGreaterThan(0)

      const card = parseCardFile(basename(file), readFileSync(file))
      const notes = (card.lorebook?.entries ?? []).filter((entry) => entry.enabled && entry.content.trim())
      const tips = reviewCard({ ...card, loreCount: notes.length, loreKeys: notes.flatMap((entry) => entry.keys) })
      expect(tips.map((tip) => tip.id), scenario.id).toEqual([])
    }
  })
})
