// Films the real app making a character better: the film of the guide "Make a character better".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/improve.cjs
//                                             node scripts/film/assemble.cjs improve     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/improve-data; yours is not touched), goes through the first launch,
// sends a first message so that the model is in memory, and writes a character by hand in
// "New character" the way one does in a hurry: a name, two short sentences, a first
// message, nothing else. The app finds that this description is too thin, and says so
// under his name. Then it films: that line is pressed, the editor opens on its advice, the
// model writes a fuller description ("Write a fuller one"), two traits are typed in
// "Personality", one per line with what he does, a note is added to the "Lorebook" with
// its keywords, and the character is saved.
//
// THE MODEL IS REAL, and so is the description it writes: look at the film before you
// keep it. The data folder is kept from one time to the next for the engine alone, which
// the app downloads there once.
//
//   MODEL="Gemma 4 · Medium" node scripts/film/improve.cjs     another model of the list
//
// STAND_IN=1 uses the stand-in for the model that the app's tests use: for trying the
// script, not for the site. Its description is the one below, written a word every 25 ms.
//
// It was written and run on Linux, without a screen. On a Mac it opens the app's window
// for real: leave the mouse alone while it films.

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, requireBuiltApp, placeStandIn, openApp, firstLaunch, warmUp } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = process.env.MODEL || 'Gemma 4 · Small'

/** The character as written in a hurry: a description of fifteen words, no personality, no lorebook. */
const CARD = {
  name: 'Tomas Reyes',
  tagline: 'Night baker who knows every secret on the street',
  description: 'Tomas bakes bread at night in a small shop on Calle Mayor. He is kind and talks a lot.',
  firstMessage:
    '*Flour hangs in the light of the single bulb. Tomas slides a tray out of the oven without looking, and nods at the stool by the counter.* "You are up late. Sit. The first loaves are never sold, they are for whoever comes in before the sun."',
}
/** What is typed in Personality: one trait per line, each with what he does that shows it. */
const PERSONALITY = [
  'Kind: he slips a warm roll into the bag of anyone who looks tired, and never mentions it.',
  'Talkative: he tells you the news of the whole street before you have taken off your coat.',
]
/** The note added to the lorebook, and the words that bring it into the chat. */
const NOTE = {
  keys: 'Lucia, sister',
  content: 'Lucia is the younger sister of Tomas. She left for the city three years ago and only writes at Christmas. He keeps her letters under the till.',
}

/** What the stand-in "writes" when asked for a fuller description: in the form the app asks for. */
const STAND_IN_DESCRIPTION = `### DESCRIPTION
Tomas Reyes, 46, bakes the bread of Calle Mayor every night in a shop no wider than a corridor.
Hands: broad and floured to the wrist; he drums them on the counter when a story gets good.
Eyes: dark and creased at the corners, and they slide to the door whenever it opens.
Apron: patched twice, with a pencil behind the strap for the orders he never writes down.
Voice: warm and quick, full of "listen" and "between us", and he answers a question with another story.
Past: he took over the oven from his father at twenty, and has not had a night off since. The street tells him everything, because he is the only one awake. His sister left for the city and the shop feels too big without her.
With {{user}}: he feeds {{user}} first and asks questions later, and wants someone to stay past dawn. He never says how tired he is.`

/**
 * This film's data folder (site/.film/improve-data), ready for a first launch. Kept from
 * one time to the next for the engine alone, as lib.cjs's modelData does for chat-data.
 */
function improveData() {
  const data = path.join(work, 'improve-data')
  fs.mkdirSync(data, { recursive: true })
  for (const entry of fs.readdirSync(data)) {
    if (entry !== 'engine') fs.rmSync(path.join(data, entry), { recursive: true, force: true })
  }
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  if (process.env.STAND_IN !== '1') return { data, env: {} }

  fs.rmSync(path.join(data, 'engine'), { recursive: true, force: true })
  placeStandIn(data)
  const models = path.join(work, 'improve-stand-in-models')
  fs.rmSync(models, { recursive: true, force: true })
  return { data, env: { OLLAMA_MODELS: models, FAKE_REPLY: STAND_IN_DESCRIPTION, FAKE_PULL_MS: '25' } }
}

/**
 * Scrolls `box` (a part of the window that scrolls by itself) with the wheel, the pointer
 * over it, until `target` is comfortably inside it. The shared `press` scrolls too, but
 * measures against the bottom of the window, not of the box.
 */
async function scrollInto(page, glide, target, box) {
  const area = await box.boundingBox()
  await glide(area.x + area.width * 0.5, area.y + area.height * 0.6, 600)
  let still = 0
  let before = null
  for (let turn = 0; turn < 80 && still < 5; turn++) {
    const where = await target.boundingBox()
    if (where.y + where.height <= area.y + area.height - 16) return
    still = where.y === before ? still + 1 : 0
    before = where.y
    await page.mouse.wheel(0, 40)
    await sleep(50)
  }
}

;(async () => {
  requireBuiltApp()
  const { data, env } = improveData()

  const film = await openApp({ film: 'improve', data, env })
  const { page, press, glide, mark } = film

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: 'Suzu Amano' })
    await warmUp(page)
    await page.getByText('Library', { exact: true }).click()
    await page.locator('button:has-text("New character")').first().click()
    await page.fill('[aria-label="Character name"]', CARD.name)
    await page.fill('[aria-label="Tagline"]', CARD.tagline)
    await page.fill('[data-section="DESCRIPTION"]', CARD.description)
    await page.getByRole('tab', { name: 'Greetings' }).click()
    await page.fill('[data-section="FIRST MESSAGE"]', CARD.firstMessage)
    await page.locator('button:has-text("Create character")').click()
    await page.locator('textarea[aria-label="Message"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.mouse.move(560, 690)
    await sleep(6000) // The mood of the first message has played.

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('advice', 'Read the advice')
    await sleep(900)
    const toImprove = page.locator('button.to-improve')
    await toImprove.waitFor({ state: 'visible', timeout: 10_000 })
    await press(toImprove, { dx: 0.3, ms: 650, hold: 700 })
    const thin = page.locator('.advice .tip[data-tip="description-short"]')
    await thin.waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(500)
    await glide(560, 150, 700) // Down the list of advice.
    await sleep(3000)

    mark('fix', 'Let the model fix it')
    await press(thin.locator('button', { hasText: 'Write a fuller one' }), { hold: 300 })
    await glide(600, 470, 700) // Over the description, out of the way of what is being written.
    const done = page.locator('.advice .note.done')
    await done.waitFor({ state: 'visible', timeout: 10 * 60_000 })
    await sleep(3500) // "The description is new…", and the description itself.

    mark('personality', 'One trait per line')
    const personality = page.locator('[data-section="PERSONALITY"]')
    await scrollInto(page, glide, personality, page.locator('dialog.editor .fields'))
    await sleep(400)
    await press(personality, { dx: 0.3, dy: 0.3 })
    await sleep(300)
    await film.type(PERSONALITY[0], 38)
    await page.keyboard.press('Enter')
    await film.type(PERSONALITY[1], 38)
    await sleep(1800)

    mark('lorebook', 'Add notes to the lorebook')
    await press(page.getByRole('tab', { name: 'Lorebook' }))
    await sleep(1200)
    await press(page.locator('dialog.editor button:has-text("Add an entry")'))
    const keywords = page.locator('dialog.editor .entry.open input[type="text"]').first()
    await keywords.waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(400)
    await film.type(NOTE.keys, 70)
    await sleep(400)
    await press(page.locator('dialog.editor .entry.open textarea'), { dx: 0.3, dy: 0.3 })
    await film.type(NOTE.content, 30)
    await sleep(1500)
    await press(page.locator('dialog.editor button:has-text("Save")'))
    await page.locator('dialog.editor').waitFor({ state: 'hidden', timeout: 10_000 })
    await glide(960, 520, 700)
    await sleep(3500) // The line of advice under the name is gone.
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
