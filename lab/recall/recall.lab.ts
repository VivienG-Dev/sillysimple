import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { describePullError } from '@core/engine/errors'
import { senseModel } from '@core/engine/models'
import { compareVersions } from '@core/engine/release'
import { lorePieces } from '@core/prompt/loreMeaning'
import { recallPassages } from '@core/prompt/recall'
import { embedWithOllama, listOllamaModels, ollamaVersion, pullOllamaModel, sameOllamaModel } from '@core/providers/ollama'
import { findOllama } from '../ollama'
import { CHATS } from './cases'
import { DEPTHS, FORMS, writeReport, type RecallTrial } from './report'

// Do old moments of a long chat come back when the chat returns to them? Run with
// `pnpm recall:lab`. It asks the embedding model the app uses on this computer (see
// senseModel) for the vectors of every old message of the chats in cases.ts, in each way
// a message can be read, and of the latest messages of each later line; then tries every
// way of bringing old messages back (src/core/prompt/recall.ts) and says how many it gets
// right. Two files come out, in lab/out:
//
//   recall-report.md     what to read: the best ways, then every case
//   recall-vectors.json  every vector, so that it can all be tried again without the model
//                        (`pnpm recall:replay`), after changing recall.ts
//
// Which Ollama it asks: see ../ollama.ts.
//   RECALL_LAB_MODEL=embeddinggemma-2:270m-bf16-text pnpm recall:lab     another model

const APP_MODEL = senseModel(process.platform, process.arch)
const MODEL = process.env['RECALL_LAB_MODEL'] || APP_MODEL.id
const OUT = resolve('lab/out')
const AFTER = MODEL === APP_MODEL.id ? '' : `-${MODEL.replace(/[^a-z0-9.]+/gi, '-')}`

const say = (line = ''): void => console.log(line)

it('brings old moments of long chats back by meaning, with the real model', async () => {
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
    throw new Error(
      `This Ollama is too old for the model: it takes ${APP_MODEL.needsOllama} or newer. Update it, or close it and let the lab use the app's own.`,
    )
  }
  const held = await listOllamaModels(url)
  if (!held.some((item) => sameOllamaModel(item.id, MODEL))) {
    say(`Downloading ${MODEL}…`)
    await pullOllamaModel(url, MODEL, () => {}).catch((error: unknown) => {
      throw new Error(describePullError(error, MODEL))
    })
  }
  say(`Model: ${MODEL}`)

  const texts: string[] = []
  const indexOf = new Map<string, number>()
  const add = (text: string): number => {
    const known = indexOf.get(text)
    if (known !== undefined) return known
    indexOf.set(text, texts.length)
    return texts.push(text) - 1
  }

  const deepest = Math.max(...DEPTHS)
  const chats = CHATS.map((chat) => {
    for (const item of chat.cases) {
      for (const at of item.expect) if (!chat.old[at]) throw new Error(`cases.ts: ${chat.id} expects old message #${at}, which it does not have.`)
    }
    const passages = Object.fromEntries(
      FORMS.map((form) => [
        form,
        recallPassages(chat.old, form).map((passage) => ({
          ...passage,
          index: add(passage.text),
        })),
      ]),
    ) as RecallTrial['chats'][number]['passages']
    const cases = chat.cases.map((item) => ({
      ...item,
      pieces: lorePieces(item.messages, deepest).map((piece) => ({
        index: add(piece.text),
        age: piece.age,
      })),
    }))
    return { id: chat.id, old: chat.old, passages, cases }
  })

  await embedWithOllama(url, MODEL, ['She smiles.'])
  // What a long chat costs the first time: all its passages, as the app asks them.
  const longest = chats.reduce((a, b) => (a.passages.pair.length >= b.passages.pair.length ? a : b))
  const bulkTexts = longest.passages.pair.map((passage) => texts[passage.index]!)
  const bulkStart = Date.now()
  await embedWithOllama(url, MODEL, bulkTexts)
  const bulk = { ms: Date.now() - bulkStart, texts: bulkTexts.length }

  const vectors: number[][] = []
  const started = Date.now()
  for (let from = 0; from < texts.length; from += 32) vectors.push(...(await embedWithOllama(url, MODEL, texts.slice(from, from + 32))))
  say(`${texts.length} texts: ${Date.now() - started} ms`)
  const costs: number[] = []
  for (const item of chats.flatMap((chat) => chat.cases).slice(0, 12)) {
    const begun = Date.now()
    await embedWithOllama(
      url,
      MODEL,
      item.pieces.map((piece) => texts[piece.index]!),
    )
    costs.push(Date.now() - begun)
  }

  const trial: RecallTrial = {
    made: new Date().toISOString(),
    model: MODEL,
    ollama: version,
    platform: `${process.platform} ${process.arch}`,
    what,
    bulk,
    cost: costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)] ?? 0,
    chats,
    texts,
    vectors: vectors.map((vector) => vector.map((value) => Math.round(value * 1e5) / 1e5)),
  }
  const report = writeReport(trial)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `recall-report${AFTER}.md`), report, 'utf8')
  writeFileSync(join(OUT, `recall-vectors${AFTER}.json`), JSON.stringify(trial), 'utf8')
  say(`\n${report.split('## The best ways')[0]}`)
  say(`Written: ${join(OUT, `recall-report${AFTER}.md`)} (every case is in it) and recall-vectors${AFTER}.json`)
}
