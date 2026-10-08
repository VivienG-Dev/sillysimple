// Writes app/data/stories.json from the ready-to-play stories of the app (../scenarios).
// Run it again when a story is added or changed there:  pnpm stories
//
// A story is a character card: a .json file, or a .png picture that carries the same
// JSON inside it. Only what the page shows is kept. Pictures are not copied: a story
// whose picture is in public/stories/<id>.webp shows it, the others show their initials.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const here = import.meta.dirname
const source = resolve(here, process.argv[2] ?? '../../scenarios')
const target = resolve(here, '../app/data/stories.json')
const pictures = resolve(here, '../public/stories')

/** The card written inside a PNG: a text chunk named "ccv3" or "chara", in base64. */
function cardInPng(file) {
  const bytes = readFileSync(file)
  const found = {}
  let at = 8 // After the PNG signature.
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'tEXt') {
      const data = bytes.subarray(at + 8, at + 8 + length)
      const end = data.indexOf(0)
      found[data.toString('latin1', 0, end)] = data.toString('latin1', end + 1)
    }
    at += 12 + length
  }
  const text = found.ccv3 ?? found.chara
  if (!text) throw new Error(`${basename(file)} has no character card inside it`)
  return JSON.parse(Buffer.from(text, 'base64').toString('utf8'))
}

const files = readdirSync(source)
  .filter((name) => ['.json', '.png'].includes(extname(name)))
  // Of a.png and a.json, the picture is the one that counts, as in the app.
  .filter((name, _, all) => extname(name) === '.png' || !all.includes(`${basename(name, '.json')}.png`))

const stories = files.map((name) => {
  const id = basename(name, extname(name))
  const file = join(source, name)
  const card = extname(name) === '.png' ? cardInPng(file) : JSON.parse(readFileSync(file, 'utf8'))
  const data = card.data ?? card
  return {
    id,
    name: data.name,
    tagline: data.extensions?.sillysimple?.tagline ?? '',
    tags: data.tags ?? [],
    /** Where the story starts, with {{user}} and {{char}} still in it. */
    pitch: data.scenario ?? '',
    /** The character's first message. */
    opening: data.first_mes ?? '',
    openings: 1 + (data.alternate_greetings?.length ?? 0),
    picture: existsSync(join(pictures, `${id}.webp`)) ? `/stories/${id}.webp` : null,
  }
})

// Those with a picture first, then by name: the order of the app.
stories.sort((a, b) => Number(Boolean(b.picture)) - Number(Boolean(a.picture)) || a.name.localeCompare(b.name))

writeFileSync(target, `${JSON.stringify(stories, null, 2)}\n`)
console.log(`${stories.length} stories written to app/data/stories.json`)
for (const story of stories) console.log(`  ${story.picture ? 'picture ' : 'initials'}  ${story.name}`)
