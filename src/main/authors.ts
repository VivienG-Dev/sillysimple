import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PORTRAIT_SCHEME } from '@shared/ipc'
import type { Author, Scenario } from '@shared/types'
import { scenariosFolder } from './scenarios'

// Partners: people who let the app come with characters they wrote, on the promise that
// they are credited. Each one gets a small page in the app, reached from "by …" wherever
// one of their characters is shown. They are written by hand in scenarios/authors/:
//
//   authors.json   [{ "name": "SzainX", "about": "…", "links": ["https://…", { "label": "Chub", "url": "https://…" }], "picture": "szainx.png", "banner": "szainx-banner.png" }]
//   szainx.png     their picture, optional
//   szainx-banner.png  a wide picture across the top of their page, optional
//
// Only `name` is needed, and it must be the `creator` written in their cards: that is how
// their characters are found. See scenarios/CREDITS.md.

const FOLDER = 'authors'
const FILE = 'authors.json'
/** A page shows a few links, not a directory. */
const MAX_LINKS = 4
const PICTURE = /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp)$/i

interface Written {
  name: string
  about: string
  links: { label: string; url: string }[]
  picture?: string
  banner?: string
}

/** "SzainX" -> "szainx", "Lady Ash" -> "lady-ash": the page's address. */
export function authorId(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'author'
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** A link as written: an address alone, or { label, url }. Only https; the label defaults to the site's name. */
function linkOf(value: unknown): { label: string; url: string } | null {
  const url = isRecord(value) ? text(value['url']) : text(value)
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) return null
  const label = isRecord(value) ? text(value['label']) : ''
  return { label: label || new URL(url).hostname.replace(/^www\./, ''), url }
}

/** The authors as written in authors.json: those without a name are left out, and so is the rest of what is not understood. */
export function parseAuthors(json: unknown): Written[] {
  const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json['authors']) ? json['authors'] : []
  const seen = new Set<string>()
  const authors: Written[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const name = text(item['name'])
    if (!name || seen.has(authorId(name))) continue
    seen.add(authorId(name))
    const links = (Array.isArray(item['links']) ? item['links'] : [])
      .map(linkOf)
      .filter((link) => link !== null)
      .slice(0, MAX_LINKS)
    const picture = text(item['picture'])
    const banner = text(item['banner'])
    authors.push({ name, about: text(item['about']), links, ...(PICTURE.test(picture) && { picture }), ...(PICTURE.test(banner) && { banner }) })
  }
  return authors
}

async function readWritten(): Promise<Written[]> {
  const source = await readFile(join(scenariosFolder(), FOLDER, FILE), 'utf8').catch(() => null)
  if (source === null) return []
  try {
    return parseAuthors(JSON.parse(source))
  } catch (error) {
    console.warn(`[authors] ${FILE} could not be read:`, error instanceof Error ? error.message : error)
    return []
  }
}

/** The partner authors, each with the scenarios whose card names them as creator. */
export async function listAuthors(scenarios: Scenario[]): Promise<Author[]> {
  const pictures = new Set(await readdir(join(scenariosFolder(), FOLDER)).catch(() => []))
  return (await readWritten()).map((author) => {
    const id = authorId(author.name)
    return {
      id,
      name: author.name,
      about: author.about,
      links: author.links,
      ...(author.picture && pictures.has(author.picture) && { pictureUrl: `${PORTRAIT_SCHEME}://author/${encodeURIComponent(id)}` }),
      ...(author.banner && pictures.has(author.banner) && { bannerUrl: `${PORTRAIT_SCHEME}://author-banner/${encodeURIComponent(id)}` }),
      scenarioIds: scenarios
        .filter((scenario) => scenario.creator && authorId(scenario.creator.name) === id)
        .map((scenario) => scenario.id),
    }
  })
}

/** The picture (or the banner) of a partner author, or null. Only a file named in authors.json, in its folder. */
export async function authorPicture(id: string, which: 'picture' | 'banner' = 'picture'): Promise<string | null> {
  const author = (await readWritten()).find((item) => authorId(item.name) === id)
  const file = author?.[which]
  return file ? join(scenariosFolder(), FOLDER, file) : null
}
