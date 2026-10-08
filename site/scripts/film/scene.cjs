// Films the real app with two characters in one chat, with a real model: the film of the
// guide "Several characters in one scene".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/scene.cjs
//                                             node scripts/film/assemble.cjs scene     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/chat-data; yours is not touched), goes through the first launch,
// takes a second story from the Library so that there are two characters, and sends a
// first message so that the model is in memory. Then it films: the second character is
// brought into the chat, a line is written, both answer in turn, and a click on a name
// makes that character speak again.
//
// THE MODEL IS REAL, and so is what it writes: look at the film before you keep it.
// Replies are asked to be short (about 70 words) so that the film stays short.
//
// The list that opens under "Add a character" is the computer's own menu, which is not in
// the pictures: the film shows the pointer on the button, then the character arriving.
//
//   MODEL="Gemma 4 · Medium" node scripts/film/scene.cjs     another model of the list
//
// STAND_IN=1 uses the stand-in for the model that the app's tests use: for trying the
// script, not for the site.

const { sleep, requireBuiltApp, modelData, openApp, firstLaunch, written, warmUp } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = process.env.MODEL || 'Gemma 4 · Small'
/** The character the chat is with, and the one who joins. */
const FIRST = 'Suzu Amano'
const SECOND = 'Mordax'
/** What is written to both of them in the film. */
const LINE = process.env.LINE || '"Suzu, this is Mordax. He was summoned by accident and would like a lift home."'

;(async () => {
  requireBuiltApp()
  const { data, env } = modelData(
    { generation: { maxTokens: 110 } },
    { FAKE_REPLY: 'Hello.||*She looks him up and down.* "He does not look like he fits on a broom."||*He straightens his collar.* "I have travelled in worse."||"Then hold on to something."' },
  )

  const film = await openApp({ film: 'scene', data, env })
  const { page, press, glide, mark } = film
  const composer = page.locator('textarea[aria-label="Message"]')

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: FIRST })
    // The second character: one of the stories that wait in the Library.
    await page.getByText('Library', { exact: true }).click()
    const play = page.locator(`button[aria-label="Play ${SECOND}"]`)
    if (!(await play.count())) await page.locator('button', { hasText: /^Show all \d+ stories$/ }).click()
    await play.click()
    await composer.waitFor({ state: 'visible', timeout: 20_000 })
    // Back to the first one, whose chat the film is about.
    await page.locator('aside, nav').locator('button, a', { hasText: FIRST }).first().click()
    await page.locator('.message', { hasText: FIRST }).first().waitFor({ state: 'visible', timeout: 10_000 })
    await warmUp(page)
    await sleep(3000)

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('add', 'Add a character')
    await sleep(900)
    const adding = page.locator('select[aria-label="Add a character to this chat"]')
    const button = await adding.locator('xpath=..').boundingBox()
    await glide(button.x + button.width / 2, button.y + button.height / 2, 600)
    await sleep(600)
    await adding.selectOption({ label: SECOND })
    await page.locator('.scene .member', { hasText: SECOND }).waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(2000)

    mark('write', 'Write to both')
    await press(composer, { dx: 0.3 })
    await sleep(250)
    await film.type(LINE, 40)
    await sleep(400)
    await press(page.locator('button[aria-label="Send"]'))
    await glide(150, 330, 600)
    await written(page)
    await sleep(1500)

    mark('speak', 'Make someone speak')
    await press(page.locator('.scene .member', { hasText: SECOND }).locator('.speak'))
    await glide(150, 330, 500)
    await written(page)
    await sleep(3000)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
