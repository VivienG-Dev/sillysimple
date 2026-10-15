// Films the real app saving a backup on one computer and restoring it on another: the film
// of the guide "Keep your stories safe".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/backup.cjs
//      For the site, so that Data & Privacy shows a folder like a real one:
//      BACKUP_DATA="/Users/robin/Library/Application Support/SillySimple" node scripts/film/backup.cjs
//                                             node scripts/film/assemble.cjs backup     (needs ffmpeg)
//
// Two apps are filmed one after the other, each with a data folder of its own
// (site/.film/backup-data/first and …/second, emptied each time; yours is not touched),
// and their pictures are put end to end into one film:
//
//   the first computer   Not filmed: the first launch, and a short chat with Suzu Amano.
//                        Filmed: Settings › Data & Privacy is opened, where the folder of
//                        the app is shown, and "Save a backup…" saves the .zip.
//   the second computer  Not filmed: a first launch, as on a new computer: the chat only
//                        holds Suzu's first message. Filmed: "Restore a backup…" picks the
//                        .zip and says what it holds; "Restore backup" replaces everything,
//                        and the chat of the first computer is back.
//
// The windows where a file is saved or picked are the computer's own, and are not in the
// pictures: the script answers them itself, from inside the app, with a file in
// site/.film/backup-data-files/. It checks that the .zip was written.
//
// No model is needed, for trying or for the site: the stand-in for Ollama that the app's
// tests use is put in the place of the app's engine, and writes Suzu's few replies of the
// first chat, which is not filmed (only the restored chat is seen, a few seconds).
//
// It was written and run on Linux, without a screen. On a Mac it opens the app's window
// for real: leave the mouse alone while it films.

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, firstLaunch, written, YOUR_OLLAMA } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const MODEL = 'Gemma 4 · Small'
const STORY = 'Suzu Amano'
/** The chat of the first computer: what Robin writes, and what the stand-in answers. */
const LINES = ['*I catch my breath.* "Late? I ran all the way up here."', '"Fine. Where does the first one bite?"']
const REPLIES = [
  '*Suzu snorts and pats the broom behind her.* "Ran? You took the stairs like a tortoise. Get on, ground crew."',
  '"Ms. Okada\'s dog. Thinks parcels are a declaration of war." *She grins.* "You hold the box. I fly."',
]

const root = path.join(work, 'backup-data')
const files = path.join(work, 'backup-data-files')
const frames = path.join(work, 'backup', 'frames')

/**
 * A data folder of its own for each computer, with the stand-in for the model.
 * Data & Privacy shows where it is: BACKUP_DATA sets a folder that reads as a real one
 * ("/Users/robin/Library/Application Support/SillySimple"), used by both computers in turn
 * and emptied before each. It is removed and made again: never give it a folder you use.
 */
function freshData(name) {
  const data = process.env.BACKUP_DATA ? path.resolve(process.env.BACKUP_DATA) : path.join(root, name)
  if (process.env.BACKUP_DATA) fs.rmSync(data, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  placeStandIn(data)
  return data
}
const env = { OLLAMA_MODELS: path.join(root, 'models'), FAKE_REPLY: REPLIES.join('||') }

/** The computer's own windows to save or open a file, answered with `file` from inside the app. */
async function answerFileWindows(app, file) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: chosen })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] })
  }, file)
}

/** From the chat to Settings › Data & Privacy, as a hand would go. */
async function openDataPage({ page, press, glide }) {
  await press(page.locator('a[aria-label="Settings"]'))
  await page.locator('nav[aria-label="Settings sections"]').waitFor({ timeout: 10_000 })
  await sleep(700)
  await press(page.locator('nav[aria-label="Settings sections"] a', { hasText: 'Data & Privacy' }))
  await page.locator('h1', { hasText: 'Data & Privacy' }).waitFor({ timeout: 10_000 })
  // Over the page itself, so that the wheel scrolls it rather than the menu.
  await glide(600, 420, 550)
}

/**
 * Puts the pictures of the second app after those of the first, in one folder: the first
 * picture of the second comes a moment after the last of the first.
 */
function joinFilms(first, second) {
  const read = (folder, name) => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'))
  const [timesA, marksA, timesB, marksB] = [read(first, 'times.json'), read(first, 'marks.json'), read(second, 'times.json'), read(second, 'marks.json')]
  const shift = timesA.at(-1) + 0.5 - timesB[0]
  const name = (index) => `f${String(index).padStart(5, '0')}.jpg`
  // Highest first, so that no picture is written over another one not moved yet.
  for (let i = timesB.length - 1; i >= 0; i--) fs.renameSync(path.join(second, name(i)), path.join(second, name(i + timesA.length)))
  for (let i = 0; i < timesA.length; i++) fs.renameSync(path.join(first, name(i)), path.join(second, name(i)))
  fs.writeFileSync(path.join(second, 'times.json'), JSON.stringify([...timesA, ...timesB.map((time) => time + shift)]))
  fs.writeFileSync(path.join(second, 'marks.json'), JSON.stringify([...marksA, ...marksB.map((mark) => ({ ...mark, index: mark.index + timesA.length }))]))
  fs.rmSync(first, { recursive: true, force: true })
  const total = timesA.length + timesB.length
  console.log(`Both together: ${total} pictures over ${(timesB.at(-1) + shift - timesA[0]).toFixed(1)} s, in ${second}`)
}

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }
  for (const folder of [root, files]) {
    fs.rmSync(folder, { recursive: true, force: true })
    fs.mkdirSync(folder, { recursive: true })
  }
  const today = new Date().toLocaleDateString('en-CA')
  const zip = path.join(files, `SillySimple backup ${today}.zip`)
  const firstFrames = path.join(work, 'backup', 'first-computer')
  fs.rmSync(firstFrames, { recursive: true, force: true })

  // === The first computer ======================================================================
  const one = await openApp({ film: 'backup', data: freshData('first'), env })
  try {
    const { page, glide, mark } = one
    // --- Not filmed --------------------------------------------------------------------------
    await answerFileWindows(one.app, zip)
    await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })
    for (const line of LINES) {
      await page.locator('textarea[aria-label="Message"]').fill(line)
      await page.locator('button[aria-label="Send"]').click()
      await written(page)
    }
    await page.mouse.move(560, 690)
    await sleep(3000)

    // --- Filmed ------------------------------------------------------------------------------
    await one.start()
    mark('open', 'Open Data & Privacy')
    await sleep(900)
    await openDataPage(one)
    await sleep(700)
    // Where everything is: the folder, and "Show folder" (not pressed: it opens the computer's own window).
    const show = page.locator('button', { hasText: 'Show folder' })
    const box = await show.boundingBox()
    await glide(box.x + box.width / 2, box.y + box.height / 2, 650)
    await sleep(2200)

    mark('save', 'Save a backup')
    await one.press(page.locator('button', { hasText: 'Save a backup…' }))
    await page.locator('.outcome.done').waitFor({ timeout: 15_000 })
    await glide(560, 640, 600)
    await sleep(2600)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }
  await one.end()
  if (process.exitCode) return
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 1000) {
    console.error('The film stopped early: no backup was written at', zip)
    process.exitCode = 1
    return
  }
  console.log(`The backup was written: ${zip} (${fs.statSync(zip).size} bytes)`)
  fs.renameSync(frames, firstFrames)

  // === The second computer =====================================================================
  const two = await openApp({ film: 'backup', data: freshData('second'), env })
  try {
    const { page, press, glide, mark } = two
    // --- Not filmed --------------------------------------------------------------------------
    await answerFileWindows(two.app, zip)
    await firstLaunch(page, { name: NAME, model: MODEL, story: STORY })
    await page.mouse.move(560, 690)
    await sleep(5000) // The mood of the first message has played.

    // --- Filmed ------------------------------------------------------------------------------
    await two.start()
    mark('look', 'See what it holds')
    await sleep(1200) // A new computer: Suzu's first message, nothing more.
    await openDataPage(two)
    await sleep(600)
    await press(page.locator('button', { hasText: 'Restore a backup…' }))
    await page.locator('dialog .btn-danger', { hasText: 'Restore backup' }).waitFor({ state: 'visible', timeout: 10_000 })
    // The pointer drawn in the page would be under the dialog, which the app shows above everything.
    await page.evaluate(() => {
      const pointer = [...document.body.children].find((element) => element.style.zIndex === '99999')
      if (pointer) document.querySelector('dialog.confirm').appendChild(pointer)
    })
    await sleep(500)
    const message = await page.locator('dialog p').boundingBox()
    await glide(message.x + message.width * 0.4, message.y + message.height * 0.35, 600)
    await sleep(3200)

    mark('restore', 'Restore it')
    await press(page.locator('dialog .btn-danger', { hasText: 'Restore backup' }))
    // The app starts over with what the backup held: the chat of the first computer.
    await page.locator('.message', { hasText: 'declaration of war' }).waitFor({ state: 'visible', timeout: 20_000 })
    // The page was opened anew: the pointer drawn in it is gone, and has nothing more to do.
    await sleep(4300)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }
  await two.end()
  if (!process.exitCode) joinFilms(firstFrames, frames)
})()
