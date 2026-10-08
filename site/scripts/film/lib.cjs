// What the scripts of this folder share: opening the built app in a window of
// the film's size, keeping every picture it draws, and a pointer that moves like a hand.
//
// The app is opened and driven with playwright-core (a development dependency of the site):
// the part of Playwright that drives a program, without any browser of its own.

const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')

const appRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : path.resolve(__dirname, '../../..')
const work = path.resolve(__dirname, '../../.film')
/** A smaller window than the app opens with: the interface is larger in the film. */
const WINDOW = { width: 1120, height: 700 }
/** Where an Ollama the user runs themselves answers. */
const YOUR_OLLAMA = 11434

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const portIsFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer().once('error', () => resolve(false)).once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '127.0.0.1')
  })

function requireBuiltApp() {
  if (fs.existsSync(path.join(appRoot, 'out/main/index.js'))) return
  console.error(`The app is not built: run "pnpm build" in ${appRoot} first.`)
  process.exit(1)
}

/**
 * Puts the stand-in for Ollama that the app's tests use where the app keeps its own
 * engine (<data folder>/engine). The app then believes its engine is installed, and
 * everything it asks of it (downloading a model, writing a reply) is answered at once by
 * the stand-in: nothing is downloaded for real.
 */
function placeStandIn(data) {
  const folder = path.join(data, 'engine', '0.40.0')
  fs.mkdirSync(path.join(folder, 'bin'), { recursive: true })
  const program = path.join(folder, 'bin', 'ollama')
  const fixture = path.join(appRoot, 'src/main/fixtures/fake-ollama.cjs')
  fs.writeFileSync(program, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`)
  fs.chmodSync(program, 0o755)
  fs.writeFileSync(path.join(folder, '.complete'), JSON.stringify({ version: '0.40.0', binary: 'bin/ollama' }))
}

/**
 * The data folder of the scripts that need a real model (site/.film/chat-data), ready for
 * a first launch. It is kept from one time to the next for the engine alone, which the app
 * downloads there once: everything else in it is removed, so that the app opens as on its
 * first day, with `settings` as the few things that differ from a fresh install.
 *
 * With STAND_IN=1 the stand-in for the model takes the place of the engine, and answers
 * what `standIn` says (FAKE_REPLY…): for trying a script, never for the site.
 */
function modelData(settings, standIn = {}) {
  const data = path.join(work, 'chat-data')
  fs.mkdirSync(data, { recursive: true })
  for (const entry of fs.readdirSync(data)) {
    if (entry !== 'engine') fs.rmSync(path.join(data, entry), { recursive: true, force: true })
  }
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ tourDone: true, ...settings }))
  if (process.env.STAND_IN !== '1') return { data, env: {}, isStandIn: false }

  fs.rmSync(path.join(data, 'engine'), { recursive: true, force: true })
  placeStandIn(data)
  const models = path.join(work, 'chat-stand-in-models')
  fs.rmSync(models, { recursive: true, force: true })
  return { data, env: { OLLAMA_MODELS: models, ...standIn }, isStandIn: true }
}

/**
 * Opens the app with `data` as its data folder. Returns what a film needs:
 *
 *   page, app           the window, and the app itself
 *   start({ again })    starts keeping pictures; `again` opens the page anew first, so
 *                       that what the app does as it opens is in the film
 *   mark(name, label)   a part of the film starts here; `label` is its name on the site
 *   press, glide, type  the pointer and the keyboard
 *   end()               stops, writes times.json and marks.json, closes the app
 */
async function openApp({ film, data, env = {} }) {
  const frames = path.join(work, film, 'frames')
  fs.rmSync(frames, { recursive: true, force: true })
  fs.mkdirSync(frames, { recursive: true })

  // The pictures are as sharp as the screen: 2240 pixels wide on a Retina screen, 1120 on
  // an ordinary one. SCALE=1.5 asks the app to draw itself larger than the screen does.
  const scale = process.env.SCALE ? [`--force-device-scale-factor=${process.env.SCALE}`] : []
  const app = await electron.launch({
    executablePath: require(path.join(appRoot, 'node_modules/electron')),
    args: [appRoot, `--user-data-dir=${data}`, ...scale, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    cwd: appRoot,
    env: { ...process.env, ...env },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), WINDOW)
  await sleep(300)

  const cdp = await page.context().newCDPSession(page)
  const times = []
  const marks = []
  let writing = Promise.resolve()
  cdp.on('Page.screencastFrame', (frame) => {
    const file = path.join(frames, `f${String(times.length).padStart(5, '0')}.jpg`)
    times.push(frame.metadata.timestamp)
    writing = writing.then(() => fs.promises.writeFile(file, Buffer.from(frame.data, 'base64')))
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
  })

  /** A pointer drawn in the page: the pictures do not show the system's own. */
  async function drawPointer() {
    await page.evaluate(() => {
      if (window.__showPointer) return
      const pointer = document.createElement('div')
      pointer.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:24px;height:24px;pointer-events:none;opacity:0;transform:translate(560px,680px)'
      pointer.innerHTML =
        '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 2.5 19 12l-6.6 1.3L9 19.5z" fill="#fff" stroke="#15141b" stroke-width="1.5" stroke-linejoin="round"/></svg>'
      document.body.appendChild(pointer)
      window.__showPointer = () => (pointer.style.opacity = 1)
      addEventListener('mousemove', (event) => (pointer.style.transform = `translate(${event.clientX - 5}px,${event.clientY - 2}px)`), true)
    })
  }

  async function start({ again = false } = {}) {
    if (again) await page.reload({ waitUntil: 'commit' })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, everyNthFrame: 1 })
    if (again) await page.waitForLoadState('domcontentloaded')
    await drawPointer()
  }

  let at = { x: 560, y: 680 }
  /** Moves the pointer the way a hand does: quick in the middle, slow at both ends. */
  async function glide(x, y, ms = 480) {
    await page.evaluate(() => window.__showPointer?.())
    const from = { ...at }
    const began = Date.now()
    for (;;) {
      const t = Math.min(1, (Date.now() - began) / ms)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased)
      if (t >= 1) break
      await sleep(8)
    }
    at = { x, y }
  }
  /** Scrolls like a wheel does, until what is aimed at is comfortably in the window. */
  async function reach(locator) {
    const height = await page.evaluate(() => innerHeight)
    let before = null
    for (let turn = 0; turn < 60; turn++) {
      const box = await locator.boundingBox()
      const over = box.y + box.height - (height - 70)
      // Low enough, or the page has no further to go.
      if (over <= 0 || box.y === before) return
      before = box.y
      await page.mouse.wheel(0, Math.min(40, over))
      await sleep(40)
    }
  }
  async function press(locator, { dx = 0.5, dy = 0.5, ms = 480, hold = 160 } = {}) {
    await reach(locator)
    await sleep(120)
    const box = await locator.boundingBox()
    await glide(box.x + box.width * dx, box.y + box.height * dy, ms)
    await sleep(hold)
    await page.mouse.down()
    await sleep(60)
    await page.mouse.up()
  }

  async function end() {
    await cdp.send('Page.stopScreencast').catch(() => {})
    await writing
    // Nothing was filmed (notes.cjs only uses the app): nothing to keep.
    if (times.length) {
      fs.writeFileSync(path.join(frames, 'times.json'), JSON.stringify(times))
      fs.writeFileSync(path.join(frames, 'marks.json'), JSON.stringify(marks))
      console.log(`${times.length} pictures over ${(times.at(-1) - times[0]).toFixed(1)} s, in ${frames}`)
    } else {
      fs.rmSync(frames, { recursive: true, force: true })
    }
    await app.close().catch(() => {})
  }

  return {
    app,
    page,
    start,
    end,
    glide,
    press,
    mark: (name, label) => marks.push({ name, label, index: times.length }),
    type: (text, delay = 95) => page.keyboard.type(text, { delay }),
  }
}

/**
 * Goes through the app's first launch without ceremony, for a script that films what
 * comes after it: the name, the model (downloaded first if it is not there), the story.
 * Ends in the chat of that story. Returns the name of the model as the app writes it.
 */
async function firstLaunch(page, { name, model, story }) {
  await page.waitForSelector('#persona-name', { timeout: 20_000 })
  await page.fill('#persona-name', name)
  await page.locator('button:has-text("Continue")').click()

  const row = page.locator('.row', { hasText: model }).first()
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  const download = row.locator('button:has-text("Download")')
  if (await download.count()) {
    console.log(`"${model}" is not there yet: downloading it (and the engine, the first time). This can take a while.`)
    await download.click()
    const ready = row.locator('input[type="radio"]:not([disabled])').waitFor({ state: 'attached', timeout: 90 * 60_000 })
    const telling = setInterval(async () => {
      const where = await page.locator('.progress-text').first().textContent().catch(() => null)
      if (where) console.log(`  ${where.trim()}`)
    }, 20_000)
    await ready.finally(() => clearInterval(telling))
  }
  const written = (await row.locator('.title').textContent()).replace(/\s+/g, ' ').trim()
  await row.locator('label.pick').click()
  await page.locator('button:has-text("Continue")').click()
  await page.locator('label.character', { hasText: story }).click()
  await page.locator('button:has-text("Start chatting")').click()
  await page.locator('textarea[aria-label="Message"]').waitFor({ state: 'visible', timeout: 30_000 })
  return written
}

/**
 * Waits until the model has finished writing: "Send" is back in the place of "Stop", and
 * stays there. In a chat with several characters, who answer one after the other, "Stop"
 * comes back between two replies: that is why it has to stay.
 */
async function written(page, timeout = 5 * 60_000) {
  const send = page.locator('button[aria-label="Send"]')
  const stop = page.locator('button[aria-label="Stop writing"]')
  await stop.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  const until = Date.now() + timeout
  let since = null
  while (Date.now() < until) {
    if ((await send.isVisible()) && !(await stop.isVisible())) {
      since ??= Date.now()
      if (Date.now() - since >= 1500) return
    } else {
      since = null
    }
    await sleep(150)
  }
  throw new Error('The model did not finish writing in time.')
}

/** A first message that is in no film: it only gets the model into memory. */
const WARM_UP = 'A word before we start.'

/**
 * Sends a message so that the model is in memory, waits for the reply, then deletes both:
 * the chat is back to the character's first message, as it was when it opened.
 */
async function warmUp(page) {
  console.log('A first message, so that the model is in memory…')
  await page.locator('textarea[aria-label="Message"]').fill(WARM_UP)
  await page.locator('button[aria-label="Send"]').click()
  await written(page)
  const first = page.locator('.message', { hasText: WARM_UP }).first()
  await first.hover()
  await first.locator('button[aria-label="Delete message"]').click()
  await page.locator('dialog .btn-danger').click()
  await first.waitFor({ state: 'detached', timeout: 10_000 })
  await page.mouse.move(560, 690)
  await sleep(1500)
}

module.exports = { appRoot, work, sleep, portIsFree, requireBuiltApp, placeStandIn, modelData, openApp, firstLaunch, written, warmUp, YOUR_OLLAMA }
