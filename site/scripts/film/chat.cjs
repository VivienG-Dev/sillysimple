// Films the real app in the middle of a chat, with a real model: the film at the top of
// the site. A line is written, the character answers, and another version of the reply is
// asked for. When a reply changes the character's mood, the mood plays on its picture.
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/chat.cjs
//                                             node scripts/film/assemble.cjs chat     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/chat-data; yours is not touched), goes through the first launch,
// picks the model and the story, and sends a first message so that the model is in
// memory. That message is deleted, and it films from there. Every picture the window draws
// is kept in site/.film/chat/frames, with the time it was drawn.
//
// THE MODEL IS REAL, and so is what it writes: look at the film before you keep it. The
// reply is shown at the speed it was written. Replies are asked to be short (about 70
// words) so that the film stays short.
//
// The first time, the app downloads its own engine into that folder (167 MB on a Mac),
// and the model if it is not on this computer yet (4.6 GB for the small one). Both are
// kept for the next time. With Ollama open, the app uses yours and downloads no engine.
//
//   MODEL="Gemma 4 · Medium" node scripts/film/chat.cjs     another model of the list
//   SCALE=1.5 node scripts/film/chat.cjs                    on a screen that is not Retina
//
// It was written on Linux and tried there with a stand-in for the model
// (STAND_IN=1, which writes a fixed sentence: for trying the script, not for the site).
// On a Mac (run there on 7 October 2026) it opens the app's window for real: leave the
// mouse alone while it films.

const { sleep, requireBuiltApp, modelData, openApp, firstLaunch, written, warmUp } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
/** The model, as its line is written in the app. The small one: what a computer with 8 GB gets. */
const MODEL = process.env.MODEL || 'Gemma 4 · Small'
const STORY = 'Suzu Amano'
/** What is written to the character in the film. */
const LINE = process.env.LINE || '*I grab the parcel before it bites.* "Where to first?"'

;(async () => {
  requireBuiltApp()

  // Short replies, so that the film stays short.
  const { data, env } = modelData(
    { generation: { maxTokens: 110 } },
    { FAKE_REPLY: '*Suzu laughs and tips the broom toward the stairwell.* "The bakery, before the bread goes cold. Hold on to that parcel, ground crew."' },
  )

  const film = await openApp({ film: 'chat', data, env })
  const { page, press, glide, mark } = film
  const sendButton = page.locator('button[aria-label="Send"]')
  const composer = page.locator('textarea[aria-label="Message"]')

  try {
    // --- Not filmed: the first launch, and a first message ----------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })

    await warmUp(page)

    // --- Filmed ---------------------------------------------------------------------------
    await film.start()
    mark('write', 'Write a line')
    await sleep(900)
    await press(composer, { dx: 0.3 })
    await sleep(250)
    await film.type(LINE, 45)
    await sleep(400)
    await press(sendButton)

    mark('answer', 'The character answers')
    await glide(150, 330, 600) // Out of the way of the reply and of the picture.
    await written(page)

    // A mood plays on the picture when it is not the one the chat was in already: the
    // film leaves it the time to, after each reply. A still moment is shortened afterwards.
    await sleep(4800)

    mark('again', 'Another version')
    await press(page.getByRole('button', { name: 'Write another version' }).last())
    await glide(150, 330, 500)
    await written(page)
    await sleep(4800)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
