// What a page says about itself to browsers, search engines and shared links: its title,
// one or two sentences, and its address. Every page calls this once.
//
// The full address (and with it the picture of a shared link, and the "canonical" address
// search engines keep) needs the address of the site: it is added once app.config.ts has one.

export interface PageAbout {
  /** The title of the page alone: the name of the site is added after it. */
  title: string
  /** One or two sentences, as a search result would show them. */
  description: string
  /** Where the page is on the site, starting and ending with a slash: '/help/'. */
  path: string
}

const SITE = 'SillySimple'

export function usePage(about: PageAbout): void {
  const config = useAppConfig()
  // The home page is named after what the app does; the others after themselves.
  const title = about.path === '/' ? about.title : `${about.title} · ${SITE}`
  const address = config.url ? `${config.url.replace(/\/$/, '')}${about.path}` : null

  useSeoMeta({
    title,
    description: about.description,
    ogTitle: title,
    ogDescription: about.description,
    ogType: 'website',
    ogSiteName: SITE,
    ...(address
      ? { ogUrl: address, ogImage: `${config.url.replace(/\/$/, '')}/og.png`, twitterCard: 'summary_large_image' as const }
      : {}),
  })
  if (address) useHead({ link: [{ rel: 'canonical', href: address }] })
}

/**
 * Facts about the page in the form search engines read (schema.org), written into the
 * page as it is built.
 */
export function useStructuredData(data: Record<string, unknown>): void {
  useHead({ script: [{ type: 'application/ld+json', innerHTML: JSON.stringify({ '@context': 'https://schema.org', ...data }) }] })
}
