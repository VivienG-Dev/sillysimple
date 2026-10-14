import { app, BrowserWindow, ipcMain } from 'electron'
import updater from 'electron-updater'
import { IPC } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'
import { getSettings } from './settings'

// The app's own updates, with electron-updater.
//
// Where they come from: https://downloads.sillysimple.app, the folder `pnpm release` fills
// (see electron-builder.yml, `publish`). A check reads one small file there, latest-mac.yml
// (latest.yml on Windows, latest-linux.yml on Linux), which says which version is the latest
// and where its files are. Nothing about the user is sent: it is the download of a file,
// and the server sees what any web server sees, the address it is asked from.
//
// When: 15 seconds after launch, every 6 hours, and when the user comes back to the
// window if the last look is more than 30 minutes old (an app left open all day hears of
// a new version within the hour), while Settings › Data & Privacy allows it ("Check for
// new versions", on by default). A check asked in Settings › Help
// happens whatever that says. What is found is only shown: nothing is downloaded until the
// user clicks, and the new version is installed when they restart the app, or when they
// quit it once it is downloaded.
//
// Safety: on a Mac, an update is only installed if it is signed by the same Developer ID as
// the app that runs (macOS checks it). The file of the latest version also carries the
// SHA-512 of each download, checked before anything is installed.

const { autoUpdater } = updater

const FIRST_CHECK = 15_000
const EVERY = 6 * 60 * 60 * 1000
/** Coming back to the window looks again, but not more often than this. */
const ON_RETURN_AFTER = 30 * 60 * 1000

/** When the server was last asked, by any of the ways. */
let lastLook = 0

let status: UpdateStatus = { state: 'unavailable' }

function set(next: UpdateStatus): void {
  status = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.updatesEvent, status)
  }
}

/** Why a check or a download did not work, in words for the user. */
function explain(error: unknown, what: 'check' | 'download'): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION/i.test(text)) {
    return 'Could not reach the update server. Are you online?'
  }
  if (/\b404\b/.test(text) && what === 'check') return 'No version is listed on the update server yet.'
  if (/sha512 checksum mismatch|code signature|not signed|signature/i.test(text)) {
    return 'The download did not pass the checks, so it was not installed. Try again later.'
  }
  const first = text.split('\n')[0]!.slice(0, 160)
  return what === 'check' ? `The check did not work: ${first}` : `The download did not work: ${first}`
}

/** Looks for a newer version. By hand: whatever the setting says, and a failure is shown. */
async function check(byHand: boolean): Promise<UpdateStatus> {
  if (status.state === 'unavailable' || status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return status
  if (!byHand && !(await getSettings()).updates.check) return status
  const before = status
  lastLook = Date.now()
  set({ state: 'checking' })
  try {
    const found = await autoUpdater.checkForUpdates()
    // An answer with no newer version fires "update-not-available", which sets the status.
    if (!found) set(before.state === 'idle' ? before : { state: 'idle', checkedAt: null })
  } catch (error) {
    console.log(`[update] check: ${error instanceof Error ? error.message : String(error)}`)
    // A check made by itself fails quietly: the user did not ask, the next one will tell.
    set(byHand ? { state: 'error', message: explain(error, 'check'), version: null } : before.state === 'idle' ? before : { state: 'idle', checkedAt: null })
  }
  return status
}

async function download(): Promise<void> {
  const version = status.state === 'available' ? status.version : status.state === 'error' ? status.version : null
  if (!version) return
  set({ state: 'downloading', version, percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    console.log(`[update] download: ${error instanceof Error ? error.message : String(error)}`)
    set({ state: 'error', message: explain(error, 'download'), version })
  }
}

/** Starts looking for updates, and answers the UI. Call once the app is ready. */
export function startUpdates(): void {
  ipcMain.handle(IPC.updatesStatus, () => status)
  ipcMain.handle(IPC.updatesCheck, () => check(true))
  ipcMain.on(IPC.updatesDownload, () => void download())
  ipcMain.on(IPC.updatesInstall, () => {
    if (status.state !== 'ready') return
    // Quits (the app's own Ollama stops on the way, see index.ts), installs, opens the new version.
    setImmediate(() => autoUpdater.quitAndInstall())
  })

  // While developing there is nothing to update; on Linux, only an AppImage can replace itself.
  if (!app.isPackaged) return
  if (process.platform === 'linux' && !process.env['APPIMAGE']) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = {
    info: (message?: unknown) => console.log(`[update] ${String(message)}`),
    warn: (message?: unknown) => console.log(`[update] ${String(message)}`),
    error: (message?: unknown) => console.log(`[update] ${String(message)}`),
    debug: () => {},
  }
  autoUpdater.on('update-available', (info) => set({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => set({ state: 'idle', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (progress) => {
    if (status.state === 'downloading') set({ ...status, percent: Math.floor(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }))
  // Errors are handled where the promise fails (check, download). Without a listener, an
  // "error" event would crash the app.
  autoUpdater.on('error', () => {})

  status = { state: 'idle', checkedAt: null }
  setTimeout(() => void check(false), FIRST_CHECK)
  setInterval(() => void check(false), EVERY)
  app.on('browser-window-focus', () => {
    if (lastLook > 0 && Date.now() - lastLook >= ON_RETURN_AFTER) void check(false)
  })
}
