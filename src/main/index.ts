import { totalmem } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, net, protocol, safeStorage, shell } from 'electron'
import { IPC, PORTRAIT_SCHEME } from '@shared/ipc'
import { initCharacters, portraitFile } from './characters'
import { openSwappableDatabase } from './chatDatabase'
import { senseModel, senseSupported } from '@core/engine/models'
import { createEngine } from './engine'
import { modelBusy, registerIpcHandlers } from './ipc'
import { createKeyStore } from './keyStore'
import { initScenarios, scenarioFile } from './scenarios'
import { authorPicture } from './authors'
import { fetchWebMedia, webAddressOf } from './webMedia'
import { createSense } from './sense'
import { getSettings } from './settings'
import { startUpdates } from './updates'
import { findGraphicsCard } from './graphics'
import { BACKGROUND as BACKGROUND_FILE } from './userData'
// The app's icon, for where the installed app's own icon does not show: the Dock while
// developing (macOS), the window and the taskbar (Windows, Linux).
import dockIcon from '../../resources/icon.png?asset'
import windowIcon from '../../resources/icon-full.png?asset'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

// Must match --bg-app in the renderer, so the window never flashes white.
const BACKGROUND = '#221915'
// The title bar's colours (--bg-sidebar, --text-dim), until the renderer sends its own.
const BAR = '#1b1410'
const BAR_SYMBOLS = '#a99489'
// The app draws one thin title bar above every screen (AppTitleBar), as Discord or VS Code.
// Must match --window-bar-height in the renderer (base.css): 32 px on Windows, 36 on macOS.
const WINDOWS_BAR_HEIGHT = 32

app.setName('SillySimple')

// One SillySimple at a time: two would write the same files, and each would run an Ollama.
// Opening it again brings the window of the one that runs to the front.
const isFirst = app.requestSingleInstanceLock()
if (!isFirst) {
  console.log('SillySimple is already running: its window comes to the front instead.')
  app.quit()
}
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

// card://portrait/<character id> shows the picture of a PNG card, and
// card://background/<version> the user's own chat background. The scheme has
// to be declared before the app is ready; the handler is added once it is.
// `stream`: sounds and videos are served in parts, so that they can be played and sought in.
protocol.registerSchemesAsPrivileged([{ scheme: PORTRAIT_SCHEME, privileges: { standard: true, secure: true, stream: true } }])

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: BACKGROUND,
    ...(!isMac && { icon: windowIcon }),
    // The app draws its own title bar. macOS keeps the traffic lights on its left,
    // centred in its 36 px; Windows draws its three buttons on its right.
    ...(isMac && {
      titleBarStyle: 'hidden' as const,
      trafficLightPosition: { x: 14, y: 12 },
    }),
    ...(isWindows && {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: { color: BAR, symbolColor: BAR_SYMBOLS, height: WINDOWS_BAR_HEIGHT },
    }),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // The window only ever shows the app. Links open in the user's browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isSamePage(url, window.webContents.getURL())) event.preventDefault()
  })

  // In development electron-vite serves the UI with hot reload; in production it is a file.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

/** True when both URLs are the app's own page (routes only change the #hash). */
function isSamePage(target: string, current: string): boolean {
  try {
    const a = new URL(target)
    const b = new URL(current)
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname
  } catch {
    return false
  }
}

void app.whenReady().then(async () => {
  if (!isFirst) return
  // Once installed, macOS takes the Dock icon from the app itself. Before that, it would be Electron's.
  if (isMac && !app.isPackaged) app.dock?.setIcon(dockIcon)
  // Everything the user owns lives in the app's data folder (see README).
  const dataFolder = app.getPath('userData')
  await initCharacters(join(dataFolder, 'characters'))
  // The scenarios come with the app: beside it once packaged, at the root of the project before.
  initScenarios(app.isPackaged ? join(process.resourcesPath, 'scenarios') : join(app.getAppPath(), 'scenarios'))
  const db = openSwappableDatabase(join(dataFolder, 'chats.db'))
  app.on('will-quit', () => db.close())

  protocol.handle(PORTRAIT_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host === 'web') {
      // A picture or a sound a message brings from the web (see webMedia.ts).
      const address = webAddressOf(url.pathname)
      if (!address || !(await getSettings()).appearance.webMedia) return new Response(null, { status: 404 })
      return fetchWebMedia(address, request.headers.get('range'))
    }
    // The version in the address only serves to show a new picture at once: there is one file.
    const id = decodeURIComponent(url.pathname.slice(1))
    const file =
      url.host === 'background'
        ? join(dataFolder, BACKGROUND_FILE)
        : url.host === 'scenario'
          ? await scenarioFile(id)
          : url.host === 'author'
            ? await authorPicture(id)
            : url.host === 'author-banner'
              ? await authorPicture(id, 'banner')
              : await portraitFile(id)
    if (!file) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(file).toString()).catch(() => new Response(null, { status: 404 }))
  })

  // "On this computer": the user's Ollama when one runs, the app's own otherwise (see engine.ts).
  const engine = createEngine({
    folder: join(dataFolder, 'engine'),
    platform: process.platform,
    arch: process.arch,
    memoryBytes: totalmem(),
    // On a PC the graphics card decides which model runs quickly; a Mac's memory is shared (see graphics.ts).
    ...(!isMac && { graphics: findGraphicsCard(process.platform) }),
    busy: modelBusy,
    // A size set by hand in Settings › Generation: the app's own Ollama loads models with it.
    chosenContext: async () => {
      const { generation } = await getSettings()
      return generation.autoContext ? null : generation.contextSize
    },
    onChange: (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(IPC.engineEvent, status)
      }
    },
    log: (line) => console.log(line),
  })
  // The app's own Ollama never outlives the app.
  app.on('will-quit', () => engine.stopNow())
  process.on('exit', () => engine.stopNow())

  // What a text means, for the mood of a reply: the app's own small model, where it can run (see sense.ts).
  const sense = createSense({
    engine,
    // The compressed file on a Mac with an Apple chip, the plain one elsewhere (see senseModel).
    model: senseModel(process.platform, process.arch),
    // SILLYSIMPLE_SENSE=1: for trying it on a system the app is not made for.
    supported: senseSupported(process.platform, process.arch) || process.env['SILLYSIMPLE_SENSE'] === '1',
    wanted: async () => {
      const { appearance, connection, generation } = await getSettings()
      return { on: appearance.moods && appearance.moodsByMeaning, local: connection.kind === 'ollama', lore: generation.loreByMeaning, recall: generation.recallByMeaning }
    },
    log: (line) => console.log(line),
  })

  registerIpcHandlers(db, createKeyStore(join(dataFolder, 'keys.json'), safeStorage), dataFolder, engine, sense)
  // New versions of the app itself (see updates.ts).
  startUpdates()
  createWindow()

  // macOS: clicking the dock icon reopens a window if none is left.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
