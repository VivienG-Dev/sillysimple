// Films the real app getting its replies from OpenRouter: the film of the guide "Replies
// from an online service".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/online.cjs
//                                             node scripts/film/assemble.cjs online     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/online-data, emptied each time; yours is not touched) and goes
// through the first launch with the stand-in for Ollama that the app's tests use, so that
// a chat with Suzu Amano is open. Then it films: Settings › Connection, "Online service",
// OpenRouter, the link to get a key, a key pasted and checked, a model searched for and
// chosen, Save, and back in the chat a line written and the reply that comes back.
//
// NOTHING REAL IS NEEDED: no model, no key, no network. OpenRouter is played by the
// script. The app asks OpenRouter for things from its main process, with Node's own
// `fetch` (src/core/providers/dialects.ts for the key and the list of models,
// openaiCompatible.ts for the replies). Before filming, `app.evaluate` puts a wrapper
// around `globalThis.fetch` in that process: what is asked of https://openrouter.ai gets
// an answer written below (the key is "valid", a short list of models, a reply streamed
// word by word as OpenRouter streams it), and everything else goes to the real `fetch`
// as before. The app itself is not changed: it reads and checks those answers as it
// would read OpenRouter's. The key typed is an obviously fake one, shown as dots.
// The models of the list are real OpenRouter names, but only a dozen of its hundreds.
//
// The local engine is the stand-in too, so nothing is downloaded: the first launch picks
// its model in a second. Quit Ollama before running it, or the app uses yours.
//
// On Linux (where it was written and run, without a screen) the app has no secure place
// to keep keys: the script lets Electron keep them with a password in memory, so that the
// film shows what a Mac shows. On a Mac it opens the app's window for real: leave the
// mouse alone while it films.
//
//   NAME_TYPED="Sam" node scripts/film/online.cjs     another name for the user

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, firstLaunch, YOUR_OLLAMA } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = 'Gemma 4 · Small'
const STORY = 'Suzu Amano'
/** Obviously not a key: typed in the film, shown as dots. */
const KEY = 'sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000'
/** What is typed in "Search models", and the model then chosen. */
const SEARCH = 'mistral'
const CHOSEN = 'mistralai/mistral-small-3.2-24b-instruct'
/** What is written to her in the film. */
const LINE = '"Sorry! The bus was late. Which stop is the one that bites?"'

/** What "OpenRouter" answers. Handed to the main process of the app, so plain data only. */
const OPENROUTER = {
  models: [
    ['deepseek/deepseek-chat-v3.1', 'DeepSeek: DeepSeek V3.1', 163840],
    ['google/gemini-2.5-flash', 'Google: Gemini 2.5 Flash', 1048576],
    ['meta-llama/llama-3.3-70b-instruct', 'Meta: Llama 3.3 70B Instruct', 131072],
    ['meta-llama/llama-3.3-70b-instruct:free', 'Meta: Llama 3.3 70B Instruct (free)', 65536],
    ['mistralai/mistral-nemo', 'Mistral: Mistral Nemo', 131072],
    ['mistralai/mistral-small-3.2-24b-instruct', 'Mistral: Mistral Small 3.2 24B', 131072],
    ['mistralai/mistral-medium-3.1', 'Mistral: Mistral Medium 3.1', 131072],
    ['nousresearch/hermes-4-70b', 'Nous: Hermes 4 70B', 131072],
    ['openai/gpt-4o-mini', 'OpenAI: GPT-4o-mini', 128000],
    ['qwen/qwen3-235b-a22b-2507', 'Qwen: Qwen3 235B A22B Instruct 2507', 262144],
    ['thedrummer/unslopnemo-12b', 'TheDrummer: UnslopNemo 12B', 32768],
    ['x-ai/grok-4-fast', 'xAI: Grok 4 Fast', 2000000],
  ].map(([id, name, context_length]) => ({ id, name, context_length, architecture: { output_modalities: ['text'] } })),
  reply:
    '*Suzu snorts, and the halo of floating things wobbles with her.* "The bus. Classic ground crew." *She swings the fork toward the parcel on the bristles, which gives a small, offended rattle.* "That one. Stop one, the bakery on Sakura Street. Don\'t put your fingers near the string." *She pats the broom behind her.* "Hop on. Biscuit hates being kept waiting even more than I do."',
}

/**
 * Runs in the app's main process: from now on, what is asked of openrouter.ai is answered
 * here, the rest goes on to the real fetch. On Linux, keys are kept with a password in
 * memory, as Electron allows when the computer has no keyring.
 */
function playOpenRouter({ safeStorage }, fake) {
  if (process.platform === 'linux' && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true)
  const realFetch = globalThis.fetch
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input && input.url ? input.url : input)
    if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init)
    const route = url.replace('https://openrouter.ai/api/v1/', '').split('?')[0]

    if (route === 'key') {
      await wait(700) // As long as asking a service on the internet takes.
      return json({ data: { label: 'sk-or-v1-000…000', limit: null, usage: 0.04, is_free_tier: false } })
    }
    if (route === 'models') return json({ data: fake.models })

    if (route === 'chat/completions') {
      const body = JSON.parse(String(init.body || '{}'))
      const everything = JSON.stringify(body.messages || [])
      // The question the app asks after a reply: where the scene is, what she wears.
      const text = everything.includes('Pause the story for two questions') ? 'Place: unknown\nWearing: unknown' : fake.reply
      const pieces = text.match(/\S+\s*/g) || []
      const encoder = new TextEncoder()
      const line = (data) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
      const stream = new ReadableStream({
        async start(controller) {
          await wait(600)
          for (const piece of pieces) {
            if (init.signal && init.signal.aborted) break
            controller.enqueue(line({ choices: [{ delta: { content: piece } }] }))
            await wait(45)
          }
          controller.enqueue(line({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response(JSON.stringify({ error: { message: 'Not part of the film.' } }), { status: 404 })
  }
}

/** Waits until the model has finished writing: "Send" is back, and stays there. */
async function written(page, timeout = 60_000) {
  const send = page.locator('button[aria-label="Send"]')
  const stop = page.locator('button[aria-label="Stop writing"]')
  await stop.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  const until = Date.now() + timeout
  let since = null
  while (Date.now() < until) {
    if ((await send.isVisible()) && !(await stop.isVisible())) {
      since ??= Date.now()
      if (Date.now() - since >= 1500) return
    } else {
      since = null
    }
    await sleep(150)
  }
  throw new Error('The reply did not finish in time.')
}

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }

  // A data folder of its own, as on the first day, with the stand-in in the place of the engine.
  const data = path.join(work, 'online-data')
  const models = path.join(work, 'online-stand-in-models')
  for (const folder of [data, models]) fs.rmSync(folder, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  placeStandIn(data)

  const film = await openApp({ film: 'online', data, env: { OLLAMA_MODELS: models } })
  const { app, page, press, glide, mark } = film
  const composer = page.locator('textarea[aria-label="Message"]')

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })
    await app.evaluate(playOpenRouter, OPENROUTER)
    await sleep(6000) // The mood of the first message has played.

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('settings', 'Open Settings')
    await sleep(900)
    await press(page.locator('a[aria-label="Settings"]'), { ms: 650 })
    await page.locator('h1', { hasText: 'Connection' }).waitFor({ state: 'visible', timeout: 10_000 })
    await glide(640, 300, 500)
    await sleep(1800)

    mark('online', 'Choose Online service')
    await press(page.locator('label.option', { hasText: 'Online service' }))
    await page.locator('label.provider', { hasText: 'OpenRouter' }).waitFor({ state: 'visible', timeout: 5000 })
    await sleep(700)
    await press(page.locator('label.provider', { hasText: 'OpenRouter' }))
    await sleep(1800)

    mark('key', 'Get a key')
    // Pointed at, not clicked: it opens the computer's browser, which is not in the film.
    const link = page.locator('.provider-note a')
    const box = await link.boundingBox()
    await glide(box.x + box.width + 8, box.y + box.height * 0.9, 550)
    await sleep(2600)

    mark('paste', 'Paste it')
    const field = page.locator('input[aria-label="API key"]')
    await press(field, { dx: 0.3 })
    await sleep(300)
    await page.keyboard.insertText(KEY) // Pasted, not typed.
    await sleep(700)
    await press(page.locator('.key button', { hasText: 'Check' }))
    await page.locator('.models .model').first().waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(1600)

    mark('model', 'Choose a model, then Save')
    await press(page.locator('input[aria-label="Search models"]'))
    await sleep(250)
    await film.type(SEARCH, 110)
    await sleep(700)
    await press(page.locator('label.model', { hasText: CHOSEN }))
    await sleep(900)
    await press(page.locator('.actions button.btn-primary'))
    await page.locator('.actions button.btn-primary', { hasText: 'Saved' }).waitFor({ state: 'visible', timeout: 5000 })
    await glide(520, 560, 500)
    await sleep(1800)

    mark('chat', 'Chat as before')
    await press(page.getByText('Back to chat'))
    await composer.waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(800)
    await press(composer, { dx: 0.3 })
    await sleep(250)
    await film.type(LINE, 40)
    await sleep(400)
    await press(page.locator('button[aria-label="Send"]'))
    await glide(700, 520, 600)
    await written(page)
    await sleep(3000)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
