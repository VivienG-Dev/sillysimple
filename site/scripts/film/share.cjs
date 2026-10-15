// Films the real app signing a character and exporting its card: the film of the guide
// "Share your character".
//
//   1. In the app (the folder above site/):   pnpm build
//   2. Here:                                  node scripts/film/share.cjs
//                                             node scripts/film/assemble.cjs share     (needs ffmpeg)
//
// What it does, before it films anything: it opens the built app with a data folder of
// its own (site/.film/share-data; yours is not touched), goes through the first launch,
// and writes a character in "New character" with a picture, so that her card is a .png
// with the character inside. The picture is drawn by the script itself (a lighthouse at
// dusk), on a canvas of the app's page. Then it films: "Edit" is opened, the author's
// name is typed in "Author" and saved ("by …" appears under her name), the export button
// next to the heart is pressed, and the pointer rests on her picture.
//
// No model writes anything here: the stand-in for Ollama that the app's tests use is put
// in the place of the app's engine, so nothing is downloaded. The window where the file
// is saved is the computer's own, and is not in the film: the script answers in its place,
// with a file in site/.film/share-data/export/, and checks that the card was written there.
//
//   AUTHOR="Lyra" node scripts/film/share.cjs     the name the card is signed with
//
// It was written and run on Linux, without a screen. On a Mac it opens the app's window
// for real: leave the mouse alone while it films.

const path = require('node:path')
const fs = require('node:fs')
const { work, sleep, portIsFree, requireBuiltApp, placeStandIn, openApp, firstLaunch, YOUR_OLLAMA } = require('./lib.cjs')

const NAME = process.env.NAME_TYPED || 'Robin'
const AUTHOR = process.env.AUTHOR || NAME
const MODEL = 'Gemma 4 · Small'
/** The character that is shared: written by hand, not one of the stories that come with the app. */
const CARD = {
  name: 'Juniper Vale',
  tagline: 'Lighthouse keeper who talks to the sea',
  description:
    'Juniper Vale, 58, has kept the Saltmere lighthouse alone for eleven winters. She is gruff, dry, and kinder than she lets on. She speaks to the sea as to an old neighbour who never returns what he borrows, and she distrusts anyone who arrives by the land road. Her hands are always busy: winding the clock, mending a net, polishing a lens that is already clean.',
  firstMessage:
    '*The lamp room smells of oil and cold tea. Juniper does not turn from the glass when the stairs creak.* "The sea said someone was coming. He is usually wrong about the day." *She points at the kettle with her chin.* "Sit. {{user}}, is it? You can explain yourself while that boils."',
}

/** This film's own data folder, as on a first day: nothing of another script's is touched. */
function freshData() {
  const data = path.join(work, 'share-data')
  fs.rmSync(data, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true }))
  placeStandIn(data)
  const models = path.join(work, 'share-stand-in-models')
  fs.rmSync(models, { recursive: true, force: true })
  return { data, env: { OLLAMA_MODELS: models } }
}

/** Her picture: a lighthouse at dusk, drawn on a canvas of the page. Returns PNG bytes. */
async function drawPicture(page) {
  const url = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 900
    const c = canvas.getContext('2d')
    const sky = c.createLinearGradient(0, 0, 0, 620)
    sky.addColorStop(0, '#2b2f5c')
    sky.addColorStop(0.55, '#a85d6e')
    sky.addColorStop(1, '#f2b27a')
    c.fillStyle = sky
    c.fillRect(0, 0, 640, 900)
    // The beam of the lamp.
    c.fillStyle = 'rgba(255, 240, 200, 0.28)'
    c.beginPath()
    c.moveTo(330, 250)
    c.lineTo(640, 150)
    c.lineTo(640, 330)
    c.closePath()
    c.fill()
    // The sea.
    const sea = c.createLinearGradient(0, 600, 0, 900)
    sea.addColorStop(0, '#3a4a78')
    sea.addColorStop(1, '#141a33')
    c.fillStyle = sea
    c.fillRect(0, 600, 640, 300)
    c.strokeStyle = 'rgba(255, 210, 170, 0.35)'
    c.lineWidth = 3
    for (let y = 630; y < 900; y += 34) {
      c.beginPath()
      for (let x = 0; x <= 640; x += 20) c.lineTo(x, y + Math.sin(x / 40 + y) * 5)
      c.stroke()
    }
    // The rock, and the tower on it.
    c.fillStyle = '#1d1a24'
    c.beginPath()
    c.moveTo(150, 640)
    c.quadraticCurveTo(300, 560, 470, 640)
    c.closePath()
    c.fill()
    c.fillStyle = '#efe6dc'
    c.beginPath()
    c.moveTo(270, 600)
    c.lineTo(290, 290)
    c.lineTo(370, 290)
    c.lineTo(390, 600)
    c.closePath()
    c.fill()
    c.fillStyle = '#b8434e'
    for (const [top, bottom] of [
      [360, 410],
      [470, 520],
    ]) {
      const left = (y) => 290 - ((y - 290) / 310) * 20
      const right = (y) => 370 + ((y - 290) / 310) * 20
      c.beginPath()
      c.moveTo(left(top), top)
      c.lineTo(right(top), top)
      c.lineTo(right(bottom), bottom)
      c.lineTo(left(bottom), bottom)
      c.closePath()
      c.fill()
    }
    c.fillStyle = '#1d1a24'
    c.fillRect(278, 280, 104, 14)
    c.fillStyle = '#ffe9a8'
    c.fillRect(300, 228, 60, 52)
    c.fillStyle = '#1d1a24'
    c.beginPath()
    c.moveTo(292, 230)
    c.lineTo(330, 196)
    c.lineTo(368, 230)
    c.closePath()
    c.fill()
    return canvas.toDataURL('image/png')
  })
  return Buffer.from(url.split(',')[1], 'base64')
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

/** The card a PNG carries: its "chara" text chunk, as SillyTavern writes it (base64 JSON). */
function cardInside(bytes) {
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'tEXt') {
      const zero = body.indexOf(0)
      if (body.toString('latin1', 0, zero) === 'chara') return JSON.parse(Buffer.from(body.toString('latin1', zero + 1), 'base64').toString('utf8'))
    }
    at += 12 + length
  }
  return null
}

;(async () => {
  requireBuiltApp()
  if (!(await portIsFree(YOUR_OLLAMA))) {
    console.error('Ollama is open on this computer: quit it first, or the app will use it instead of its own and the film will show that.')
    process.exit(1)
  }

  const { data, env } = freshData()
  const exported = path.join(data, 'export', `${CARD.name}.png`)
  const film = await openApp({ film: 'share', data, env })
  const { app, page, press, glide, mark } = film

  try {
    // --- Not filmed --------------------------------------------------------------------------
    await firstLaunch(page, { name: NAME, model: MODEL, story: 'Suzu Amano' })
    const picture = path.join(data, 'juniper.png')
    fs.writeFileSync(picture, await drawPicture(page))

    await page.getByText('Library', { exact: true }).click()
    await page.locator('button:has-text("New character")').first().click()
    const choosing = page.waitForEvent('filechooser', { timeout: 10_000 })
    await page.locator('button[aria-label="Choose a picture"]').click()
    await (await choosing).setFiles(picture)
    await page.fill('[aria-label="Character name"]', CARD.name)
    await page.fill('[aria-label="Tagline"]', CARD.tagline)
    await page.fill('[data-section="DESCRIPTION"]', CARD.description)
    await page.getByRole('tab', { name: 'Greetings' }).click()
    await page.fill('[data-section="FIRST MESSAGE"]', CARD.firstMessage)
    await page.locator('button:has-text("Create character")').click()
    await page.locator('textarea[aria-label="Message"]').waitFor({ state: 'visible', timeout: 15_000 })

    // The computer's own window, where the file is saved, answers by itself: here.
    fs.mkdirSync(path.dirname(exported), { recursive: true })
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, exported)
    await page.mouse.move(560, 690)
    await sleep(6000) // The mood of the first message has played.

    // --- Filmed ------------------------------------------------------------------------------
    await film.start()
    mark('sign', 'Sign it with your name')
    await sleep(900)
    await press(page.locator('aside.panel .identity button:has-text("Edit")'))
    const author = page.locator('input[placeholder="Your name or pseudonym"]')
    await author.waitFor({ state: 'visible', timeout: 10_000 })
    await sleep(500)
    // Over the fields, so that the wheel scrolls them down to "Author", under "Tags".
    await scrollInto(page, glide, author, page.locator('dialog.editor .fields'))
    await press(author, { dx: 0.2 })
    await sleep(200)
    await film.type(AUTHOR, 110)
    await sleep(700)
    await press(page.locator('dialog button:has-text("Save")'))
    await page.locator('dialog.editor').waitFor({ state: 'hidden', timeout: 10_000 })
    const credit = page.locator('.identity .credit')
    await credit.waitFor({ state: 'visible', timeout: 10_000 })
    const box = await credit.boundingBox()
    await glide(box.x + box.width + 40, box.y + box.height * 0.6, 600)
    await sleep(2200) // "by …" under her name.

    mark('export', 'Export the card')
    await press(page.locator(`button[aria-label="Export ${CARD.name}'s card"]`), { hold: 400 })
    // The file the computer's window would have saved: it has to be there, and be her card.
    const until = Date.now() + 10_000
    while (!fs.existsSync(exported) && Date.now() < until) await sleep(100)
    if (!fs.existsSync(exported)) throw new Error('The card was not exported.')
    const bytes = fs.readFileSync(exported)
    if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error('The exported file is not a PNG.')
    const card = cardInside(bytes)
    if (!card) throw new Error('The exported picture holds no card.')
    if ((card.data ?? card).creator !== AUTHOR) throw new Error(`The exported card is signed "${(card.data ?? card).creator}".`)
    console.log(`Exported: ${exported} (${bytes.length} bytes), signed by ${AUTHOR}.`)
    await sleep(2200)

    mark('share', 'Share it anywhere')
    const portrait = page.locator('.portrait img')
    const picBox = await portrait.boundingBox()
    await glide(picBox.x + picBox.width * 0.55, picBox.y + picBox.height * 0.45, 900)
    await sleep(5000)
  } catch (error) {
    console.error('The film stopped early:', error.message.split('\n')[0])
    process.exitCode = 1
  }

  await film.end()
})()
