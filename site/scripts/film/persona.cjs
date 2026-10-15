// Films the real app's persona form, in the right panel of a chat: the film of the guide
// "Who you are in the story".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/persona.cjs
//                                             node scripts/film/assemble.cjs persona     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of its
// own (site/.film/persona-data, emptied each time; yours is not touched) and goes through
// the first launch, into the chat of "Suzu Amano". Then it films: the Persona tab is
// opened and a few words are written in "About you"; "New persona" makes a second one,
// who is named and described for another kind of story; and "You are" switches back to
// the first. The message box follows: "Write as <name>…".
//
// No model writes anything here, so none is needed, for trying or for the site: the
// stand-in for Ollama that the app's tests use is put in the place of the app's engine,
// and no message is sent. (What the character makes of "About you" shows only in its
// replies, which a film cannot promise: the guide says it in words.)
//
//   NAME_TYPED=Sam node scripts/film/persona.cjs      another name for the first persona
//
// It was written and run on Linux, without a screen. On a Mac it opens the app's window
// for real: leave the mouse alone while it films.

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, firstLaunch, YOUR_OLLAMA } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = 'Gemma 4 · Small'
const STORY = 'Suzu Amano'
/** What the first persona says about itself. */
const ABOUT = 'A night-shift nurse, new in town. Tired, kind, a little shy.'
/** The second persona, for another kind of story. */
const OTHER = { name: 'Captain Ash', about: 'Captain of a small, leaky airship. Bold, loud, and always in debt.' }

/** This film's own data folder: the app's data in "app", the stand-in's models in "models". */
function freshData() {
  const root = path.join(work, 'persona-data')
  fs.rmSync(root, { recursive: true, force: true })
  const data = path.join(root, 'app')
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  placeStandIn(data)
  return { data, env: { OLLAMA_MODELS: path.join(root, 'models') } }
}

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }

  const film = await openApp({ film: 'persona', ...freshData() })
  const { page, press, glide, mark } = film
  const about = page.locator('.persona-form textarea')
  const yourName = page.locator('.persona-form input[type="text"]')
  /** A field is saved when it loses focus, as when one clicks elsewhere. */
  const leave = (field) => field.evaluate((element) => element.blur())

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })
    await page.mouse.move(560, 690)
    await sleep(6000) // The mood of the first message has played.

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('about', 'Say who you are')
    await sleep(900)
    await press(page.getByRole('tab', { name: 'Persona' }))
    await sleep(900)
    await press(about, { dx: 0.3, dy: 0.3 })
    await sleep(300)
    await film.type(ABOUT, 45)
    await sleep(400)
    await leave(about)
    await glide(560, 420, 600)
    await sleep(1600)

    mark('another', 'Make another persona')
    await press(page.locator('.persona-actions button', { hasText: 'New persona' }))
    await yourName.and(page.locator(':focus')).waitFor({ timeout: 5000 }) // "New persona", selected.
    await sleep(900)
    await film.type(OTHER.name, 80)
    await sleep(300)
    await leave(yourName)
    await press(about, { dx: 0.3, dy: 0.3 })
    await sleep(300)
    await film.type(OTHER.about, 45)
    await sleep(400)
    await leave(about)
    await glide(560, 420, 600)
    await page.locator('.persona-name', { hasText: OTHER.name }).waitFor({ timeout: 5000 })
    await sleep(1600)

    mark('switch', 'Switch who you are')
    const switcher = page.locator('#persona-switch')
    const box = await switcher.boundingBox()
    await glide(box.x + box.width / 2, box.y + box.height / 2, 600)
    await sleep(700)
    // The list that opens is the computer's own menu, which is not in the pictures.
    await switcher.selectOption({ label: NAME })
    await page.locator('.persona-name', { hasText: NAME }).waitFor({ timeout: 5000 })
    await sleep(1400)
    // The message box says who is writing now.
    await press(page.locator('textarea[aria-label="Message"]'), { dx: 0.3, hold: 500 })
    await sleep(2400)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
