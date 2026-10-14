// The Mac icon for macOS 26 and later, put into the app before it is signed (electron-builder
// calls this after packing each app: `afterPack` in electron-builder.yml).
//
// Why: since macOS 26, an icon made the old way (an .icns, here made from build/icon.png)
// is shown small, inside a grey rounded square. The new way is an Icon Composer document,
// build/AppIcon.icon (icon.json, and the bubble in Assets/bubble.svg drawn from
// src/renderer/assets/brand/shapes.ts), compiled by Apple's `actool` into Assets.car, which
// the app names in its Info.plist (CFBundleIconName). macOS 26 then draws the icon full size,
// with its own light and glass. Older macOS keep the .icns, which actool writes as well.
//
// actool comes with Xcode 26 or later. Without it, the app keeps the old icon and a line says
// so: the build does not fail over an icon.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ICON = resolve('build', 'AppIcon.icon')
/** The oldest macOS Electron runs on: actool writes what that one needs too. */
const OLDEST_MACOS = '12.0'

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return { ok: result.status === 0, text: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

export default async function macIcon(context) {
  if (context.electronPlatformName !== 'darwin' || !existsSync(ICON)) return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const resources = join(app, 'Contents', 'Resources')
  const plist = join(app, 'Contents', 'Info.plist')
  const scratch = mkdtempSync(join(tmpdir(), 'sillysimple-icon-'))
  const partial = join(scratch, 'icon.plist')
  try {
    const compiled = run('xcrun', [
      'actool', ICON,
      '--compile', resources,
      '--app-icon', 'AppIcon',
      '--output-partial-info-plist', partial,
      '--minimum-deployment-target', OLDEST_MACOS,
      '--platform', 'macosx',
      '--target-device', 'mac',
      '--errors', '--warnings',
      '--output-format', 'human-readable-text',
    ])
    if (!compiled.ok || !existsSync(join(resources, 'Assets.car'))) {
      console.log(`  • the macOS 26 icon was not made (Xcode 26 or later is needed for actool), the app keeps its old icon\n${compiled.text}`)
      return
    }
    // The names actool chose (CFBundleIconName "AppIcon", CFBundleIconFile "AppIcon"), into the app's Info.plist.
    for (const key of ['CFBundleIconName', 'CFBundleIconFile']) {
      const value = run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, partial])
      if (!value.ok) continue
      run('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, plist])
      const added = run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value.text}`, plist])
      if (!added.ok) throw new Error(`Could not write ${key} into ${plist}: ${added.text}`)
    }
    console.log(`  • macOS 26 icon compiled into ${app.split('/').slice(-2).join('/')} (Assets.car)`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
