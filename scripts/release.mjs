#!/usr/bin/env node
// Puts the installers of dist/ online, and the site's download buttons on them.
//
//   pnpm release          the Mac and Windows installers in dist/ (pnpm dist wipes dist/
//                         first, so they are all from the last build); it lists them and asks first
//   pnpm release mac      only some systems: mac, windows, linux
//   pnpm release linux    Linux only goes online when named: it is not tested yet, and
//                         pnpm dist:all makes it anyway (16 October: it went online by mistake)
//   pnpm release --yes    without the question
//
// What it does, on this Mac:
//   1. checks the files: the version's own names, and a Mac app that macOS lets open
//   2. copies them over SSH to the downloads folder of the server, each under a temporary
//      name renamed once whole, so that nobody ever downloads half a file. With them go the
//      files the installed apps update themselves from (src/main/updates.ts): the Mac's .zip,
//      the .blockmap files, and last of all latest-mac.yml (latest.yml, latest-linux.yml),
//      the file that tells the apps a new version is out. Last, so that no app hears of a
//      version whose files are not all there yet
//   3. checks that each one answers at its address, at its full size
//   4. writes the installers' addresses in site/app/app.config.ts
// Then it is yours to commit and push: Coolify rebuilds the site with the new buttons.
//
// Nothing secret here. The server is a name of ~/.ssh/config ("ovh-vps3" unless
// SILLYSIMPLE_SSH says another), so the SSH key and the address stay on this Mac. Only the
// files it names are sent, and nothing on the server is ever deleted.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { inspectApp } from './mac-signing.mjs'

const HOST = process.env.SILLYSIMPLE_SSH || 'ovh-vps3'
const FOLDER = process.env.SILLYSIMPLE_DOWNLOADS_DIR || '/data/sillysimple-downloads'
const BASE = (process.env.SILLYSIMPLE_DOWNLOADS_URL || 'https://downloads.sillysimple.app').replace(/\/$/, '')
const SITE_CONFIG = join('site', 'app', 'app.config.ts')

const version = JSON.parse(readFileSync('package.json', 'utf8')).version

/** Each installer: the system it is for, its file name, and its line in the site's config. */
const INSTALLERS = [
  { system: 'mac', key: 'mac', file: `SillySimple-${version}-mac-arm64.dmg`, who: 'Mac, Apple chip', app: 'mac-arm64' },
  { system: 'mac', key: 'macIntel', file: `SillySimple-${version}-mac-x64.dmg`, who: 'Mac, Intel chip', app: 'mac' },
  { system: 'windows', key: 'windows', file: `SillySimple-${version}-win-x64.exe`, who: 'Windows' },
  { system: 'linux', key: 'linux', file: `SillySimple-${version}-linux-x86_64.AppImage`, who: 'Linux' },
]
const SYSTEMS = ['mac', 'windows', 'linux']
/** What goes online when no system is named. Linux is added to it once it has been tried. */
const BY_DEFAULT = ['mac', 'windows']
/** The file that tells the installed apps of a system which version is the latest. */
const LATEST = { mac: 'latest-mac.yml', windows: 'latest.yml', linux: 'latest-linux.yml' }

const args = process.argv.slice(2)
const yes = args.includes('--yes')
const asked = args.filter((arg) => arg !== '--yes')
const unknown = asked.filter((arg) => !SYSTEMS.includes(arg))
if (unknown.length > 0) {
  console.error(`Not understood: ${unknown.join(' ')}\nUsage: pnpm release [mac] [windows] [linux] [--yes]`)
  process.exit(2)
}

function stop(message) {
  console.error(`\n\x1b[31m✗ ${message}\x1b[0m`)
  process.exit(1)
}
/** One SSH connection for the whole run: a password, if the server asks one, is asked once. */
const SHARED = ['-o', 'ControlMaster=auto', '-o', `ControlPath=/tmp/sillysimple-release-%C`, '-o', 'ControlPersist=120']
function run(command, commandArgs) {
  return spawnSync(command, commandArgs, { stdio: 'inherit' }).status === 0
}
function exec(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout: 60_000 })
  return { status: result.status ?? 1, text: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}
const quote = (text) => `'${text.replaceAll("'", `'\\''`)}'`
const size = (bytes) => `${Math.round(bytes / 1e6)} MB`

// --- 1. What goes online ---------------------------------------------------------------

const present = INSTALLERS.filter((one) => existsSync(join('dist', one.file)))
const chosen = present.filter((one) => (asked.length > 0 ? asked : BY_DEFAULT).includes(one.system))
const leftOut = asked.length > 0 ? [] : present.filter((one) => !BY_DEFAULT.includes(one.system))
if (leftOut.length > 0) console.log(`Left out unless named: ${leftOut.map((one) => one.file).join(', ')} (pnpm release ${[...new Set(leftOut.map((one) => one.system))].join(' ')})`)
for (const system of asked) {
  if (!present.some((one) => one.system === system)) stop(`No ${system} installer of version ${version} in dist/. Make it first: pnpm dist (or pnpm dist:all).`)
}
if (chosen.length === 0) stop(`No installer of version ${version} in dist/. Make them first: pnpm dist (or pnpm dist:all).`)

// A Mac installer goes online only if macOS lets a downloaded copy open without a fight.
if (chosen.some((one) => one.system === 'mac')) {
  if (process.platform !== 'darwin') stop('A Mac installer is checked by macOS before it goes online: run this on the Mac.')
  for (const one of chosen.filter((each) => each.app)) {
    const app = join('dist', one.app, 'SillySimple.app')
    if (!existsSync(app)) stop(`${one.file}: its app (dist/${one.app}/SillySimple.app) is not there to check. Make it again: pnpm dist.`)
    const seen = inspectApp(exec, app)
    if (!seen.opens) stop(`${one.file}: ${seen.text}. Not put online. pnpm dist --check says what is missing.`)
  }
}

// The files each system's apps update themselves from. Every file the latest*.yml names must
// be there, and be of this version: an app told of a file that is missing would fail its update.
const updates = []
for (const system of [...new Set(chosen.map((one) => one.system))]) {
  const latest = LATEST[system]
  if (!existsSync(join('dist', latest))) {
    console.log(`  (no ${latest} in dist/: the ${system} apps already installed will not hear of this version)`)
    continue
  }
  const text = readFileSync(join('dist', latest), 'utf8')
  const said = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1]
  if (said !== version) stop(`dist/${latest} is for version ${said ?? '?'}, not ${version}. Make the installers again: pnpm dist.`)
  const named = [...new Set([...text.matchAll(/^\s*(?:-\s*)?(?:url|path):\s*['"]?([^'"\s]+)/gm)].map((match) => match[1]))]
  for (const file of named) {
    if (!existsSync(join('dist', file))) stop(`dist/${latest} names ${file}, which is not in dist/. Make the installers again: pnpm dist.`)
  }
  // The installers already go; the .zip and the .blockmap files go with them.
  const extra = [...named, ...named.map((file) => `${file}.blockmap`)].filter((file) => existsSync(join('dist', file)) && !chosen.some((one) => one.file === file))
  updates.push({ system, latest, extra: [...new Set(extra)] })
}

console.log(`SillySimple ${version}, to ${HOST}:${FOLDER}\n`)
for (const one of chosen) console.log(`  ${one.file.padEnd(44)} ${size(statSync(join('dist', one.file)).size).padStart(7)}   ${one.who}`)
for (const one of updates) console.log(`  ${`${one.latest} and ${one.extra.length} more`.padEnd(44)} ${''.padStart(7)}   for the apps already installed`)
const left = present.filter((one) => !chosen.includes(one))
if (left.length > 0) console.log(`\n  Left out: ${left.map((one) => one.who).join(', ')}`)

if (!yes) {
  const answer = await createInterface({ input: process.stdin, output: process.stdout }).question('\nPut these online? (y/N) ')
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Nothing sent.')
    process.exit(0)
  }
}

// --- 2. Copy -----------------------------------------------------------------------------

console.log(`\n\x1b[1m▸ Copying\x1b[0m`)
if (!run('ssh', [...SHARED, HOST, `test -d ${quote(FOLDER)} && test -w ${quote(FOLDER)}`])) {
  stop(
    `Could not reach ${FOLDER} on "${HOST}", or could not write there.\n` +
      `  · Is "${HOST}" in ~/.ssh/config? (Host ${HOST} / HostName … / User …)\n` +
      `  · Is the folder yours on the server? sudo chown <your user> ${FOLDER}`,
  )
}
/** Sends one file under a temporary name, then gives it its own: never half of it online. */
function send(file) {
  const part = `${FOLDER}/.${file}.part`
  console.log(`  ${file}`)
  if (!run('scp', [...SHARED, join('dist', file), `${HOST}:${part}`])) stop(`${file} was not copied. Nothing of it is online (it was sent under a temporary name).`)
  if (!run('ssh', [...SHARED, HOST, `mv -f ${quote(part)} ${quote(`${FOLDER}/${file}`)}`])) stop(`${file} was copied but not renamed: it is not online.`)
}
// The installers and the update files first; the files that announce the version last.
const sent = [...chosen.map((one) => one.file), ...updates.flatMap((one) => one.extra)]
for (const file of sent) send(file)
for (const one of updates) send(one.latest)
sent.push(...updates.map((one) => one.latest))

// --- 3. Check ----------------------------------------------------------------------------

console.log(`\n\x1b[1m▸ Checking the addresses\x1b[0m`)
for (const file of sent) {
  const url = `${BASE}/${file}`
  const expected = statSync(join('dist', file)).size
  let answer
  try {
    answer = await fetch(url, { method: 'HEAD' })
  } catch (error) {
    stop(`${url} does not answer (${error.cause?.code ?? error.message}). The files are on the server, the site is unchanged.`)
  }
  const length = Number(answer.headers.get('content-length'))
  if (!answer.ok) stop(`${url} answers ${answer.status}. The files are on the server, the site is unchanged.`)
  if (length !== expected) stop(`${url} is ${length} bytes, the file ${expected}. The site is unchanged.`)
  console.log(`  ✓ ${url}`)
}

// --- 4. The site's buttons -----------------------------------------------------------------

let config = readFileSync(SITE_CONFIG, 'utf8')
for (const one of chosen) {
  const line = new RegExp(`^(\\s*${one.key}: )'[^']*'`, 'm')
  if (!line.test(config)) stop(`No "${one.key}:" line in ${SITE_CONFIG}: the files are online, the site is unchanged.`)
  config = config.replace(line, `$1'${BASE}/${one.file}'`)
}
writeFileSync(SITE_CONFIG, config)
console.log(`\n\x1b[1m▸ ${SITE_CONFIG}\x1b[0m\n  ${chosen.map((one) => one.key).join(', ')} → version ${version}`)

console.log(
  `\n\x1b[32m✓ Online.\x1b[0m The site shows them once it is pushed:\n` +
    `  git commit -am "Release ${version}" && git push\n` +
    `Before telling anyone: download one from its address and open it.`,
)
