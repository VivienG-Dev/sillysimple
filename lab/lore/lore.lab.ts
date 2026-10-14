import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { parseCardFile } from '@core/cards/parseCard'
import { describePullError } from '@core/engine/errors'
import { senseModel } from '@core/engine/models'
import { compareVersions } from '@core/engine/release'
import { keyMatches } from '@core/prompt/lorebook'
import { loreEntryText, lorePieces } from '@core/prompt/loreMeaning'
import { applyMacros } from '@core/prompt/macros'
import { embedWithOllama, listOllamaModels, ollamaVersion, pullOllamaModel, sameOllamaModel } from '@core/providers/ollama'
import { findOllama } from '../ollama'
import { CASES } from './cases'
import { DEPTHS, FORMS, writeReport, type LoreTrial } from './report'

// Do lorebook notes come when the chat talks about them without their keywords? Run with
// `pnpm lore:lab`. It asks the embedding model the app uses on this computer (see
// senseModel) for the vectors of every note of the eight stories that come with the app
// (scenarios/), in each way a note can be read, and of the sentences of each case
// (cases.ts); then tries every way of calling notes by meaning (src/core/prompt/loreMeaning.ts)
// and says how many it gets right. Two files come out, in lab/out:
//
//   lore-report.md     what to read: the best ways, then every case
//   lore-vectors.json  every vector, so that it can all be tried again without the model
//                      (`pnpm lore:replay`), after changing loreMeaning.ts or the cases
//                      (a new case or a changed one needs the model again)
//
// Which Ollama it asks: see ../ollama.ts.
//
//   LORE_LAB_MODEL=embeddinggemma-2:270m-bf16-text pnpm lore:lab     another model
//                                (its files are then named after it: lore-report-<model>.md)

const APP_MODEL = senseModel(process.platform, process.arch)
const MODEL = process.env['LORE_LAB_MODEL'] || APP_MODEL.id
const OUT = resolve('lab/out')
const AFTER = MODEL === APP_MODEL.id ? '' : `-${MODEL.replace(/[^a-z0-9.]+/gi, '-')}`
/** Who the user is in the cases: the name {{user}} stands for in the notes. */
const USER = 'Robin'
/** How many messages back the keywords are looked for, as the app does when a lorebook does not say. */
const KEY_DEPTH = 4

const say = (line = ''): void => console.log(line)

it('calls the notes of the stories by meaning, with the real model', async () => {
  const ollama = await findOllama()
  try {
    await run(ollama.url, ollama.what)
  } finally {
    await ollama.stop()
  }
})

async function run(url: string, what: string): Promise<void> {
  const version = (await ollamaVersion(url, 3000)) ?? '?'
  say(`\nOllama: ${what}, version ${version}, at ${url}`)
  if (compareVersions(version, APP_MODEL.needsOllama) < 0) {
    throw new Error(`This Ollama is too old for the model: it takes ${APP_MODEL.needsOllama} or newer. Update it, or close it and let the lab use the app's own.`)
  }
  const held = await listOllamaModels(url)
  if (!held.some((item) => sameOllamaModel(item.id, MODEL))) {
    say(`Downloading ${MODEL}…`)
    await pullOllamaModel(url, MODEL, () => {}).catch((error: unknown) => {
      throw new Error(describePullError(error, MODEL))
    })
  }
  say(`Model: ${MODEL}`)

  // --- Every text to ask about, once each ---------------------------------------------
  const texts: string[] = []
  const indexOf = new Map<string, number>()
  const add = (text: string): number => {
    const known = indexOf.get(text)
    if (known !== undefined) return known
    indexOf.set(text, texts.length)
    return texts.push(text) - 1
  }

  // The stories of the app, and those waiting for a picture (scenarios/drafts), which carry most of the notes.
  const folders = [resolve('scenarios'), resolve('scenarios', 'drafts')]
  const books = folders
    .flatMap((folder) => readdirSync(folder).filter((file) => /\.(png|json)$/i.test(file)).map((file) => ({ folder, file })))
    .map(({ folder, file }) => {
      const card = parseCardFile(file, new Uint8Array(readFileSync(join(folder, file))))
      const fill = (text: string): string => applyMacros(text, { char: card.name, user: USER })
      const entries = (card.lorebook?.entries ?? []).map((entry) => ({
        source: entry,
        label: entry.keys[0]?.trim() || entry.name,
        candidate: entry.enabled && !entry.constant && entry.content.trim() !== '',
        forms: Object.fromEntries(FORMS.map((form) => [form, add(loreEntryText(entry, form, fill))])) as Record<(typeof FORMS)[number], number>,
      }))
      return { id: file.replace(/\.(png|json)$/i, ''), name: card.name, fill, entries }
    })

  const deepest = Math.max(...DEPTHS)
  const cases = CASES.map((item) => {
    const book = books.find((each) => each.id === item.card)
    if (!book) throw new Error(`cases.ts names a story that is not in scenarios/ nor scenarios/drafts/: ${item.card}`)
    for (const label of item.expect) {
      if (!book.entries.some((entry) => entry.label === label)) throw new Error(`cases.ts expects a note "${label}" that ${item.card} does not have.`)
    }
    const recent = item.messages.slice(-KEY_DEPTH).join('\n')
    const keyed = book.entries
      .filter((entry) => entry.candidate && entry.source.keys.some((key) => keyMatches(book.fill(key), recent, entry.source.caseSensitive)))
      .map((entry) => entry.label)
    const pieces = lorePieces(item.messages, deepest).map((piece) => ({ index: add(piece.text), age: piece.age }))
    return { ...item, pieces, keyed }
  })

  // --- Asking -------------------------------------------------------------------------
  const cold = await timed(() => embedWithOllama(url, MODEL, ['She smiles.']))
  say(`First question (the model loads into memory, unless it already was): ${cold.ms} ms`)
  const vectors: number[][] = []
  const started = Date.now()
  for (let from = 0; from < texts.length; from += 24) vectors.push(...(await embedWithOllama(url, MODEL, texts.slice(from, from + 24))))
  say(`${texts.length} texts: ${Date.now() - started} ms`)
  const costs: number[] = []
  for (const item of cases.slice(0, 12)) costs.push((await timed(() => embedWithOllama(url, MODEL, item.pieces.map((piece) => texts[piece.index]!)))).ms)
  const cost = costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)] ?? 0

  const trial: LoreTrial = {
    made: new Date().toISOString(),
    model: MODEL,
    ollama: version,
    platform: `${process.platform} ${process.arch}`,
    what,
    cold: cold.ms,
    cost,
    cards: books.map(({ id, name, entries }) => ({ id, name, entries: entries.map(({ label, candidate, forms }) => ({ label, candidate, forms })) })),
    cases,
    texts,
    vectors: vectors.map((vector) => vector.map((value) => Math.round(value * 1e5) / 1e5)),
  }
  const report = writeReport(trial)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `lore-report${AFTER}.md`), report, 'utf8')
  writeFileSync(join(OUT, `lore-vectors${AFTER}.json`), JSON.stringify(trial), 'utf8')
  say(`\n${report.split('## How far apart')[0]}`)
  say(`Written: ${join(OUT, `lore-report${AFTER}.md`)} (every case is in it) and lore-vectors${AFTER}.json`)
}

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const begun = Date.now()
  const value = await work()
  return { value, ms: Date.now() - begun }
}
