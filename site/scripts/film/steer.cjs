// Films the real app steering a story without writing much, with a real model: the film of
// the guide "Take the story where you want".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/steer.cjs
//                                             node scripts/film/assemble.cjs steer     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/steer-data, and not site/.film/chat-data like the other films, so
// that it can run while another script uses that one; yours is not touched), goes through
// the first launch with "Suzu Amano", and sends a first message so that the model is in
// memory. The first time, the engine is copied from site/.film/chat-data if it is there,
// rather than downloaded again. Then it films: "Something happens" is pressed with an
// empty box, the arrow under the reply writes another version and goes back and forth
// between the two, a few words of the reply are changed by hand ("Edit message"), and
// "More…" has the character go on by itself.
//
// THE MODEL IS REAL, and so is what it writes: look at the film before you keep it.
// Replies are asked to be short (about 70 words) so that the film stays short. The words
// changed by hand are the first EDIT_FROM found in the reply on screen, which become
// EDIT_TO; a real model will rarely have written them, and then EDIT_ADDED is added at the
// end of the reply instead (all three can be given, like MODEL).
//
//   MODEL="Gemma 4 · Medium" node scripts/film/steer.cjs     another model of the list
//
// STAND_IN=1 uses the stand-in for the model that the app's tests use: for trying the
// script, not for the site. Its replies come one after the other from STAND_IN_REPLIES below.

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, requireBuiltApp, placeStandIn, openApp, firstLaunch, written, warmUp } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = process.env.MODEL || 'Gemma 4 · Small'
const FILM = 'steer'
/** What is changed by hand in the reply, and what it becomes. */
const EDIT_FROM = process.env.EDIT_FROM || 'the headmaster'
const EDIT_TO = process.env.EDIT_TO || 'my grandmother'
/** What is added at the end of the reply when it does not have EDIT_FROM. */
const EDIT_ADDED = process.env.EDIT_ADDED || '"And you are holding the cake, ground crew."'

/** What the stand-in writes, in order: the warm-up, "Something happens", another version, "More…". */
const STAND_IN_REPLIES = [
  '"Talk later, ground crew. Hold on to something."',
  '*A sharp crack, and the paper parcel on the bristles splits open. Something small and furry tumbles out, hits the concrete and bolts for the stairwell.* "No, no, no! That was the first delivery!" *Suzu yanks the broom around.* "Robin, the door! Shut the door!"',
  '*Every phone on the roof starts ringing at once, the two floating ones included.* "That is never a good sign." *Suzu plucks one out of the air and squints at the screen.* "It is the headmaster calling. About the cake, I bet."',
  '*Suzu lets it ring and slips the phone into her blazer.* "She can wait. She always calls in the middle of a delivery." *She pats the broom, which wags its bristles.* "Biscuit, back stairs. Robin, the parcel. We are already late."',
]

/** An engine the app downloaded, not the stand-in (a small shell script) left by STAND_IN=1. */
function isRealEngine(folder) {
  if (!fs.existsSync(folder)) return false
  return fs.readdirSync(folder).some((version) => {
    try {
      const { binary } = JSON.parse(fs.readFileSync(path.join(folder, version, '.complete'), 'utf8'))
      return !fs.readFileSync(path.join(folder, version, binary)).subarray(0, 2).equals(Buffer.from('#!'))
    } catch {
      return false
    }
  })
}

/**
 * What modelData() of lib.cjs does, with site/.film/steer-data as the data folder: kept
 * from one time to the next for the engine alone, everything else removed so that the app
 * opens as on its first day. With STAND_IN=1 the stand-in takes the place of the engine.
 */
function filmData(settings, standIn = {}) {
  const data = path.join(work, `${FILM}-data`)
  fs.mkdirSync(data, { recursive: true })
  for (const entry of fs.readdirSync(data)) {
    if (entry !== 'engine') fs.rmSync(path.join(data, entry), { recursive: true, force: true })
  }
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true, ...settings }))
  if (process.env.STAND_IN !== '1') {
    // The engine the other films downloaded, rather than downloading it again.
    const shared = path.join(work, 'chat-data', 'engine')
    const own = path.join(data, 'engine')
    if (!isRealEngine(own)) fs.rmSync(own, { recursive: true, force: true })
    if (!fs.existsSync(own) && isRealEngine(shared)) fs.cpSync(shared, own, { recursive: true, verbatimSymlinks: true })
    return { data, env: {}, isStandIn: false }
  }
  fs.rmSync(path.join(data, 'engine'), { recursive: true, force: true })
  placeStandIn(data)
  const models = path.join(work, `${FILM}-stand-in-models`)
  fs.rmSync(models, { recursive: true, force: true })
  // FAKE_PULL_MS is also how long the stand-in waits between two words: slow enough to be seen writing.
  return { data, env: { OLLAMA_MODELS: models, FAKE_PULL_MS: '45', ...standIn }, isStandIn: true }
}

;(async () => {
  requireBuiltApp()
  const { data, env } = filmData({ generation: { maxTokens: 110 } }, { FAKE_REPLY: STAND_IN_REPLIES.join('||') })

  const film = await openApp({ film: FILM, data, env })
  const { page, press, glide, mark } = film
  const composer = page.locator('textarea[aria-label="Message"]')
  const lastReply = () => page.locator('.message.assistant').last()
  /**
   * Scrolls the chat, as a wheel does, until `locator` is above the message box: press()
   * of lib.cjs only brings things above the bottom of the window, and the box covers the
   * end of the chat (a reply being edited grows under it).
   */
  async function reveal(locator) {
    const top = (await page.locator('.composer').boundingBox()).y - 12
    const box = await locator.boundingBox()
    await glide(540, Math.min(box.y, top - 40), 400)
    for (let turn = 0; turn < 40; turn++) {
      const now = await locator.boundingBox()
      if (now.y + now.height <= top) return
      await page.mouse.wheel(0, Math.min(40, now.y + now.height - top))
      await sleep(40)
    }
  }
  /** Where the pointer waits while the model writes: out of the way, on the left. */
  const rest = () => glide(150, 330, 600)

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: 'Suzu Amano' })
    await warmUp(page)
    await sleep(2500)

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('event', 'Something happens')
    await sleep(900)
    await press(page.locator('button.direction[data-direction="event"]'))
    await rest()
    await written(page)
    await sleep(1800)

    mark('version', 'Another version')
    await press(lastReply().locator('.swipes button[aria-label="Write another version"]'))
    await rest()
    await written(page)
    await sleep(1200)
    await press(lastReply().locator('.swipes button[aria-label="Previous version"]'))
    await sleep(1400)
    await press(lastReply().locator('.swipes button[aria-label="Next version"]'), { ms: 300 })
    await sleep(1400)

    mark('edit', 'Change a reply')
    const reply = lastReply()
    await press(reply.locator('button[aria-label="Edit message"]'))
    const editor = reply.locator('textarea[aria-label="Edit message"]')
    await editor.waitFor({ state: 'visible', timeout: 5000 })
    await sleep(700)
    // The words to change are selected, as a double click and a drag would.
    const found = await editor.evaluate((field, wanted) => {
      const start = field.value.indexOf(wanted)
      field.focus()
      // Not written by the model: a line is added at the end instead.
      if (start < 0) field.setSelectionRange(field.value.length, field.value.length)
      else field.setSelectionRange(start, start + wanted.length)
      return start >= 0
    }, EDIT_FROM)
    await sleep(900)
    await film.type(found ? EDIT_TO : ` ${EDIT_ADDED}`, 70)
    await sleep(600)
    const save = reply.locator('.editor button[type="submit"]')
    await reveal(save)
    await press(save)
    await sleep(1800)

    mark('more', 'More…')
    await press(page.locator('button.direction.more'))
    await rest()
    await written(page)
    await sleep(3000)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
