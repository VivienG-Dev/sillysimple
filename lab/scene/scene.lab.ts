import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { isEmbeddingModel } from '@core/engine/models'
import type { LlmMessage } from '@core/prompt/buildMessages'
import { PLACE_REPLY_TOKENS, PLACE_TEMPERATURE, sceneAnswered } from '@core/prompt/place'
import { streamChat } from '@core/providers'
import { listOllamaModels, ollamaVersion } from '@core/providers/ollama'
import { appData, findOllama } from '../ollama'
import { judge, writeReport, type Trial } from './judge'
import { SCENES } from './scenes'
import { WAYS } from './ways'

// How well does the model say where the scene is and what the character wears, once a
// reply is written? Run with `pnpm scene:lab`.
//
// The app asks the chat model one question after each reply and keeps the answer (see
// src/core/prompt/place.ts). This asks about the lab's scenes (scenes.ts) in several ways
// (ways.ts), the app's own first, and says for each way how many it got right. Two files
// come out, in lab/out:
//
//   scene-report.md     what to read: the scores, and every answer as the model wrote it
//   scene-answers.json  the answers, to read them again later without the model
//                       (`pnpm scene:replay`, after a change to how the app reads them)
//
// It asks the model the app chats with (the one chosen in its settings), on the Ollama
// that runs: see ../ollama.ts.
//
//   SCENE_LAB_MODEL=gemma4:e4b-it-q4_K_M pnpm scene:lab     another model

const OUT = resolve('lab/out')
const say = (line = ''): void => console.log(line)

it('asks the real model where the scenes are and what Mina wears', async () => {
  const ollama = await findOllama()
  try {
    await run(ollama.url, ollama.what)
  } finally {
    await ollama.stop()
  }
})

async function chosenModel(url: string): Promise<string> {
  const held = (await listOllamaModels(url)).map((item) => item.id).filter((id) => !isEmbeddingModel(id))
  const asked = process.env['SCENE_LAB_MODEL']
  if (asked) return asked
  try {
    const settings = JSON.parse(readFileSync(join(appData(), 'settings.json'), 'utf8')) as { connection?: { kind?: unknown; model?: unknown } }
    const model = settings.connection?.model
    if (settings.connection?.kind === 'ollama' && typeof model === 'string' && held.includes(model)) return model
  } catch {
    // No settings to read: the first model there is.
  }
  if (!held[0]) throw new Error('This Ollama has no model to chat with. Download one in SillySimple, or say which: SCENE_LAB_MODEL=name pnpm scene:lab')
  return held[0]
}

async function run(url: string, what: string): Promise<void> {
  const version = (await ollamaVersion(url, 3000)) ?? '?'
  const model = await chosenModel(url)
  say(`\nOllama: ${what}, version ${version}, at ${url}`)
  say(`Model: ${model}`)

  /** Asks as the app does: no more is waited for once both lines are there. */
  const ask = async (messages: LlmMessage[], maxTokens = PLACE_REPLY_TOKENS): Promise<{ raw: string; ms: number }> => {
    const started = Date.now()
    const controller = new AbortController()
    let raw = ''
    const stream = streamChat({ kind: 'ollama', baseUrl: `${url}/v1`, model, messages, temperature: PLACE_TEMPERATURE, maxTokens, thinking: false, signal: controller.signal })
    for await (const part of stream) {
      if (part.type !== 'text') continue
      raw += part.delta
      if (sceneAnswered(raw)) break
    }
    controller.abort()
    return { raw: raw.trim(), ms: Date.now() - started }
  }

  const first = await ask([{ role: 'user', content: 'Say "ready".' }], 8)
  say(`First question (the model loads into memory, unless it already was): ${first.ms} ms`)

  const ways = Object.keys(WAYS)
  const trial: Trial = {
    made: new Date().toISOString(),
    model,
    ollama: version,
    what,
    ways: Object.fromEntries(ways.map((way) => [way, WAYS[way]!.what])),
    scenes: [],
  }
  for (const scene of SCENES) {
    const answers: Trial['scenes'][number]['answers'] = []
    for (const way of ways) answers.push({ way, ...(await ask(WAYS[way]!.ask(scene))) })
    trial.scenes.push({ ...scene, answers })
    say(`  ${scene.id}: ${answers.map((answer) => `${answer.way} ${judge(scene, answer.way, answer.raw, answer.ms).outfitRight ? 'ok' : 'NO'}`).join(', ')}`)
  }

  // --- Does a question asked apart cost the next reply? ---------------------------------
  //
  // The app asks in the conversation the reply was written in, so that the model, which
  // has it all in memory, only reads the question; asked apart, it might have to read the
  // whole conversation again for the next reply. Whether it does is measured here: a long
  // conversation, the same with one more message, a short question about something else,
  // and the conversation again.
  const long: LlmMessage[] = [{ role: 'system', content: 'You are Mina. Answer in one word.' }]
  // As long as the app's own Ollama can hold (it reads 8192 tokens at least); another one may read 4096 only.
  const length = what.includes("SillySimple's own") ? 24_000 : 9000
  for (let turn = 0; long.reduce((sum, message) => sum + message.content.length, 0) < length; turn++) {
    const scene = SCENES[turn % SCENES.length]!
    long.push({ role: 'user', content: `${turn + 1}. ${scene.told.join(' ')}` }, { role: 'assistant', content: scene.reply })
  }
  const more = (count: number): LlmMessage[] => [
    ...long,
    ...Array.from({ length: count }, (_, index): LlmMessage[] => [
      { role: 'user', content: `And then? (${index + 1})` },
      { role: 'assistant', content: 'Well.' },
    ]).flat(),
    { role: 'user', content: 'One word: how do you feel?' },
  ]
  const tokens = Math.round(long.reduce((sum, message) => sum + message.content.length, 0) / 4 / 100) * 100
  const read = async (messages: LlmMessage[]): Promise<number> => (await ask(messages, 4)).ms
  const cold = await read(more(0))
  const again = await read(more(1))
  // Three questions apart, about three scenes, answered in full: as after three replies.
  let apart = 0
  for (const scene of SCENES.slice(0, 3)) apart += (await ask(WAYS['app']!.ask(scene))).ms
  trial.memory = { tokens, first: cold, again, apart, back: await read(more(2)) }

  const report = writeReport(trial)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'scene-report.md'), report, 'utf8')
  writeFileSync(join(OUT, 'scene-answers.json'), JSON.stringify(trial, null, 2), 'utf8')

  say(`\n${report.split('## Every scene')[0]}`)
  say(`Written: ${join(OUT, 'scene-report.md')} (every answer is in it) and scene-answers.json`)
}
