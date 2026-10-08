// Films the real app writing a character from one sentence, with a real model: the film
// of the guide "A character from one sentence".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/character.cjs
//                                             node scripts/film/assemble.cjs character     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/chat-data; yours is not touched), goes through the first launch and
// sends a first message so that the model is in memory. Then it films: "New character" is
// opened, a sentence is typed, a mood is pressed, the model writes the card, and the
// character is created.
//
// THE MODEL IS REAL, and so is the character it writes: look at the film before you keep
// it. Writing a whole card takes a model a while (half a minute or more with the small
// one): assemble.cjs shows that part quicker than life, and the site says so.
//
//   MODEL="Gemma 4 · Medium" node scripts/film/character.cjs     another model of the list
//
// STAND_IN=1 uses the stand-in for the model that the app's tests use: for trying the
// script, not for the site.

const { sleep, requireBuiltApp, modelData, openApp, firstLaunch, warmUp } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = process.env.MODEL || 'Gemma 4 · Small'
/** The sentence the character is written from, and the mood pressed with it. */
const IDEA = process.env.IDEA || 'A grumpy lighthouse keeper who talks to the sea'
const MOOD = 'Funny'

/** What the stand-in "writes": a card in the form the app asks for. */
const STAND_IN_CARD = [
  '### NAME\nJuniper Vale',
  '### TAGLINE\nLighthouse keeper who talks to the sea',
  '### DESCRIPTION\nJuniper has kept the Saltmere lighthouse alone for eleven winters. She is gruff, dry, and kinder than she lets on.',
  '### PERSONALITY\ngruff, dry humour, loyal',
  '### SCENARIO\n{{user}} arrives at the lighthouse on the evening of a storm.',
  '### TAGS\nSlice of life, Comedy, Coastal',
  '### FIRST MESSAGE\n*Juniper does not turn from the glass.* "The sea said someone was coming. He is usually wrong about the day."',
].join('\n\n')

;(async () => {
  requireBuiltApp()
  const { data, env } = modelData({}, { FAKE_REPLY: `Hello.||${STAND_IN_CARD}` })

  const film = await openApp({ film: 'character', data, env })
  const { page, press, glide, mark } = film

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: 'Suzu Amano' })
    await warmUp(page)
    await page.getByText('Library', { exact: true }).click()
    await sleep(1500)

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('new', 'Open a new character')
    await sleep(900)
    await press(page.locator('button:has-text("New character")').first())
    await sleep(1400)

    mark('describe', 'Describe it in a sentence')
    await press(page.locator('[aria-label="Describe your character"]'), { dx: 0.3 })
    await sleep(250)
    await film.type(IDEA, 45)
    await sleep(500)
    await press(page.locator('[aria-label="Mood"] button', { hasText: MOOD }))
    await sleep(900)

    mark('writes', 'Let the model write')
    await press(page.locator('button:has-text("Write it for me")'))
    await glide(560, 520, 700) // Over the card, out of the way of what is being written.
    // The button says "Write again" once the card is written to its end.
    await page.locator('button:has-text("Write again")').waitFor({ state: 'visible', timeout: 10 * 60_000 })
    await sleep(1500)

    mark('create', 'Read it, then create')
    await press(page.getByRole('tab', { name: 'Greetings' }))
    await sleep(2200)
    await press(page.locator('button:has-text("Create character")'))
    await page.locator('textarea[aria-label="Message"]').waitFor({ state: 'visible', timeout: 20_000 })
    await glide(700, 520, 600)
    await sleep(4200) // The first message of the new character.
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
