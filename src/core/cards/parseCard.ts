import type { CardCreator, Character, CharacterDraft, Lorebook, LorebookEntry, VoiceChoice, VoiceService } from '@shared/types'
import { readCardFromPng } from './png'

// Reads and writes character cards in the formats SillyTavern, TavernAI and chub.ai use:
//   V1  { name, description, … }                              (flat)
//   V2  { spec: "chara_card_v2", data: { name, … } }
//   V3  { spec: "chara_card_v3", data: { name, … } }          (V2 fields plus extras)
// The app reads the fields it uses and leaves the rest of the file alone, so a card
// edited here still works everywhere else.

/** The part of a Character that comes from the card itself. */
export type CardFields = Omit<Character, 'id' | 'portraitUrl' | 'lastChatAt'>

const TAGLINE_MAX = 90

/** Reads a card from a file's bytes. The extension says whether it is a PNG or JSON. */
export function parseCardFile(fileName: string, bytes: Uint8Array): CardFields {
  return parseCard(readCardJson(fileName, bytes))
}

/** The card's JSON as it is in the file, without reading it into fields. */
export function readCardJson(fileName: string, bytes: Uint8Array): unknown {
  return /\.png$/i.test(fileName) ? readCardFromPng(bytes) : parseJsonBytes(bytes)
}

/**
 * What the author wrote to present the card (its `creator_notes`), as plain lines.
 * On sites like chub.ai this is the card's page: its first line is often a hook, the
 * next ones a short pitch.
 */
export function creatorNotes(json: unknown): string[] {
  if (!isRecord(json)) return []
  const data = isRecord(json['data']) ? json['data'] : json
  return plainLines(text(data['creator_notes']))
}

export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('This file is not valid JSON.')
  }
}

export function parseCard(json: unknown): CardFields {
  if (!isRecord(json)) throw new Error('This file is not a character card.')

  // V2 and V3 keep the fields under `data`; V1 has them at the top.
  const data = isRecord(json['data']) ? json['data'] : json
  const name = text(data['name']).trim()
  if (!name) throw new Error('This card has no character name.')

  return {
    name,
    tagline: taglineOf(data),
    description: text(data['description']),
    personality: text(data['personality']),
    scenario: text(data['scenario']),
    firstMessage: text(data['first_mes']),
    alternateGreetings: strings(data['alternate_greetings']).filter((greeting) => greeting.trim()),
    exampleMessages: text(data['mes_example']),
    systemPrompt: text(data['system_prompt']),
    postHistoryInstructions: text(data['post_history_instructions']),
    tags: strings(data['tags']),
    lorebook: parseLorebook(data['character_book']),
    ...creatorOf(data),
    ...(favoriteOf(json) && { favorite: true }),
    ...voicesOf(data),
  }
}

/**
 * Who wrote the card: the `creator` field every card format has, and where to find them.
 * Card formats have no field for a link, so it is the app's own, kept under
 * `extensions.sillysimple.creatorLink` (set by hand in the cards the app comes with).
 * Only an http(s) address is taken: the link is opened in the browser.
 */
function creatorOf(data: Record<string, unknown>): { creator?: CardCreator } {
  const name = text(data['creator']).trim()
  if (!name) return {}
  const extensions = isRecord(data['extensions']) ? data['extensions'] : {}
  const own = isRecord(extensions['sillysimple']) ? extensions['sillysimple'] : {}
  const link = text(own['creatorLink']).trim()
  return { creator: { name, ...(/^https?:\/\/\S+$/i.test(link) && { link }) } }
}

/**
 * The voices given to the character, one per voice service. They are the app's own
 * data, kept under `extensions.sillysimple.voices`: a voice only means something to
 * the service it comes from, and other apps leave that corner of the card alone.
 */
function voicesOf(data: Record<string, unknown>): { voices?: Partial<Record<VoiceService, VoiceChoice>> } {
  const extensions = isRecord(data['extensions']) ? data['extensions'] : {}
  const own = isRecord(extensions['sillysimple']) ? extensions['sillysimple'] : {}
  const stored = isRecord(own['voices']) ? own['voices'] : {}

  const voices: Partial<Record<VoiceService, VoiceChoice>> = {}
  for (const service of VOICE_SERVICES) {
    const voice = stored[service]
    if (isRecord(voice) && typeof voice['id'] === 'string' && voice['id'].trim()) {
      voices[service] = { id: voice['id'].trim(), name: text(voice['name']).trim() || voice['id'].trim() }
    }
  }
  return Object.keys(voices).length > 0 ? { voices } : {}
}

const VOICE_SERVICES: readonly VoiceService[] = ['elevenlabs', 'server']

/**
 * Returns the card `json` with the character's voice for `service` set, or taken away
 * when `voice` is null. Nothing else in it changes.
 */
export function applyVoice(json: unknown, service: VoiceService, voice: VoiceChoice | null): Record<string, unknown> {
  const card = isRecord(json) ? (structuredClone(json) as Record<string, unknown>) : {}
  const data = isRecord(card['data']) ? card['data'] : card
  const extensions = isRecord(data['extensions']) ? data['extensions'] : {}
  const own = isRecord(extensions['sillysimple']) ? extensions['sillysimple'] : {}

  const voices: Record<string, unknown> = { ...(isRecord(own['voices']) ? own['voices'] : {}) }
  if (voice) voices[service] = { id: voice.id, name: voice.name }
  else delete voices[service]

  const { voices: _before, ...rest } = own
  data['extensions'] = { ...extensions, sillysimple: Object.keys(voices).length > 0 ? { ...rest, voices } : rest }
  return card
}

/**
 * Whether the card is marked as a favourite. SillyTavern writes the mark in two places,
 * `data.extensions.fav` and a `fav` next to `data` (older cards only have that one): a card
 * liked there is liked here, and the other way round.
 */
function favoriteOf(card: Record<string, unknown>): boolean {
  const yes = (value: unknown): boolean => value === true || value === 'true'
  const data = isRecord(card['data']) ? card['data'] : card
  const extensions = isRecord(data['extensions']) ? data['extensions'] : {}
  return yes(extensions['fav']) || yes(card['fav'])
}

/**
 * Returns the card `json` marked, or no longer marked, as a favourite. Nothing else in
 * it changes, and a V1 card stays a V1 card.
 */
export function applyFavorite(json: unknown, favorite: boolean): Record<string, unknown> {
  const card = isRecord(json) ? (structuredClone(json) as Record<string, unknown>) : {}
  if (isRecord(card['data'])) {
    const data = card['data']
    data['extensions'] = { ...(isRecord(data['extensions']) ? data['extensions'] : {}), fav: favorite }
    if ('fav' in card) card['fav'] = favorite // Kept in step where SillyTavern repeats it.
  } else {
    card['fav'] = favorite
  }
  return card
}

/** Writes a new character as a V2 card, the most widely supported format. */
export function toCardV2(draft: CharacterDraft): Record<string, unknown> {
  return applyDraft(null, draft)
}

/**
 * Returns the card `json` with the editor's fields replaced by those of `draft`.
 * Everything the editor does not show (lorebook, creator notes, other apps' data…)
 * is kept. A flat V1 card becomes a V2 card; `null` starts a new V2 card.
 */
export function applyDraft(json: unknown, draft: CharacterDraft): Record<string, unknown> {
  const card = isRecord(json) ? (structuredClone(json) as Record<string, unknown>) : {}

  if (!isRecord(card['data'])) {
    // New card, or V1: the V1 fields move under `data`, where V2 keeps them.
    const flat = { ...card }
    for (const key of Object.keys(card)) delete card[key]
    card['spec'] = 'chara_card_v2'
    card['spec_version'] = '2.0'
    card['data'] = { ...BLANK_V2_DATA, ...flat }
  }
  const data = card['data'] as Record<string, unknown>

  const fields: Record<string, unknown> = {
    name: draft.name.trim(),
    description: draft.description,
    personality: draft.personality,
    scenario: draft.scenario,
    first_mes: draft.firstMessage,
    mes_example: draft.exampleMessages,
    alternate_greetings: draft.alternateGreetings.filter((greeting) => greeting.trim()),
    system_prompt: draft.systemPrompt,
    post_history_instructions: draft.postHistoryInstructions,
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
  }
  Object.assign(data, fields)

  // SillyTavern also repeats the V1 fields next to `data`, for old readers. Keep those in step.
  for (const [key, value] of Object.entries(fields)) {
    if (key in card) card[key] = value
  }

  // Cards have no "tagline" field. Apps may keep their own data under `extensions`.
  const extensions = isRecord(data['extensions']) ? data['extensions'] : {}
  const own = isRecord(extensions['sillysimple']) ? extensions['sillysimple'] : {}
  data['extensions'] = { ...extensions, sillysimple: { ...own, tagline: draft.tagline.trim() } }

  // The author, as the user signs the card. V1 readers find it next to `data` when the card has it there.
  if (draft.creatorName !== undefined) {
    data['creator'] = draft.creatorName.trim().slice(0, 80)
    if ('creator' in card) card['creator'] = data['creator']
  }

  if (draft.lorebookEntries) data['character_book'] = applyLorebook(data['character_book'], draft.lorebookEntries)

  return card
}

/**
 * Returns the card's lorebook with its entries replaced by those of the editor.
 * An entry that was already in the card keeps what the editor does not show
 * (its number, its data from other apps…); the book's own settings are kept too.
 */
function applyLorebook(book: unknown, entries: LorebookEntry[]): Record<string, unknown> {
  const original = isRecord(book) ? book : { name: '', extensions: {} }
  const before = rawEntries(original)
  let nextId = Math.max(0, ...before.map((entry) => (typeof entry['id'] === 'number' ? entry['id'] : 0))) + 1

  const written = entries.map((entry) => {
    const kept = entry.source === null ? undefined : { ...before[entry.source] }
    // SillyTavern's own names for the fields written below: they would only contradict them.
    for (const alias of ['key', 'keysecondary', 'disable', 'order']) delete kept?.[alias]
    return {
      // What a new entry starts with, then what the old one held, then what the editor shows.
      extensions: {},
      id: kept ? undefined : nextId++,
      ...kept,
      keys: entry.keys,
      secondary_keys: entry.secondaryKeys,
      selective: entry.selective,
      constant: entry.constant,
      enabled: entry.enabled,
      case_sensitive: entry.caseSensitive,
      content: entry.content,
      insertion_order: entry.insertionOrder,
      position: entry.position,
      name: entry.name,
      comment: entry.name,
    }
  })

  return { ...original, entries: written }
}

const BLANK_V2_DATA = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
  tags: [],
  creator: '',
  character_version: '',
  extensions: {},
}

/** Our own tagline if the card has one, otherwise the first line of the creator's notes. */
function taglineOf(data: Record<string, unknown>): string {
  const extensions = isRecord(data['extensions']) ? data['extensions'] : {}
  const own = isRecord(extensions['sillysimple']) ? extensions['sillysimple']['tagline'] : undefined
  // An empty tagline of our own is a choice (the user cleared it), not a missing one.
  if (typeof own === 'string') return own.trim()

  const firstLine = plainLines(text(data['creator_notes']))[0] ?? ''
  return firstLine.length > TAGLINE_MAX ? `${firstLine.slice(0, TAGLINE_MAX - 1).trimEnd()}…` : firstLine
}

/**
 * The lines of a text written for a web page, as plain text: creator notes are often
 * HTML with styles (chub.ai shows them as a page), or Markdown with pictures and links.
 * Tags, styles, scripts and pictures are left out, a link keeps its words; empty lines are dropped.
 */
export function plainLines(source: string): string[] {
  return source
    .replace(/<(style|script)\b[\s\S]*?(<\/\1\s*>|$)/gi, '\n')
    .replace(/<!--[\s\S]*?(-->|$)/g, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|br|hr|tr|table|section|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(#{1,6}\s+|[-*>]\s+)/, '').replace(/\*\*|__/g, '').trim())
    .filter(Boolean)
}

/**
 * Reads a lorebook file picked in the editor, to add its entries to a character.
 * Accepts a SillyTavern "world info" file, the `character_book` of a card on its own,
 * or a whole card that carries one. The entries come back as new ones (no `source`).
 */
export function parseLorebookFile(json: unknown): LorebookEntry[] {
  const inCard = isRecord(json) && isRecord(json['data']) ? json['data']['character_book'] : undefined
  const ofCard = isRecord(json) ? json['character_book'] : undefined
  const book = parseLorebook(inCard ?? ofCard ?? json)
  if (!book) throw new Error('This file has no lorebook entries.')
  return book.entries.map((entry) => ({ ...entry, source: null }))
}

/** The entries of a lorebook as they are in the file: a list, or (SillyTavern's own layout) an object. */
function rawEntries(book: Record<string, unknown>): Record<string, unknown>[] {
  const entries = Array.isArray(book['entries'])
    ? book['entries']
    : isRecord(book['entries'])
      ? Object.values(book['entries'])
      : []
  return entries.filter(isRecord)
}

/**
 * Reads the lorebook a card carries (`character_book`). Two layouts exist: the one
 * of the card specification, and SillyTavern's own "world info" export, with other
 * field names and the entries in an object. Both are accepted.
 */
function parseLorebook(book: unknown): Lorebook | null {
  if (!isRecord(book)) return null

  const entries = rawEntries(book).map((entry, index): LorebookEntry => {
    const enabled = typeof entry['enabled'] === 'boolean' ? entry['enabled'] : entry['disable'] !== true
    return {
      name: text(entry['name']) || text(entry['comment']),
      keys: strings(entry['keys'] ?? entry['key']),
      secondaryKeys: strings(entry['secondary_keys'] ?? entry['keysecondary']),
      selective: entry['selective'] === true,
      constant: entry['constant'] === true,
      enabled,
      caseSensitive: entry['case_sensitive'] === true,
      content: text(entry['content']),
      insertionOrder: number(entry['insertion_order'] ?? entry['order']) ?? 100,
      // SillyTavern's own export uses numbers: 0 = before the description, 1 = after.
      position: entry['position'] === 'after_char' || entry['position'] === 1 ? 'after_char' : 'before_char',
      source: index,
    }
  })
  if (entries.length === 0) return null

  return {
    name: text(book['name']),
    scanDepth: number(book['scan_depth']),
    tokenBudget: number(book['token_budget']),
    entries,
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
