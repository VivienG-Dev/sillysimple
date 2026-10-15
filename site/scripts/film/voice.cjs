// Films the real app reading a reply aloud with ElevenLabs: the film of the guide "Give a
// character a voice".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/voice.cjs
//                                             node scripts/film/assemble.cjs voice     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/voice-data, emptied each time; yours is not touched) and goes
// through the first launch with the stand-in for Ollama that the app's tests use, so that
// a chat with Suzu Amano is open on her first message. Then it films: Settings › Voice,
// "ElevenLabs", a key pasted and checked, the voices that come back; in the chat, a voice
// picked for her in the panel beside it and listened to; and her first message read aloud
// with the speaker button.
//
// NOTHING REAL IS NEEDED: no model, no key, no network. ElevenLabs is played by the
// script. The app calls it from its main process, with Node's own `fetch`
// (src/core/voice/engines.ts). Before filming, `app.evaluate` puts a wrapper around
// `globalThis.fetch` in that process: what is asked of https://api.elevenlabs.io gets an
// answer written below (a dozen voices, its speech models, what the account has used,
// and for every sample and every piece of speech a few seconds of silence, as a WAV
// file), and everything else goes to the real `fetch` as before. The app itself is not
// changed: it reads those answers as it would read ElevenLabs'. The key typed is an
// obviously fake one, shown as dots. The voices are named like ElevenLabs' own, but the
// list is the script's. The film has no sound: what shows that a voice is heard is the
// app's own (the stop square on the listen button, the moving bars on the message).
//
// The local engine is the stand-in too, so nothing is downloaded: the first launch picks
// its model in a second, and no reply is written in the film (it reads her first message).
// Quit Ollama before running it, or the app uses yours.
//
// On Linux (where it was written and run, without a screen) the app has no secure place
// to keep keys: the script lets Electron keep them with a password in memory, so that the
// film shows what a Mac shows. On a Mac it opens the app's window for real: leave the
// mouse alone while it films.
//
//   NAME_TYPED="Sam" node scripts/film/voice.cjs     another name for the user

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, firstLaunch, YOUR_OLLAMA } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = 'Gemma 4 · Small'
const STORY = 'Suzu Amano'
/** Obviously not a key: typed in the film, shown as dots. */
const KEY = 'sk_0000000000000000000000000000000000000000000000'
/** The voice picked for her in the film. */
const HERS = 'Lily'

/** A WAV file of `seconds` of silence: what every sample and every piece of speech sounds like. */
function silence(seconds) {
  const rate = 16000
  const bytes = rate * seconds * 2
  const wav = Buffer.alloc(44 + bytes)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + bytes, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(bytes, 40)
  return wav.toString('base64')
}

const voice = (voice_id, name, gender, age, accent, descriptive) => ({
  voice_id,
  name,
  preview_url: `https://api.elevenlabs.io/film-sample/${voice_id}.wav`,
  labels: { gender, age, accent, descriptive },
})

/** What "ElevenLabs" answers. Handed to the main process of the app, so plain data only. */
const ELEVENLABS = {
  voices: [
    voice('film-alice', 'Alice', 'female', 'middle aged', 'british', 'confident'),
    voice('film-aria', 'Aria', 'female', 'middle aged', 'american', 'husky'),
    voice('film-brian', 'Brian', 'male', 'middle aged', 'american', 'deep'),
    voice('film-callum', 'Callum', 'male', 'middle aged', 'transatlantic', 'husky'),
    voice('film-charlotte', 'Charlotte', 'female', 'young', 'swedish', 'seductive'),
    voice('film-george', 'George', 'male', 'middle aged', 'british', 'warm'),
    voice('film-jessica', 'Jessica', 'female', 'young', 'american', 'playful'),
    voice('film-laura', 'Laura', 'female', 'young', 'american', 'sassy'),
    voice('film-liam', 'Liam', 'male', 'young', 'american', 'confident'),
    voice('film-lily', 'Lily', 'female', 'young', 'british', 'bright'),
    voice('film-matilda', 'Matilda', 'female', 'middle aged', 'american', 'upbeat'),
    voice('film-will', 'Will', 'male', 'young', 'american', 'chill'),
  ],
  models: [
    { model_id: 'eleven_v3', name: 'Eleven v3', can_do_text_to_speech: true },
    { model_id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2', can_do_text_to_speech: true },
    { model_id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', can_do_text_to_speech: true },
  ],
  subscription: { character_count: 1840, character_limit: 10000 },
  sample: silence(3),
  speech: silence(4),
}

/**
 * Runs in the app's main process: from now on, what is asked of api.elevenlabs.io is
 * answered here, the rest goes on to the real fetch. On Linux, keys are kept with a
 * password in memory, as Electron allows when the computer has no keyring.
 */
function playElevenLabs({ safeStorage }, fake) {
  if (process.platform === 'linux' && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true)
  const realFetch = globalThis.fetch
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const wav = (base64) => new Response(Buffer.from(base64, 'base64'), { status: 200, headers: { 'Content-Type': 'audio/wav' } })

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input && input.url ? input.url : input)
    if (!url.startsWith('https://api.elevenlabs.io/')) return realFetch(input, init)
    const route = url.replace('https://api.elevenlabs.io/', '').split('?')[0]

    if (route === 'v2/voices') {
      await wait(900) // As long as asking a service on the internet takes.
      return json({ voices: fake.voices, has_more: false })
    }
    if (route === 'v1/models') return json(fake.models)
    if (route === 'v1/user/subscription') return json(fake.subscription)
    if (route.startsWith('film-sample/')) {
      await wait(400)
      return wav(fake.sample)
    }
    if (route.startsWith('v1/text-to-speech/')) {
      await wait(1200)
      return wav(fake.speech)
    }
    return new Response(JSON.stringify({ detail: 'Not part of the film.' }), { status: 404 })
  }
}

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }

  // A data folder of its own, as on the first day, with the stand-in in the place of the engine.
  const data = path.join(work, 'voice-data')
  const models = path.join(work, 'voice-stand-in-models')
  for (const folder of [data, models]) fs.rmSync(folder, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  placeStandIn(data)

  const film = await openApp({ film: 'voice', data, env: { OLLAMA_MODELS: models } })
  const { app, page, press, glide, mark } = film

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })
    await app.evaluate(playElevenLabs, ELEVENLABS)
    await sleep(6000) // The mood of the first message has played.

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('settings', 'Open Settings › Voice')
    await sleep(900)
    await press(page.locator('a[aria-label="Settings"]'), { ms: 650 })
    await page.locator('h1', { hasText: 'Connection' }).waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(500)
    await press(page.locator('nav[aria-label="Settings sections"] a', { hasText: 'Voice' }))
    await page.locator('h1', { hasText: 'Voice' }).waitFor({ state: 'visible', timeout: 10_000 })
    await glide(640, 330, 500)
    await sleep(1800)

    mark('elevenlabs', 'Choose ElevenLabs')
    await press(page.locator('label.option', { hasText: 'ElevenLabs' }))
    const field = page.locator('input[aria-label="API key"]')
    await field.waitFor({ state: 'visible', timeout: 5000 })
    await sleep(600)
    // The link to ElevenLabs' page for keys: pointed at, not clicked (it opens the computer's browser).
    const link = await page.locator('.details .hint a').boundingBox()
    await glide(link.x + link.width + 8, link.y + link.height * 0.9, 600)
    await sleep(1800)
    await press(field, { dx: 0.3 })
    await sleep(300)
    await page.keyboard.insertText(KEY) // Pasted, not typed.
    await sleep(700)
    await press(page.locator('.details .key button', { hasText: 'Check' }))
    await page.locator('select[aria-label="Voice of everyone"]').waitFor({ state: 'visible', timeout: 10_000 })
    await glide(640, 420, 600)
    await sleep(1200)
    // Down to "Voice of everyone": the first voice of the list, until one is chosen.
    for (let turn = 0; turn < 6; turn++) {
      await page.mouse.wheel(0, 40)
      await sleep(40)
    }
    await sleep(2000)

    mark('pick', "Pick the character's voice")
    await press(page.getByText('Back to chat'))
    const picker = page.locator(`select[aria-label="Voice of ${STORY}"]`)
    await picker.waitFor({ state: 'attached', timeout: 10_000 })
    await sleep(800)
    // Down the panel beside the chat, to "Voice", under her name.
    await glide(960, 450, 600)
    for (let turn = 0; turn < 40; turn++) {
      const box = await picker.boundingBox()
      if (box.y + box.height <= 600) break
      await page.mouse.wheel(0, 40)
      await sleep(40)
    }
    await sleep(300)
    const where = await picker.boundingBox()
    await glide(where.x + where.width * 0.4, where.y + where.height / 2, 600)
    await sleep(700)
    // The list that opens is the computer's own menu, which is not in the pictures: the
    // film shows the pointer on it, then the voice chosen.
    await picker.selectOption(ELEVENLABS.voices.find((item) => item.name === HERS).voice_id)
    await sleep(900)
    await press(page.locator(`button[aria-label="Listen to ${HERS}"]`))
    // Its sample is fetched (a turning circle), then heard (a square, to stop it).
    await page.locator('.voice-picker .listen.on:not(:has(.spin))').first().waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(2200)

    mark('read', 'Read aloud')
    const message = page.locator('.message', { hasText: 'ground crew' }).first()
    const speak = message.locator('button[aria-label="Read aloud"]')
    // Her message is long: up the chat to its top, where its buttons are.
    await glide(540, 300, 600)
    for (let turn = 0; turn < 40; turn++) {
      const box = await message.boundingBox()
      if (box.y >= 60) break
      await page.mouse.wheel(0, -40)
      await sleep(40)
    }
    await sleep(300)
    await message.hover()
    await sleep(500)
    await press(speak)
    await message.locator('button[aria-label="Stop reading"]').waitFor({ state: 'visible', timeout: 5000 })
    await glide(560, 420, 700)
    await message.locator('.speak.playing').waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(3500)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
