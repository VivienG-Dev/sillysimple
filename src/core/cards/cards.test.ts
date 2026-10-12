import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { LorebookEntry } from '@shared/types'
import { applyDraft, applyFavorite, applyVoice, parseCard, parseCardFile, parseLorebookFile, toCardV2 } from './parseCard'
import { crc32, readCardFromPng, readCardsFromPng, readPngTextChunks, writeCardsToPng } from './png'

// --- helpers: build a tiny PNG with text chunks, the way card tools do ----------

function chunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(12 + data.length)
  new DataView(bytes.buffer).setUint32(0, data.length)
  bytes.set(new TextEncoder().encode(type), 4)
  bytes.set(data, 8)
  return bytes // The 4 CRC bytes stay at zero: readers of card data do not check them.
}

function textChunk(keyword: string, text: string): Uint8Array {
  return chunk('tEXt', new TextEncoder().encode(`${keyword}\0${text}`))
}

function png(...chunks: Uint8Array[]): Uint8Array {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', new Uint8Array(13)), ...chunks]
  parts.push(chunk('IEND', new Uint8Array(0)))
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

const base64Json = (value: unknown): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))

const v2 = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Mirèlle',
    description: '{{char}} runs a café.',
    personality: 'warm',
    scenario: 'A rainy morning.',
    first_mes: 'Bonjour, {{user}} ☕',
    mes_example: '<START>\n{{user}}: Hi\n{{char}}: Coffee?',
    creator_notes: 'A cosy slice-of-life character.\nSecond line of notes.',
    tags: ['Cosy', 42, 'Café'],
  },
}

// --- tests ----------------------------------------------------------------------

describe('parseCard', () => {
  it('reads a V2 card', () => {
    expect(parseCard(v2)).toEqual({
      name: 'Mirèlle',
      tagline: 'A cosy slice-of-life character.',
      description: '{{char}} runs a café.',
      personality: 'warm',
      scenario: 'A rainy morning.',
      firstMessage: 'Bonjour, {{user}} ☕',
      alternateGreetings: [],
      exampleMessages: '<START>\n{{user}}: Hi\n{{char}}: Coffee?',
      systemPrompt: '',
      postHistoryInstructions: '',
      tags: ['Cosy', 'Café'],
      lorebook: null,
    })
  })

  it('reads the other greetings and the instructions a card brings', () => {
    const card = parseCard({
      spec: 'chara_card_v2',
      data: {
        ...v2.data,
        alternate_greetings: ['Second opening.', '   ', 7, 'Third opening.'],
        system_prompt: 'Write as {{char}}. {{original}}',
        post_history_instructions: 'Stay brief.',
      },
    })
    expect(card.alternateGreetings).toEqual(['Second opening.', 'Third opening.'])
    expect(card.systemPrompt).toBe('Write as {{char}}. {{original}}')
    expect(card.postHistoryInstructions).toBe('Stay brief.')
  })

  it('reads a lorebook written the way the card specification says', () => {
    const { lorebook } = parseCard({
      spec: 'chara_card_v2',
      data: {
        name: 'X',
        character_book: {
          name: 'Saltmere',
          scan_depth: 3,
          token_budget: 500,
          entries: [
            {
              keys: ['harbor', 'harbour'],
              secondary_keys: ['night'],
              selective: true,
              content: 'The harbor floods at night.',
              enabled: true,
              insertion_order: 10,
              case_sensitive: true,
              position: 'after_char',
              name: 'Harbor',
            },
            { keys: ['lamp'], content: 'The lamp is cracked.', enabled: false, insertion_order: 5 },
          ],
        },
      },
    })

    expect(lorebook).toMatchObject({ name: 'Saltmere', scanDepth: 3, tokenBudget: 500 })
    expect(lorebook?.entries[0]).toEqual({
      name: 'Harbor',
      keys: ['harbor', 'harbour'],
      secondaryKeys: ['night'],
      selective: true,
      constant: false,
      enabled: true,
      caseSensitive: true,
      content: 'The harbor floods at night.',
      insertionOrder: 10,
      position: 'after_char',
      source: 0,
    })
    expect(lorebook?.entries[1]).toMatchObject({ enabled: false, position: 'before_char', insertionOrder: 5 })
  })

  it("reads a lorebook in SillyTavern's own layout, with its other field names", () => {
    const { lorebook } = parseCard({
      name: 'X',
      character_book: {
        entries: {
          0: { key: ['storm'], keysecondary: [], content: 'Storms come from the west.', order: 20, position: 1, comment: 'Weather' },
          1: { key: ['light'], content: 'Off.', disable: true, constant: true },
        },
      },
    })

    expect(lorebook?.entries[0]).toMatchObject({
      name: 'Weather',
      keys: ['storm'],
      insertionOrder: 20,
      position: 'after_char',
      enabled: true,
    })
    expect(lorebook?.entries[1]).toMatchObject({ enabled: false, constant: true, insertionOrder: 100 })
    expect(parseCard({ name: 'X', character_book: { entries: [] } }).lorebook).toBeNull()
  })

  it('reads a V3 card the same way', () => {
    const v3 = { spec: 'chara_card_v3', spec_version: '3.0', data: { ...v2.data, nickname: 'Mimi', assets: [] } }
    expect(parseCard(v3).name).toBe('Mirèlle')
  })

  it('reads an old flat V1 card, with empty text for what is missing', () => {
    const card = parseCard({ name: 'Old One', description: 'Ancient.', first_mes: 'Hm.' })
    expect(card).toMatchObject({ name: 'Old One', description: 'Ancient.', firstMessage: 'Hm.', scenario: '', tags: [] })
  })

  it('shortens long creator notes into a tagline', () => {
    const card = parseCard({ name: 'X', creator_notes: 'word '.repeat(40) })
    expect(card.tagline.length).toBeLessThanOrEqual(90)
    expect(card.tagline.endsWith('…')).toBe(true)
  })

  it('refuses things that are not cards', () => {
    expect(() => parseCard([1, 2])).toThrow('not a character card')
    expect(() => parseCard({ spec: 'chara_card_v2', data: { description: 'no name' } })).toThrow('no character name')
  })

  it('writes a V2 card that reads back identically', () => {
    const fields = parseCard(v2)
    expect(parseCard(toCardV2(fields))).toEqual(fields)
  })
})

describe('applyDraft', () => {
  const draft = {
    ...EMPTY_CHARACTER,
    name: '  Mirèlle Dufour ',
    tagline: 'Runs the café on the corner',
    description: 'New description.',
    firstMessage: 'Welcome back.',
    alternateGreetings: ['Closed today.', '  '],
    systemPrompt: 'Be warm.',
    tags: [' Cosy ', ''],
  }

  it('changes the edited fields and keeps everything else the card holds', () => {
    const original = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        ...v2.data,
        creator: 'someone',
        nickname: 'Mimi',
        character_book: { entries: [{ keys: ['café'], content: 'Opens at six.' }] },
        extensions: { depth_prompt: { depth: 4 }, sillysimple: { other: true } },
      },
    }
    const frozen = JSON.stringify(original)

    const card = applyDraft(original, draft)
    const data = card['data'] as Record<string, unknown>

    expect(card['spec']).toBe('chara_card_v3')
    expect(data).toMatchObject({
      name: 'Mirèlle Dufour',
      description: 'New description.',
      first_mes: 'Welcome back.',
      alternate_greetings: ['Closed today.'],
      system_prompt: 'Be warm.',
      tags: ['Cosy'],
      // Untouched: the editor does not show these.
      creator: 'someone',
      nickname: 'Mimi',
      creator_notes: v2.data.creator_notes,
      character_book: { entries: [{ keys: ['café'], content: 'Opens at six.' }] },
      extensions: { depth_prompt: { depth: 4 }, sillysimple: { other: true, tagline: 'Runs the café on the corner' } },
    })
    expect(JSON.stringify(original)).toBe(frozen) // The card passed in is not modified.
    expect(parseCard(card).tagline).toBe('Runs the café on the corner')
  })

  it('also updates the copies SillyTavern keeps next to `data`', () => {
    const card = applyDraft({ ...v2, name: 'Mirèlle', first_mes: 'old', fav: true }, draft)
    expect(card).toMatchObject({ name: 'Mirèlle Dufour', first_mes: 'Welcome back.', fav: true })
    expect(card).not.toHaveProperty('system_prompt') // Only the copies that were there.
  })

  it('turns an old flat card into a V2 card', () => {
    const card = applyDraft({ name: 'Old One', description: 'Ancient.', talkativeness: '0.5' }, draft)
    expect(card).toMatchObject({ spec: 'chara_card_v2', spec_version: '2.0' })
    expect(card).not.toHaveProperty('description')
    expect(card['data']).toMatchObject({ name: 'Mirèlle Dufour', talkativeness: '0.5', creator_notes: '' })
  })

  const lore = (fields: Partial<LorebookEntry>): LorebookEntry => ({
    name: '',
    keys: [],
    secondaryKeys: [],
    selective: false,
    constant: false,
    enabled: true,
    caseSensitive: false,
    content: '',
    insertionOrder: 100,
    position: 'before_char',
    source: null,
    ...fields,
  })

  const withBook = {
    spec: 'chara_card_v2',
    data: {
      ...v2.data,
      character_book: {
        name: 'Café lore',
        scan_depth: 3,
        extensions: { made_with: 'another app' },
        entries: [
          { id: 4, keys: ['oven'], content: 'The oven is older than the street.', enabled: true, insertion_order: 10, priority: 7, extensions: { probability: 80 } },
          { id: 9, keys: ['cat'], content: 'The cat is called Brioche.', enabled: true, insertion_order: 20, extensions: {} },
        ],
      },
    },
  }

  it('leaves the lorebook exactly as it is when the editor did not change it', () => {
    const card = applyDraft(withBook, draft)
    expect((card['data'] as Record<string, unknown>)['character_book']).toEqual(withBook.data.character_book)
  })

  it('saves edited, added and removed lorebook entries, keeping what the editor does not show', () => {
    const [oven] = parseCard(withBook).lorebook!.entries
    const card = applyDraft(withBook, {
      ...draft,
      lorebookEntries: [
        { ...oven!, keys: ['oven', 'bread'], content: 'The oven never cools.', constant: true },
        lore({ name: 'Rain', keys: ['rain'], content: 'It rains every Tuesday.' }),
      ],
    })
    const book = (card['data'] as Record<string, unknown>)['character_book'] as { entries: Record<string, unknown>[] }

    expect(book).toMatchObject({ name: 'Café lore', scan_depth: 3, extensions: { made_with: 'another app' } })
    expect(book.entries).toHaveLength(2) // The cat entry was removed.
    expect(book.entries[0]).toMatchObject({
      id: 4,
      keys: ['oven', 'bread'],
      content: 'The oven never cools.',
      constant: true,
      priority: 7,
      extensions: { probability: 80 },
    })
    expect(book.entries[1]).toMatchObject({ id: 10, name: 'Rain', comment: 'Rain', keys: ['rain'], enabled: true, extensions: {} })

    // And it reads back as it was written.
    expect(parseCard(card).lorebook?.entries.map((entry) => entry.content)).toEqual([
      'The oven never cools.',
      'It rains every Tuesday.',
    ])
  })

  it('gives a lorebook to a character that had none', () => {
    const card = toCardV2({ ...draft, lorebookEntries: [lore({ keys: ['harbor'], content: 'It floods.' })] })
    expect(parseCard(card).lorebook?.entries).toMatchObject([{ keys: ['harbor'], content: 'It floods.', source: 0 }])
  })

  it("rewrites entries from SillyTavern's own layout with the standard field names", () => {
    const stCard = { name: 'X', character_book: { entries: { 0: { key: ['storm'], content: 'West.', order: 20, disable: true, uid: 3 } } } }
    const [storm] = parseCard(stCard).lorebook!.entries

    const card = applyDraft(stCard, { ...draft, lorebookEntries: [{ ...storm!, enabled: true }] })
    const [written] = ((card['data'] as Record<string, unknown>)['character_book'] as { entries: Record<string, unknown>[] }).entries

    expect(written).toMatchObject({ keys: ['storm'], insertion_order: 20, enabled: true, uid: 3 })
    expect(written).not.toHaveProperty('disable')
    expect(written).not.toHaveProperty('key')
  })

  it('reads lorebook files in the three shapes people share them in', () => {
    const worldInfo = { entries: { 0: { key: ['storm'], content: 'West.', comment: 'Weather' } } }
    const book = { entries: [{ keys: ['oven'], content: 'Old.' }] }

    expect(parseLorebookFile(worldInfo)).toMatchObject([{ name: 'Weather', keys: ['storm'], source: null }])
    expect(parseLorebookFile(book)).toMatchObject([{ keys: ['oven'], source: null }])
    expect(parseLorebookFile(withBook)).toHaveLength(2)
    expect(() => parseLorebookFile({ name: 'A card without a lorebook' })).toThrow('no lorebook entries')
  })

  it('remembers a tagline that was emptied on purpose', () => {
    const card = applyDraft(v2, { ...draft, tagline: '' })
    expect(parseCard(card).tagline).toBe('') // Not the first line of the creator's notes again.
  })
})

describe('favourites', () => {
  const card = { spec: 'chara_card_v2', data: { name: 'Mara', extensions: { depth_prompt: { depth: 4 } }, creator_notes: 'Keep me.' } }

  it('leaves a card that was never marked without the field', () => {
    expect(parseCard(card)).not.toHaveProperty('favorite')
  })

  it('marks a card where SillyTavern looks for it, and nothing else changes', () => {
    const liked = applyFavorite(card, true)
    expect(parseCard(liked).favorite).toBe(true)
    expect(liked).toEqual({
      spec: 'chara_card_v2',
      data: { name: 'Mara', extensions: { depth_prompt: { depth: 4 }, fav: true }, creator_notes: 'Keep me.' },
    })
    expect(card.data.extensions).not.toHaveProperty('fav') // The original is not touched.
  })

  it('removes the mark', () => {
    expect(parseCard(applyFavorite(applyFavorite(card, true), false))).not.toHaveProperty('favorite')
  })

  it('reads the mark of a card liked in SillyTavern, wherever it wrote it', () => {
    expect(parseCard({ data: { name: 'A', extensions: { fav: true } } }).favorite).toBe(true)
    expect(parseCard({ fav: true, data: { name: 'A' } }).favorite).toBe(true)
    expect(parseCard({ fav: 'true', data: { name: 'A' } }).favorite).toBe(true) // Old exports wrote it as text.
    expect(parseCard({ name: 'Old card', fav: true }).favorite).toBe(true) // V1: everything at the top.
    expect(parseCard({ fav: false, data: { name: 'A', extensions: { fav: false } } })).not.toHaveProperty('favorite')
  })

  it('keeps both of SillyTavern\'s marks in step', () => {
    const both = { fav: true, data: { name: 'A', extensions: { fav: true } } }
    expect(applyFavorite(both, false)).toEqual({ fav: false, data: { name: 'A', extensions: { fav: false } } })
  })

  it('leaves a V1 card a V1 card', () => {
    expect(applyFavorite({ name: 'Old card', description: 'Flat.' }, true)).toEqual({ name: 'Old card', description: 'Flat.', fav: true })
  })
})

describe('PNG cards', () => {
  it('lists the text chunks of a PNG', () => {
    const chunks = readPngTextChunks(png(textChunk('Software', 'test'), textChunk('chara', 'abc')))
    expect([...chunks]).toEqual([
      ['Software', 'test'],
      ['chara', 'abc'],
    ])
  })

  it('reads the card hidden in the `chara` chunk, accents and emoji included', () => {
    const card = parseCardFile('Mirelle.PNG', png(textChunk('chara', base64Json(v2))))
    expect(card.name).toBe('Mirèlle')
    expect(card.firstMessage).toBe('Bonjour, {{user}} ☕')
  })

  it('prefers the V3 chunk when a card carries both', () => {
    const v3 = { spec: 'chara_card_v3', data: { ...v2.data, name: 'Newer' } }
    const bytes = png(textChunk('chara', base64Json(v2)), textChunk('ccv3', base64Json(v3)))
    expect(parseCard(readCardFromPng(bytes)).name).toBe('Newer')
  })

  it('explains what is wrong with a file', () => {
    expect(() => parseCardFile('photo.png', png())).toThrow('no character data inside')
    expect(() => parseCardFile('fake.png', new TextEncoder().encode('hello'))).toThrow('not a PNG image')
    expect(() => parseCardFile('broken.png', png(textChunk('chara', '%%%')))).toThrow('damaged')
    expect(() => parseCardFile('notes.json', new TextEncoder().encode('{oops'))).toThrow('not valid JSON')
  })

  it('writes a card into a picture, in place of the one it had', () => {
    const pixels = chunk('IDAT', new Uint8Array([1, 2, 3, 4]))
    const picture = png(textChunk('Software', 'test'), textChunk('chara', base64Json({ name: 'Old' })), pixels)
    const v3 = { spec: 'chara_card_v3', data: { ...v2.data, name: 'Mirèlle ☕' } }

    const written = writeCardsToPng(picture, new Map([['chara', v2], ['ccv3', v3]] as const))

    expect(readCardsFromPng(written)).toEqual(new Map([['ccv3', v3], ['chara', v2]] as const))
    expect([...readPngTextChunks(written).keys()]).toEqual(['Software', 'chara', 'ccv3'])
    // The picture itself is carried over byte for byte, and the file still ends with IEND.
    expect(Buffer.from(written).includes(Buffer.from(pixels))).toBe(true)
    expect(Buffer.from(written.subarray(-8, -4)).toString('latin1')).toBe('IEND')
    expect(() => writeCardsToPng(picture.subarray(0, picture.length - 12), new Map())).toThrow('incomplete')
  })

  it('computes the checksum PNG readers expect', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('reads a JSON card file', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(v2))
    expect(parseCardFile('mirelle.json', bytes).name).toBe('Mirèlle')
  })
})

describe('the voice of a character', () => {
  const card = { spec: 'chara_card_v2', data: { name: 'Mira', first_mes: 'Hi.', extensions: { fav: true, depth_prompt: { depth: 4 }, sillysimple: { tagline: 'Guide' } } } }

  it('is kept in the app’s own corner of the card, one per voice service', () => {
    const voiced = applyVoice(applyVoice(card, 'elevenlabs', { id: 'v1', name: 'Rachel' }), 'server', { id: 'af_heart', name: 'af_heart' })
    expect(parseCard(voiced).voices).toEqual({ elevenlabs: { id: 'v1', name: 'Rachel' }, server: { id: 'af_heart', name: 'af_heart' } })
    // Nothing else in the card moved.
    const data = voiced['data'] as Record<string, unknown>
    expect(data['extensions']).toEqual({
      fav: true,
      depth_prompt: { depth: 4 },
      sillysimple: { tagline: 'Guide', voices: { elevenlabs: { id: 'v1', name: 'Rachel' }, server: { id: 'af_heart', name: 'af_heart' } } },
    })
    expect(parseCard(voiced)).toMatchObject({ name: 'Mira', tagline: 'Guide', favorite: true })
    expect(card.data.extensions.sillysimple).toEqual({ tagline: 'Guide' }) // The card given was not changed.
  })

  it('can be taken away, for one service without touching the other', () => {
    const voiced = applyVoice(applyVoice(card, 'elevenlabs', { id: 'v1', name: 'Rachel' }), 'server', { id: 'alloy', name: 'Alloy' })
    expect(parseCard(applyVoice(voiced, 'elevenlabs', null)).voices).toEqual({ server: { id: 'alloy', name: 'Alloy' } })
    const none = applyVoice(applyVoice(voiced, 'elevenlabs', null), 'server', null)
    expect(parseCard(none)).not.toHaveProperty('voices')
    expect((none['data'] as { extensions: Record<string, unknown> }).extensions['sillysimple']).toEqual({ tagline: 'Guide' })
  })

  it('survives an edit of the character', () => {
    const voiced = applyVoice(card, 'elevenlabs', { id: 'v1', name: 'Rachel' })
    const edited = applyDraft(voiced, { ...parseCard(voiced), tagline: 'Caravan guide', description: 'New.' })
    expect(parseCard(edited)).toMatchObject({ tagline: 'Caravan guide', voices: { elevenlabs: { id: 'v1', name: 'Rachel' } } })
  })

  it('works on a card of the first format, and ignores what is not a voice', () => {
    const old = applyVoice({ name: 'Old', first_mes: 'Hi.' }, 'server', { id: 'alloy', name: 'Alloy' })
    expect(old['data']).toBeUndefined()
    expect(parseCard(old).voices).toEqual({ server: { id: 'alloy', name: 'Alloy' } })

    const odd = { name: 'Odd', extensions: { sillysimple: { voices: { elevenlabs: { id: '  ' }, server: 'alloy', other: { id: 'x' } } } } }
    expect(parseCard(odd)).not.toHaveProperty('voices')
    expect(parseCard({ name: 'Bare', extensions: { sillysimple: { voices: { server: { id: 'nova' } } } } }).voices).toEqual({ server: { id: 'nova', name: 'nova' } })
  })
})

describe('who wrote a card', () => {
  const card = (data: Record<string, unknown>) => ({ spec: 'chara_card_v2', data: { name: 'Lyra', ...data } })

  it('reads the creator, with the link the app keeps for them', () => {
    const parsed = parseCard(card({ creator: ' Ash ', extensions: { sillysimple: { creatorLink: 'https://example.com/ash' } } }))
    expect(parsed.creator).toEqual({ name: 'Ash', link: 'https://example.com/ash' })
  })

  it('has no creator when the card names none', () => {
    expect(parseCard(card({ creator: '  ' })).creator).toBeUndefined()
    expect(parseCard({ name: 'Flat' }).creator).toBeUndefined()
  })

  it('only takes a web address as a link', () => {
    const parsed = parseCard(card({ creator: 'Ash', extensions: { sillysimple: { creatorLink: 'javascript:alert(1)' } } }))
    expect(parsed.creator).toEqual({ name: 'Ash' })
  })

  it('keeps the creator when the card is edited', () => {
    const json = card({ creator: 'Ash', extensions: { sillysimple: { creatorLink: 'https://example.com/ash' } } })
    const edited = applyDraft(json, { ...EMPTY_CHARACTER, name: 'Lyra', tagline: 'New line' })
    expect(parseCard(edited).creator).toEqual({ name: 'Ash', link: 'https://example.com/ash' })
  })
})

describe('the tagline taken from the creator notes', () => {
  const tagline = (notes: string) => parseCard({ spec: 'chara_card_v2', data: { name: 'Ayaka', creator_notes: notes } }).tagline

  it('reads past the HTML and styles a card page is written in', () => {
    expect(tagline('<div class="luxe-container">\n<h2>The rainbow is here!\nMore</h2>\n</div>\n<style>:root{--a:1}</style>')).toBe('The rainbow is here!')
    expect(tagline('<style>body{color:red}</style><p>Hello <b>there</b></p>')).toBe('Hello there')
  })

  it('leaves out pictures and keeps the words of links', () => {
    expect(tagline('![](https://example.com/a.png)\n## A [knight](https://example.com) of old')).toBe('A knight of old')
  })
})
