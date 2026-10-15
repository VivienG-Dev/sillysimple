// Films the real app keeping the memory of a long story, with a real model: the film of
// the guide "Long stories".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/memory.cjs
//                                             node scripts/film/assemble.cjs memory     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/memory-data, and not site/.film/chat-data like the other films, so
// that it can run while another script uses that one; yours is not touched), goes through
// the first launch with "Suzu Amano", and sends a first message so that the model is in
// memory. The first time, the engine is copied from site/.film/chat-data if it is there,
// rather than downloaded again.
//
// A real chat takes hours to outgrow what a model reads. So that it happens within the
// film, the settings it starts with give the model a small context (CONTEXT tokens, set by
// hand: "Context size" in Settings › Generation, the automatic size turned off), and lines
// are sent before filming until the gauge under the box is full ("1 oldest message left
// out"): the next line sent has the model sum up the oldest messages. Then it films: the
// gauge; a line sent, "Remembering earlier messages…" while the model sums them up, then
// the reply; the Memory tab of the panel on the right, where that summary is; a line
// added to it by hand, saved when the field is left.
//
// THE MODEL IS REAL, and so is the memory it writes: look at the film before you keep it.
// By hand, MEMORY_ADDED is added at the end of the memory (something the story should not
// forget). With MEMORY_FROM and MEMORY_TO given, the first MEMORY_FROM found in the memory
// becomes MEMORY_TO instead: a correction, for when the model got something wrong.
//
//   MODEL="Gemma 4 · Medium" node scripts/film/memory.cjs     another model of the list
//
// STAND_IN=1 uses the stand-in for the model that the app's tests use: for trying the
// script, not for the site. Its replies come one after the other from STAND_IN_REPLIES
// below, the summary included: the order is the order of the requests the app makes (with
// these replies, 8 lines are sent before filming, and the 9th request is the summary).

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, requireBuiltApp, placeStandIn, openApp, firstLaunch, written, warmUp } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = process.env.MODEL || 'Gemma 4 · Small'
const FILM = 'memory'
/** The context the model is given: small, so that the chat outgrows it within the film. */
const CONTEXT = Number(process.env.CONTEXT || 2048)
/** What can be corrected by hand in the memory, and what it becomes: for a film made again, once the memory is known. */
const MEMORY_FROM = process.env.MEMORY_FROM || ''
const MEMORY_TO = process.env.MEMORY_TO || ''
/** What is added at the end of the memory, unless MEMORY_FROM is given and found. */
const MEMORY_ADDED = process.env.MEMORY_ADDED || 'Robin is afraid of heights, but did not tell Suzu.'

/** What Robin says: the lines sent before filming (as many as it takes), then the one of the film. */
const LINES_BEFORE = [
  '*I take the parcel, holding it at arm\'s length.* "Fine. Where is the first stop?"',
  '"Can we fly a little lower? The clock tower is coming up fast."',
  '*I peek into the parcel.* "Suzu, why is it humming?"',
  '"Okay, but if it bites me, you are paying for the plasters."',
  '"Is that the bakery down there? I can smell it from here."',
  '"Who is the second parcel for?"',
  '"Does Biscuit ever get tired?"',
  '*I hold on tighter.* "Please tell me that was the wind."',
  '"Do you do this every day after class?"',
  '"What happens if we miss the last bell?"',
]
const LINE_FILMED = '"Last question, I promise: is it a dragon?"'

/** What the stand-in writes, in the order the app asks: the warm-up, the replies, and the memory where it is asked for. */
const STAND_IN_REPLIES = [
  '"Talk later, ground crew. Hold on to something."',
  '*Suzu tilts the broom toward the old clock tower.* "First stop is Mrs. Okada, top floor of the tower. She ordered it last week and she is not patient." *The parcel twitches in your arms.* "Hold it level. It hates being tipped."',
  '"Lower is slower." *She dips anyway, just enough for the wind to stop roaring.* "Better? Keep your knees in, the spire is closer than it looks." *Her headphones slide down around her neck.*',
  '*Suzu glances back and her face goes very still.* "Humming is fine. Humming means it is asleep." *A pause.* "Growling would be bad. Let us not find out what growling sounds like."',
  '"Deal. I will even throw in a slice of cake." *She points the fork at the floating plate.* "That one. It has been orbiting me since lunch."',
  '*She grins without looking down.* "Corner bakery, best melon bread in Hoshimi. Second stop, actually. If we are quick, we get the warm ones."',
  '"The baker\'s daughter. It is a birthday present." *Suzu lowers her voice.* "Do not tell her it purrs. It is a surprise."',
  '"Biscuit? Never. She sulks, though." *The broom bucks under you, offended.* "See? Sulking. Say sorry to her."',
  '*Suzu does not answer. Far below, a bell starts to ring.* "Faster, Biscuit."',
  // The memory, asked for when the oldest messages stop fitting.
  'Suzu Amano, a witch and Robin\'s classmate at Hoshimi High, met Robin on the school roof, sitting on her floating broom, Biscuit, with a fork, two phones and a slice of strawberry cake turning around her. She gave Robin a parcel to carry: three deliveries had to be made before the last bell. They flew toward the old clock tower, where Mrs. Okada waits for the first parcel, which hums when it sleeps. Suzu promised Robin a slice of cake if the parcel bites.',
  '*Suzu laughs, a little too loudly.* "A dragon? In a parcel this size? Do not be silly." *The parcel lets out a tiny puff of smoke.*',
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
 * What modelData() of lib.cjs does, with site/.film/memory-data as the data folder: kept
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
  const { data, env } = filmData(
    { generation: { autoContext: false, contextSize: CONTEXT, maxTokens: 110 } },
    { FAKE_REPLY: STAND_IN_REPLIES.join('||') },
  )

  const film = await openApp({ film: FILM, data, env })
  const { page, press, glide, mark } = film
  const composer = page.locator('textarea[aria-label="Message"]')
  const gauge = page.locator('.composer .context')
  const memoryTab = page.locator('.panel [role="tab"]', { hasText: 'Memory' })
  const memoryText = page.locator('textarea[aria-label="Memory of this chat"]')
  /** Where the pointer waits while the model writes: out of the way, on the left. */
  const rest = () => glide(150, 330, 600)
  /** Writes a line in the box and sends it, as a hand does. */
  async function say(line) {
    await press(composer, { dx: 0.3 })
    await sleep(250)
    await film.type(line, 35)
    await sleep(400)
    await press(page.locator('button[aria-label="Send"]'))
    await rest()
  }

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: 'Suzu Amano' })
    await warmUp(page)
    // Lines until the gauge says that the oldest messages no longer fit: the next line
    // sent has the model sum them up.
    let sent = 0
    while (!(await gauge.evaluate((link) => link.classList.contains('full')))) {
      if (sent >= LINES_BEFORE.length) throw new Error('The gauge is not full yet: add lines to LINES_BEFORE, or lower CONTEXT.')
      await composer.fill(LINES_BEFORE[sent++])
      await page.locator('button[aria-label="Send"]').click()
      await written(page)
      if (await memoryText.count()) throw new Error('The memory was written before the film.')
    }
    console.log(`${sent} lines sent before filming: ${(await gauge.textContent()).replace(/\s+/g, ' ').trim()}`)
    await page.mouse.move(560, 690)
    await sleep(2500)

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('gauge', 'Watch the gauge')
    await sleep(700)
    const at = await gauge.boundingBox()
    // Just under it, so as not to hide what it says.
    await glide(at.x + at.width * 0.6, at.y + at.height + 3, 800)
    await sleep(2600)

    mark('remember', 'Remembering earlier messages…')
    // Watched for all along: with a quick model it does not stay long on screen.
    let remembered = false
    const watching = setInterval(async () => {
      if (!remembered) remembered = await page.getByText('Remembering earlier messages…').isVisible().catch(() => false)
    }, 100)
    await say(LINE_FILMED)
    await written(page)
    clearInterval(watching)
    if (!remembered) throw new Error('"Remembering earlier messages…" was not seen.')
    await sleep(1800)

    mark('read', 'Read the memory')
    // Over the panel first, so that what scrolls is the panel.
    await glide(960, 520, 600)
    await press(memoryTab)
    await memoryText.waitFor({ state: 'visible', timeout: 5000 })
    await sleep(700)
    // The wheel is turned in the margin of the panel, beside the memory: over it, it
    // would scroll the memory's own text.
    await glide(1108, 470, 400)
    for (let turn = 0; turn < 60; turn++) {
      const box = await memoryText.boundingBox()
      if (box.y + box.height <= 610) break
      await page.mouse.wheel(0, 30)
      await sleep(30)
    }
    await sleep(2600)

    mark('correct', 'Correct it')
    const found = await memoryText.evaluate((field, wanted) => {
      const start = wanted ? field.value.indexOf(wanted) : -1
      return start >= 0 ? [start, start + wanted.length] : null
    }, MEMORY_FROM)
    await press(memoryText, { dx: 0.6, dy: 0.85 })
    await memoryText.evaluate((field, range) => {
      const [start, end] = range ?? [field.value.length, field.value.length]
      field.focus()
      field.setSelectionRange(start, end)
    }, found)
    await sleep(800)
    await film.type(found ? MEMORY_TO : ` ${MEMORY_ADDED}`, 45)
    await sleep(700)
    // Saved when the field is left.
    await memoryText.evaluate((field) => field.blur())
    await glide(1000, 230, 500)
    await sleep(2500)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
