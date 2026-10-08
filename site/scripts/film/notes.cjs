// Plays a short story in the real app, with a real model, and writes down what the app
// noted by itself along the way: where the scene is, what the character wears, what it
// remembers of the first messages, where the story is heading, and the tastes it learned.
// The part "It keeps the story straight" of the site shows these notes as they came out.
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/notes.cjs
//
// What it does: it opens the built app with a data folder of its own (site/.film/chat-data,
// shared with chat.cjs; yours is not touched), goes through the first launch, and writes
// the ten lines below to the character, one after the other, waiting for each reply. In
// one of them a scarf changes hands, in another the scene moves to a bakery: that is how
// the notes on clothes and on the place are put to the test. It takes a few minutes.
//
// It writes:
//   app/data/notes.json     what the site shows (nothing in it is written by hand)
//   .film/notes/log.json    every line, every reply, and the notes after each: read it
//                           before keeping notes.json, a model does not always get it right
//   .film/notes/*.png       pictures of the Memory tab and of "Adapts to you", as proof
//
// Three settings differ from a fresh install, so that ten messages are enough:
//   - "Learn my tastes" and "Follow where each story is heading" are turned on (they are
//     in beta, and off until the user turns them on);
//   - the model reads 4,096 tokens at once instead of what it can, so that the chat
//     outgrows it and a memory is written.
//
//   MODEL="Gemma 4 · Medium" node scripts/film/notes.cjs     another model of the list
//
// STAND_IN=1 uses the stand-in for the model that the app's tests use: for trying the
// script. What it writes then goes to .film/notes/notes.stand-in.json, never to the site.

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, requireBuiltApp, modelData, openApp, firstLaunch, written } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = process.env.MODEL || 'Gemma 4 · Small'
const STORY = 'Suzu Amano'

/** What is written to the character. The fourth changes her clothes, the seventh the place. */
const LINES = [
  '*I grab the parcel before it bites.* "Where to first?"',
  '*I climb on behind her and hold on.* "Slowly, please. I would like to enjoy the view, not scream at it."',
  '"So what is actually in the parcel? It growled at me. Twice."',
  '*It is cold up here. I take off my scarf and hand it to her.* "Put this on. You are flying in short sleeves."',
  '"Tell me how you ended up delivering things on a broom. Take your time, we have the whole sky."',
  '*I laugh.* "Does the broom have a name? It feels like it has opinions."',
  '*We land. I follow her into the old bakery on the corner and let the door close behind us.* "It smells like cinnamon."',
  '"Let us sit by the window for a minute before the next stop. No rush."',
  '*I nudge the parcel across the table with one finger.* "Your turn to hold it."',
  '"Before we go: what is the strangest thing you ever had to deliver?"',
]

;(async () => {
  requireBuiltApp()

  const { data, env, isStandIn } = modelData(
    { generation: { autoContext: false, contextSize: 4096 }, adapt: { learnTastes: true, followStory: true } },
    { FAKE_PLACE: 'the roof of the school', FAKE_OUTFIT: 'a school uniform' },
  )

  const out = path.join(work, 'notes')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })

  const film = await openApp({ film: 'notes', data, env })
  const { page } = film
  const sendButton = page.locator('button[aria-label="Send"]')
  const composer = page.locator('textarea[aria-label="Message"]')
  const value = (label) => page.locator(`[aria-label="${label}"]`).first().inputValue({ timeout: 2000 }).then((text) => text.trim(), () => '')

  const log = []
  let modelName = MODEL
  try {
    // --- The first launch -----------------------------------------------------------------
    modelName = await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })
    await page.getByRole('tab', { name: 'Memory' }).click()

    // --- The story --------------------------------------------------------------------------
    for (const [index, line] of LINES.entries()) {
      await composer.fill(line)
      await sendButton.click()
      await written(page)
      // The app asks the model where the scene is and what is worn, then (every eight
      // messages) what the user seems to enjoy: both are short, and neither is on screen.
      await sleep(index === 7 ? 25_000 : 6000)
      const entry = {
        line,
        reply: (await page.locator('.message').last().innerText()).replace(/\s+/g, ' ').trim(),
        place: await value('Where the scene is'),
        outfit: await value(`What ${STORY} is wearing`),
      }
      log.push(entry)
      console.log(`${index + 1}/${LINES.length}  place: ${entry.place || '(not known)'}  |  wearing: ${entry.outfit || '(not known)'}`)
    }

    await page.screenshot({ path: path.join(out, 'chat.png') })
    await page.getByRole('tab', { name: 'Memory' }).evaluate((tab) => tab.scrollIntoView({ block: 'start' }))
    await sleep(400)
    await page.screenshot({ path: path.join(out, 'memory-top.png') })
    const story = page.locator('[aria-label="Where this story is heading"]')
    if (await story.count()) {
      await story.evaluate((field) => field.scrollIntoView({ block: 'end' }))
      await sleep(400)
      await page.screenshot({ path: path.join(out, 'memory-foot.png') })
    }

    const memoryLabel = await page
      .locator('label', { has: page.locator('[aria-label="Memory of this chat"]') })
      .locator('.field-label')
      .textContent({ timeout: 2000 })
      .then((text) => text.replace(/\s+/g, ' ').trim(), () => '')
    const memory = await value('Memory of this chat')
    const heading = await value('Where this story is heading')

    await page.evaluate(() => (location.hash = '#/settings/adapt'))
    await sleep(1500)
    await page.screenshot({ path: path.join(out, 'adapt.png') })
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'))

    /** The values a note took, one after the other, without the repeats. */
    const trail = (key) => log.map((entry) => entry[key]).filter((text, index, all) => text && text !== all[index - 1])
    const notes = {
      model: modelName,
      character: STORY,
      messages: LINES.length * 2 + 1,
      places: trail('place'),
      outfits: trail('outfit'),
      memory: memory ? { covers: Number(/\d+/.exec(memoryLabel)?.[0] ?? 0), text: memory } : null,
      heading: heading || null,
      likes: saved.adapt?.likes ?? [],
      dislikes: saved.adapt?.dislikes ?? [],
    }

    fs.writeFileSync(path.join(out, 'log.json'), `${JSON.stringify(log, null, 2)}\n`)
    const target = isStandIn ? path.join(out, 'notes.stand-in.json') : path.resolve(__dirname, '../../app/data/notes.json')
    fs.writeFileSync(target, `${JSON.stringify(notes, null, 2)}\n`)
    console.log(`Written: ${target}`)
    console.log(`Read ${path.join(out, 'log.json')} before keeping it.`)
  } catch (error) {
    fs.writeFileSync(path.join(out, 'log.json'), `${JSON.stringify(log, null, 2)}\n`)
    await page.screenshot({ path: path.join(out, 'where-it-stopped.png') }).catch(() => {})
    console.error('It stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
