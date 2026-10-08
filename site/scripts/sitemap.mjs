// Run by "pnpm generate", after the pages are built: writes the two files search engines
// look for, next to the pages.
//
//   .output/public/sitemap.xml    the address of every page that was built
//   .output/public/robots.txt     "everything may be read", and where the list above is
//
// The pages are found by looking at what was built, so a new page is listed by itself.
// A list of pages needs full addresses: until app.config.ts has the address of the site
// (`url`), no sitemap is written and robots.txt does not mention one.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const built = join(site, '.output/public')
const url = (/\burl:\s*'([^']*)'/.exec(readFileSync(join(site, 'app/app.config.ts'), 'utf8'))?.[1] ?? '').replace(/\/$/, '')

/** Every folder of the build that holds a page, as the path of that page. */
function pages(folder) {
  const found = []
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) {
      // What Nuxt adds for itself is not a page.
      if (!name.startsWith('_')) found.push(...pages(path))
    } else if (name === 'index.html') {
      const here = relative(built, folder).split('\\').join('/')
      found.push(here ? `/${here}/` : '/')
    }
  }
  return found
}

const paths = pages(built).sort((a, b) => a.length - b.length || a.localeCompare(b))

if (url) {
  const today = new Date().toISOString().slice(0, 10)
  const entries = paths.map((path) => `  <url><loc>${url}${path}</loc><lastmod>${today}</lastmod></url>`).join('\n')
  writeFileSync(join(built, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`)
}
writeFileSync(join(built, 'robots.txt'), `User-agent: *\nAllow: /\n${url ? `\nSitemap: ${url}/sitemap.xml\n` : ''}`)

console.log(`${paths.length} pages: ${paths.join('  ')}`)
console.log(url ? `sitemap.xml and robots.txt written for ${url}` : 'robots.txt written. No sitemap.xml yet: the site has no address in app.config.ts (url).')
