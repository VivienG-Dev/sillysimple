import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { describePullError } from '@core/engine/errors'
import { senseModel } from '@core/engine/models'
import { compareVersions } from '@core/engine/release'
import { detectMood } from '@core/mood/detectMood'
import { anchorList, cutReply, FEELINGS } from '@core/mood/senseMood'
import { embedWithOllama, listOllamaModels, ollamaVersion, pullOllamaModel, sameOllamaModel } from '@core/providers/ollama'
import { findOllama } from '../ollama'
import { NAMED, REPLIES } from './replies'
import { APP_VARIANT, BEFORE, writeReport, type Trial, type Variant } from './report'

// How well does the app read moods? Run with `pnpm mood:lab`. It asks the file of the
// embedding model the app uses on this kind of computer (see senseModel): the compressed
// MLX one on a Mac with an Apple chip, the plain one elsewhere.
//
// It asks the real model for the vectors of the anchors and of the lab's replies
// (replies.ts), reads each reply the three ways the app can (the word lists, the meaning,
// both together), and says how many it got right. Two files come out, in lab/out:
//
//   mood-report.md     what to read: the scores, the misses, the timings
//   mood-vectors.json  every vector, so that the thresholds and the way of deciding can
//                      be tried again afterwards without the model (`pnpm mood:replay`)
//
// Which Ollama it asks: see ../ollama.ts.
//
//   MOOD_LAB_MODEL=embeddinggemma-2:270m-mxfp8-text pnpm mood:lab     another model
//                                (its files are then named after it: mood-report-<model>.md)

const APP_MODEL = senseModel(process.platform, process.arch)
const MODEL = process.env['MOOD_LAB_MODEL'] || APP_MODEL.id
const OUT = resolve('lab/out')
/** Another model than the app's leaves its own two files, beside those of the app's model. */
const AFTER = MODEL === APP_MODEL.id ? '' : `-${MODEL.replace(/[^a-z0-9.]+/gi, '-')}`

const say = (line = ''): void => console.log(line)

it('reads the moods of the lab replies with the real model', async () => {
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

  // --- The model ---------------------------------------------------------------------
  const held = await listOllamaModels(url)
  if (!held.some((item) => sameOllamaModel(item.id, MODEL))) {
    say(`Downloading ${MODEL}…`)
    let told = -1
    await pullOllamaModel(url, MODEL, ({ doneBytes, totalBytes }) => {
      const tenth = totalBytes > 0 ? Math.floor((doneBytes / totalBytes) * 10) : 0
      if (tenth > told) say(`  ${(told = tenth) * 10}%`)
    }).catch((error: unknown) => {
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

  const anchors = anchorList().map((anchor) => ({ feeling: anchor.feeling, index: add(anchor.text) }))
  const named = FEELINGS.map((feeling) => ({ feeling, index: add(NAMED[feeling]) }))
  const replies = REPLIES.map((reply) => ({
    ...reply,
    words: detectMood(reply.text, { userName: reply.user }),
    pieces: cutReply(reply.text, reply.user).map((piece) => ({ index: add(piece.text), place: piece.place })),
    // The reply as one text, to see afterwards whether cutting it helps.
    whole: add(reply.text.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().slice(-1200)),
  }))

  // --- Asking -------------------------------------------------------------------------
  const cold = await timed(() => embedWithOllama(url, MODEL, [`${BEFORE[APP_VARIANT]}She smiles.`]))
  say(`First question (the model loads into memory, unless it already was): ${cold.ms} ms, vectors of ${cold.value[0]!.length} numbers`)

  const vectors = {} as Record<Variant, number[][]>
  for (const variant of Object.keys(BEFORE) as Variant[]) {
    const started = Date.now()
    vectors[variant] = []
    for (let from = 0; from < texts.length; from += 24) {
      vectors[variant].push(...(await embedWithOllama(url, MODEL, texts.slice(from, from + 24).map((text) => `${BEFORE[variant]}${text}`))))
    }
    say(`${texts.length} texts with "${BEFORE[variant] || '(nothing before)'}": ${Date.now() - started} ms`)
  }

  // What a reply costs in the app: its pieces, in one question.
  const costs: number[] = []
  for (const reply of replies.filter((item) => item.pieces.length > 0).slice(0, 12)) {
    costs.push((await timed(() => embedWithOllama(url, MODEL, reply.pieces.map((piece) => `${BEFORE[APP_VARIANT]}${texts[piece.index]!}`)))).ms)
  }
  const cost = costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)] ?? 0
  say(`One reply, once the model is loaded: about ${cost} ms`)

  // --- What was found, kept and read -----------------------------------------------------
  const trial: Trial = {
    made: new Date().toISOString(),
    model: MODEL,
    ollama: version,
    platform: `${process.platform} ${process.arch}`,
    what,
    cold: cold.ms,
    cost,
    before: BEFORE,
    texts,
    anchors,
    named,
    replies: replies.map(({ kind, mood, user, text, words, pieces, whole }) => ({ kind, mood, user: user ?? null, text, words, pieces, whole })),
    vectors: Object.fromEntries(Object.entries(vectors).map(([variant, list]) => [variant, list.map((vector) => vector.map((value) => Math.round(value * 1e5) / 1e5))])),
  }
  const report = writeReport(trial)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `mood-report${AFTER}.md`), report, 'utf8')
  writeFileSync(join(OUT, `mood-vectors${AFTER}.json`), JSON.stringify(trial), 'utf8')

  say(`\n${report.split('## Every reply')[0]}`)
  say(`Written: ${join(OUT, `mood-report${AFTER}.md`)} (every reply is in it) and mood-vectors${AFTER}.json`)
}

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now()
  const value = await work()
  return { value, ms: Date.now() - started }
}
