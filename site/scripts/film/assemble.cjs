// Turns the pictures taken by one of the filming scripts into a film of the site (needs
// ffmpeg). The name is the one of the script that filmed:
//
//   node scripts/film/assemble.cjs first-launch
//   node scripts/film/assemble.cjs chat
//   node scripts/film/assemble.cjs import
//
//   public/film/<name>.webm and .mp4     the film, in the two formats browsers play
//   public/film/<name>-poster.webp       the picture shown before it plays
//   app/data/films.json                  how long it lasts and when each of its parts starts
//
// The page reads films.json: the steps under a film follow it by themselves, and the film
// of the chat goes to the top of the page as soon as it is listed there.
//
// What is done to the time (see FILMS below): a still moment is shortened, and most films
// go a little quicker than life. The chat is left at its real speed: how fast a reply is
// written is part of what it shows. A part that would be long to watch (the model writing
// a whole character) is shown in a few seconds, and the site says so under the film.

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const FILMS = {
  'first-launch': {
    /** The part that starts here, and all that follows, may be shortened and sped up. */
    asItIsUntil: 'name',
    speed: 1.35,
    longestStill: 1.0,
    last: 2.2,
    /** The picture shown before it plays: the chat, a little after it has opened. */
    poster: (starts, length) => Math.min(length - 0.5, (starts.chat ?? length / 2) + 2.2),
  },
  chat: {
    asItIsUntil: null,
    speed: 1,
    longestStill: 1.2,
    last: 1.2,
    /** Near the end: a reply is written, and its mood is playing if it has one. */
    poster: (starts, length) => length - 2.4,
  },
}
/** The width of a film, in pixels. */
const WIDTH = 1680

/** For the films of the guides: a little quicker than life, still moments shortened. */
const GUIDE = {
  asItIsUntil: null,
  speed: 1.15,
  longestStill: 1.0,
  last: 2.0,
  poster: (starts, length) => length - 1.2,
}

// A character is written by the model in half a minute or more: that part is shown in
// eight seconds at most, and the site says it is sped up.
FILMS.character = { ...GUIDE, atMost: { writes: 8 } }

const name = process.argv[2]
if (!name || !fs.existsSync(path.resolve(__dirname, '../../.film', name, 'frames/times.json'))) {
  console.error('Which film? Give the name of one that has been filmed: first-launch, chat, import…')
  process.exit(1)
}
const film = FILMS[name] ?? GUIDE

const site = path.resolve(__dirname, '../..')
const work = path.join(site, '.film', name)
const frames = path.join(work, 'frames')
const target = path.join(site, 'public/film')
const listing = path.join(site, 'app/data/films.json')

const times = JSON.parse(fs.readFileSync(path.join(frames, 'times.json'), 'utf8'))
const marks = JSON.parse(fs.readFileSync(path.join(frames, 'marks.json'), 'utf8'))
const free = film.asItIsUntil ? (marks.find((mark) => mark.name === film.asItIsUntil)?.index ?? 0) : 0

// How long each picture stays: a still moment is shortened first.
const stays = times.map((time, i) => {
  if (i + 1 === times.length) return film.last
  const lasts = times[i + 1] - time
  return i >= free ? Math.min(lasts, film.longestStill) : lasts
})
// Then the speed of each part: the film's own, or quicker for a part that may only last so long.
const begins = marks.map((mark) => mark.index)
const speedOf = marks.map((mark, k) => {
  const most = film.atMost?.[mark.name]
  if (!most) return film.speed
  const natural = stays.slice(mark.index, begins[k + 1] ?? times.length).reduce((sum, lasts) => sum + lasts, 0)
  return Math.max(film.speed, natural / most)
})

let list = ''
let at = 0
const steps = []
const starts = {}
for (let i = 0; i < times.length; i++) {
  for (const mark of marks) {
    if (mark.index !== i) continue
    starts[mark.name] = at
    // The first part starts with the film, whatever picture its mark fell on.
    steps.push({ at: steps.length === 0 ? 0 : Number(at.toFixed(1)), label: mark.label })
  }
  const part = begins.findLastIndex((index) => index <= i)
  const lasts = i >= free && i + 1 < times.length ? stays[i] / (speedOf[part] ?? film.speed) : stays[i]
  list += `file '${path.join(frames, `f${String(i).padStart(5, '0')}.jpg`)}'\nduration ${lasts.toFixed(4)}\n`
  at += lasts
}
// The list has to name its last picture twice for its duration to count.
list += `file '${path.join(frames, `f${String(times.length - 1).padStart(5, '0')}.jpg`)}'\n`
const listFile = path.join(work, 'pictures.txt')
fs.writeFileSync(listFile, list)

fs.mkdirSync(target, { recursive: true })
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
// Even sizes, which both formats ask for.
const picture = `fps=30,scale=${WIDTH}:-2,format=yuv420p`
const source = ['-f', 'concat', '-safe', '0', '-i', listFile]
const file = (ending) => path.join(target, `${name}${ending}`)

ffmpeg(...source, '-vf', picture, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', file('.mp4'))
ffmpeg(...source, '-vf', picture, '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-an', file('.webm'))
ffmpeg('-ss', film.poster(starts, at).toFixed(2), '-i', file('.mp4'), '-frames:v', '1', '-quality', '86', file('-poster.webp'))

// A part that lasts no time is not one (a reply whose mood did not show, for instance).
const parts = steps.filter((step, index) => index === steps.length - 1 || steps[index + 1].at - step.at >= 0.4)

const films = fs.existsSync(listing) ? JSON.parse(fs.readFileSync(listing, 'utf8')) : {}
films[name] = { length: Number(at.toFixed(1)), steps: parts }
fs.writeFileSync(listing, `${JSON.stringify(films, null, 2)}\n`)

const size = (ending) => `${(fs.statSync(file(ending)).size / 1e6).toFixed(1)} MB`
console.log(`"${name}" lasts ${at.toFixed(1)} s: ${name}.mp4 ${size('.mp4')}, ${name}.webm ${size('.webm')}`)
console.log('Its parts, written to app/data/films.json:', parts.map((step) => `${step.label} at ${step.at} s`).join(', '))
