#!/usr/bin/env node
// The installers, in one command.
//
//   pnpm dist           the installer for this computer's system
//   pnpm dist:all       macOS (Apple chip and Intel), Windows and Linux: from a Mac,
//                       the only system that can make all three
//   pnpm dist --quick   the same without the checks (types and tests) that come first
//   pnpm dist --check   on a Mac: says how the app would be signed, and makes nothing
//
// What it does: builds the app (out/), checks it, then asks electron-builder for each
// system in turn (electron-builder.yml says what to make), so that one that fails does
// not take the others with it. At the end it lists what is in dist/, with a file of
// checksums and a note to send along with the installers, which says what each system
// will ask before opening the app.
//
// On a Mac the app is signed the best way this Mac allows (see mac-signing.mjs): with the
// Developer ID certificate of the keychain and notarized by Apple, or signed only, or by
// nobody. The Windows installer is not signed: Windows warns once.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { explainPlan, inspectApp, signingPlan } from './mac-signing.mjs'

const args = new Set(process.argv.slice(2))
const unknown = [...args].filter((arg) => !['--all', '--quick', '--check'].includes(arg))
if (unknown.length > 0) {
  console.error(`Not understood: ${unknown.join(' ')}\nUsage: pnpm dist [--quick | --check]   or   pnpm dist:all [--quick]`)
  process.exit(2)
}

// DIST_AS is for trying this script where it was written, without a Mac: it never makes sense otherwise.
const here = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.env.DIST_AS || process.platform]
if (!here) {
  console.error(`No installer is made on this system (${process.platform}).`)
  process.exit(2)
}
const NAMES = { mac: 'macOS', win: 'Windows', linux: 'Linux' }
// A .dmg can only be made on a Mac; the Windows and Linux installers can be made anywhere.
const wanted = args.has('--all') ? ['mac', 'win', 'linux'].filter((system) => system !== 'mac' || here === 'mac') : [here]
if (args.has('--all') && here !== 'mac') console.log('Not on a Mac: the macOS installers are left out (a .dmg can only be made on a Mac).\n')

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const started = Date.now()

/** Runs a command of the project, its output shown as it comes. False when it failed. */
function run(what, command, commandArgs, env = {}) {
  console.log(`\n\x1b[1m▸ ${what}\x1b[0m`)
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } })
  return result.status === 0
}
function stop(message) {
  console.error(`\n\x1b[31m✗ ${message}\x1b[0m`)
  process.exit(1)
}

/** Runs a command and gives back what it said, for the questions asked of macOS. */
function exec(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout: 60_000 })
  return { status: result.status ?? 1, text: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

console.log(`SillySimple ${version}: ${wanted.map((system) => NAMES[system]).join(', ')}`)

// How the Mac app will be signed is found out first: better to know before five minutes of building.
const plan = wanted.includes('mac') ? signingPlan(exec) : null
if (plan) console.log(`\n\x1b[1mThe Mac app\x1b[0m\n${explainPlan(plan).map((line) => `  ${line}`).join('\n')}`)
if (args.has('--check')) {
  if (!plan) console.log('\nNothing to check on this system: only the Mac app is signed.')
  process.exit(0)
}

if (!run('Building the app', 'pnpm', ['exec', 'electron-vite', 'build'])) stop('The app did not build.')
if (!args.has('--quick')) {
  if (!run('Checking the types', 'pnpm', ['typecheck'])) stop('The types do not check: nothing was packaged. (pnpm dist --quick skips this.)')
  if (!run('Running the tests', 'pnpm', ['test'])) stop('A test fails: nothing was packaged. (pnpm dist --quick skips this.)')
}

// What an earlier run left would be listed as if it had just been made.
rmSync('dist', { recursive: true, force: true })

const made = () => (existsSync('dist') ? readdirSync('dist') : [])
const failed = []
for (const system of wanted) {
  const before = new Set(made())
  // Without a certificate, the Mac app is signed by nobody: the same settings, and three more.
  const config = system === 'mac' && plan?.way === 'adhoc' ? ['--config', 'electron-builder.adhoc.yml'] : []
  if (run(`Packaging for ${NAMES[system]}`, 'pnpm', ['exec', 'electron-builder', `--${system}`, ...config], system === 'mac' ? plan?.env : {})) continue
  failed.push(system)
  // What it left half made is not an installer.
  for (const name of made()) if (!before.has(name)) rmSync(join('dist', name), { recursive: true, force: true })
}

// --- What came out ---------------------------------------------------------------------

const INSTALLER = /\.(dmg|exe|AppImage)$/
const files = existsSync('dist') ? readdirSync('dist').filter((name) => INSTALLER.test(name) && !name.includes('__uninstaller')) : []
// Files the packager leaves for an app that updates itself, which this one does not do yet.
if (existsSync('dist')) {
  for (const name of readdirSync('dist')) {
    if (/\.blockmap$|^builder-(debug|effective-config)\.ya?ml$|^latest.*\.yml$|\.nsis\.7z$|__uninstaller/.test(name) || name === '.icon-ico' || name === '.icon-icns') {
      rmSync(join('dist', name), { recursive: true, force: true })
    }
  }
}

const WHO = [
  [/-mac-arm64\.dmg$/, 'Mac with an Apple chip (M1 or later)'],
  [/-mac-x64\.dmg$/, 'Mac with an Intel chip'],
  [/-win-x64\.exe$/, 'Windows 10 or 11'],
  [/\.AppImage$/, 'Linux'],
]
const size = (bytes) => `${Math.round(bytes / 1e6)} MB`
const sums = []
console.log(`\n\x1b[1mIn dist/\x1b[0m`)
for (const name of files.sort()) {
  const path = join('dist', name)
  sums.push(`${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${name}`)
  console.log(`  ${name.padEnd(44)} ${size(statSync(path).size).padStart(7)}   ${WHO.find(([pattern]) => pattern.test(name))?.[1] ?? ''}`)
}
if (files.length === 0) console.log('  (nothing)')
else writeFileSync(join('dist', 'SHA256SUMS.txt'), `${sums.join('\n')}\n`)

// The Mac apps as macOS sees them, which is what counts: a plan is only a plan.
let macOpens = files.some((name) => name.endsWith('.dmg'))
if (here === 'mac' && wanted.includes('mac')) {
  for (const folder of ['mac-arm64', 'mac']) {
    const app = join('dist', folder, 'SillySimple.app')
    if (!existsSync(app)) continue
    const seen = inspectApp(exec, app)
    if (!seen.opens) macOpens = false
    console.log(`  ${folder}/SillySimple.app: ${seen.text}`)
  }
}

if (files.length > 0) {
  writeFileSync(
    join('dist', 'HOW-TO-OPEN.txt'),
    `SillySimple ${version} (beta)

Which file is for you

${files
  .sort()
  .map((name) => `  ${(WHO.find(([pattern]) => pattern.test(name))?.[1] ?? '').padEnd(38)} ${name}`)
  .join('\n')}${files.some((name) => name.endsWith('.dmg')) ? '\n\n  On a Mac: Apple menu > About This Mac says which chip it has.' : ''}

${[
  files.some((name) => name.endsWith('.dmg')) &&
    (macOpens
      ? `On a Mac

  1. Open the .dmg and drag SillySimple onto Applications.
  2. Open SillySimple from Applications. macOS asks once whether to open an app
     downloaded from the internet: click Open.`
      : `On a Mac

  This beta is not checked by Apple yet, so macOS asks you to confirm the first time.

  1. Open the .dmg and drag SillySimple onto Applications.
  2. Open SillySimple from Applications. macOS says it could not verify it: click Done.
  3. Open System Settings > Privacy & Security, scroll down to "SillySimple was blocked",
     click Open Anyway, and confirm.
  On macOS 14 or older: right-click SillySimple in Applications, choose Open, then Open.`),
  files.some((name) => name.endsWith('.exe')) &&
    `On Windows

  The installer is not signed yet, so Windows asks you to confirm the first time.

  1. Open the .exe. Windows says "Windows protected your PC".
  2. Click "More info", then "Run anyway". It installs for you alone and starts.`,
  files.some((name) => name.endsWith('.AppImage')) &&
    `On Linux

  1. Make the file executable: chmod +x SillySimple-${version}-linux-x86_64.AppImage
  2. Run it. If it says FUSE is missing, run it with --appimage-extract-and-run.`,
]
  .filter(Boolean)
  .join('\n\n')}

To check a download: SHA256SUMS.txt holds the fingerprint of each file.
`,
  )
  console.log('  HOW-TO-OPEN.txt and SHA256SUMS.txt: to send along with the installers.')
}

console.log(`\n${Math.round((Date.now() - started) / 1000)} s.`)
if (failed.length > 0) stop(`Not made: ${failed.map((system) => NAMES[system]).join(', ')}. What went wrong is above, under "Packaging for …".`)
console.log(
  `\x1b[32m✓ Done.\x1b[0m${files.some((name) => name.endsWith('.dmg')) ? ' Before sending a Mac installer to anyone: send it to yourself first (AirDrop, or a download), and open that copy. Only a downloaded copy is checked by macOS.' : ''}`,
)
