// Films the real app going through its first launch: the film of "Three questions, then
// you are in" on the site (and of the top of the page, until the chat has been filmed).
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/first-launch.cjs
//                                             node scripts/film/assemble.cjs first-launch     (needs ffmpeg)
//
// What it does: it opens the built app with an empty data folder of its own (yours is not
// touched). The guide welcomes, a name is typed, the model recommended for the computer
// is downloaded, a story is picked and the chat opens. Every picture the window draws is
// kept in site/.film/first-launch/frames, with the time it was drawn.
//
// THE DOWNLOAD IS NOT REAL. The stand-in for Ollama that the app's tests use is put where
// the app keeps its own engine: the app shows its real screens, bar and guide, but the
// 4.6 GB "arrive" in a few seconds and nothing is fetched. The site says the film is
// shortened. Since the stand-in only says hello, nothing here sends a message either.
//
// The models offered depend on the memory of the computer that films: with 8 GB only the
// small one is shown, with 32 GB all three. The film on the site was made with 8 GB.
//
// Ollama must not be open while this runs: the app would use yours instead of its own,
// and say so on screen.
//
// It was written and run on Linux, without a screen (xvfb-run -a node scripts/film/first-launch.cjs).
// On a Mac it opens the app's window for real: leave the mouse alone while it films.

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, YOUR_OLLAMA } = require('./lib.cjs')

/** The name typed at the first question. */
const NAME = process.env.NAME_TYPED || 'Robin'
/** The model that is downloaded: the one every computer is offered. */
const MODEL = 'Gemma 4 · Small'
const STORY = 'Suzu Amano'

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }

  // Everything the app writes during the film goes to a folder made for it.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sillysimple-film-'))
  const data = path.join(scratch, 'data')
  fs.mkdirSync(data)
  // The guided tour of the chat is shown once: not in this film.
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  placeStandIn(data)

  const film = await openApp({
    film: 'first-launch',
    data,
    env: {
      OLLAMA_MODELS: path.join(scratch, 'models'),
      // The stand-in's model weighs what the real one does, and comes in about five seconds.
      FAKE_SCALE: '920000',
      FAKE_PULL_MS: '380',
    },
  })
  const { page, press, glide, mark } = film

  try {
    // Opened anew, so that the guide's entrance is in the film.
    await film.start({ again: true })
    mark('open', 'Open it')
    await page.waitForSelector('#persona-name', { timeout: 15000 })
    await sleep(6300) // The guide comes in, then says its welcome.

    mark('name', 'Say your name')
    await press(page.locator('#persona-name'), { dx: 0.3 })
    await sleep(200)
    await film.type(NAME)
    await sleep(1900) // "Nice to meet you, Robin!"
    await press(page.locator('button:has-text("Continue")'))

    mark('model', 'Get a model')
    await sleep(2400) // The guide starts on the three choices.
    const row = page.locator('.row', { hasText: MODEL })
    await press(row.locator('button:has-text("Download")'))
    await glide(985, 430, 700) // Out of the way: the guide watches the bar.
    // The radio of the row can be picked once the model is there.
    await row.locator('input[type="radio"]:not([disabled])').waitFor({ state: 'attached', timeout: 60000 })
    await sleep(1900) // "It is here!"
    await press(page.locator('button:has-text("Continue")'))

    mark('story', 'Pick a story')
    await sleep(1800)
    await press(page.locator('label.character', { hasText: STORY }), { dx: 0.6 })
    await sleep(800)
    await press(page.locator('button:has-text("Start chatting")'))

    mark('chat', 'Start talking')
    await sleep(700)
    await glide(700, 500, 600)
    await sleep(2200)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
  fs.rmSync(scratch, { recursive: true, force: true })
})()
