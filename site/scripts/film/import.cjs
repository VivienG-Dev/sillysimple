// Films the real app importing a character card: the film of the guide "Bring your
// SillyTavern characters".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/import.cjs
//                                             node scripts/film/assemble.cjs import     (needs ffmpeg)
//
// What it does: the Library is opened, "Import cards" is pressed, a card is picked, the
// character appears among the others, and a chat with it is opened.
//
// The card that is imported is one the app wrote itself: before filming, the app is
// opened once on the side and the character below is typed into "New character", which
// leaves her card (a .json file in the format SillyTavern uses) in its data folder. That
// file is what the film imports, into an app that has never heard of her.
//
// No model writes anything here: the stand-in for Ollama that the app's tests use is put
// in the place of the app's engine, so nothing is downloaded. The window where a file is
// picked is the computer's own, and is not in the film: the card is handed to the app
// directly.
//
// It was written and run on Linux, without a screen. On a Mac it opens the app's window
// for real: leave the mouse alone while it films.

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, firstLaunch, YOUR_OLLAMA } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = 'Gemma 4 · Small'
/** The story both apps start with. */
const FIRST = 'Suzu Amano'
/** The character whose card is imported: not one of the stories that come with the app. */
const CARD = {
  name: 'Juniper Vale',
  tagline: 'Lighthouse keeper who talks to the sea',
  description:
    'Juniper Vale has kept the Saltmere lighthouse alone for eleven winters. She is gruff, dry, and kinder than she lets on. She speaks to the sea as to an old neighbour who never returns what he borrows, and she distrusts anyone who arrives by the land road.',
  firstMessage:
    '*The lamp room smells of oil and cold tea. Juniper does not turn from the glass when the stairs creak.* "The sea said someone was coming. He is usually wrong about the day." *She points at the kettle with her chin.* "Sit. {{user}}, is it? You can explain yourself while that boils."',
}

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sillysimple-film-'))
  const env = { OLLAMA_MODELS: path.join(scratch, 'models') }
  const folder = (name) => {
    const data = path.join(scratch, name)
    fs.mkdirSync(data)
    fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
    placeStandIn(data)
    return data
  }

  // --- On the side: an app where the character is written, to get her card ---------------
  const aside = folder('aside')
  const first = await openApp({ film: 'import-aside', data: aside, env })
  await firstLaunch(first.page, { name: NAME, model: MODEL, story: FIRST })
  const before = new Set(fs.readdirSync(path.join(aside, 'characters')))
  await first.page.getByText('Library', { exact: true }).click()
  await first.page.locator('button:has-text("New character")').first().click()
  await first.page.fill('[aria-label="Character name"]', CARD.name)
  await first.page.fill('[aria-label="Tagline"]', CARD.tagline)
  await first.page.fill('[data-section="DESCRIPTION"]', CARD.description)
  await first.page.getByRole('tab', { name: 'Greetings' }).click()
  await first.page.fill('[data-section="FIRST MESSAGE"]', CARD.firstMessage)
  await first.page.locator('button:has-text("Create character")').click()
  await first.page.locator('textarea[aria-label="Message"]').waitFor({ state: 'visible', timeout: 15_000 })
  await sleep(500)
  await first.end()
  const written = fs.readdirSync(path.join(aside, 'characters')).find((file) => !before.has(file))
  if (!written) throw new Error('The app wrote no card to import.')
  const card = path.join(scratch, `${CARD.name}${path.extname(written)}`)
  fs.copyFileSync(path.join(aside, 'characters', written), card)

  // --- The film -------------------------------------------------------------------------
  const film = await openApp({ film: 'import', data: folder('data'), env })
  const { page, press, glide, mark } = film

  try {
    await firstLaunch(page, { name: NAME, model: MODEL, story: FIRST })
    await sleep(6000) // The mood of the first message has played.

    await film.start()
    mark('library', 'Open the Library')
    await sleep(900)
    await press(page.getByText('Library', { exact: true }))
    await sleep(600)
    await glide(640, 420, 500)
    await sleep(1600)

    mark('import', 'Import your cards')
    const choosing = page.waitForEvent('filechooser', { timeout: 10_000 })
    await press(page.locator('button:has-text("Import cards")'))
    await (await choosing).setFiles(card)
    const hers = page.locator('.card-open', { hasText: CARD.name })
    await hers.waitFor({ state: 'attached', timeout: 15_000 })
    await sleep(1800) // "Imported Juniper Vale."

    mark('chat', 'Start a chat')
    // Down the page to her card, among the user's own characters, then a click on it.
    await press(hers, { dy: 0.4, ms: 650, hold: 1300 })
    await page.locator('textarea[aria-label="Message"]').waitFor({ state: 'visible', timeout: 15_000 })
    await glide(700, 520, 600)
    await sleep(4200) // Her first message.
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
  fs.rmSync(scratch, { recursive: true, force: true })
})()
