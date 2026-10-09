// The website of SillySimple: a few pages, built once into plain files, and one small server
// behind them for the contact form (server/api/contact.post.ts).
//
//   pnpm build      what goes online: the pages, and the server that serves them and sends the
//                   form (node .output/server/index.mjs)
//   pnpm generate   the pages alone, without the form: to look at them anywhere
// How it should look is in DESIGN.md, at the root of the project.

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  telemetry: false,
  devtools: { enabled: false },

  // Not 3000: Manga Hive's API listens there, and its front-end would end up
  // calling this site instead.
  devServer: { port: 3100 },

  // The same fonts as the app, shipped with the site: nothing is loaded from a font service.
  css: [
    '@fontsource-variable/figtree/wght.css',
    '@fontsource-variable/literata/wght.css',
    '@fontsource-variable/literata/wght-italic.css',
    '~/assets/css/tokens.css',
    '~/assets/css/base.css',
  ],

  // Components are sorted into folders (site, home, brand…) and keep their own names:
  // components/home/HeroSection.vue is <HeroSection>, not <HomeHeroSection>.
  components: [{ path: '~/components', pathPrefix: false }],

  // One address per page, always ending with a slash: /help/ and not /help.
  experimental: { defaults: { nuxtLink: { trailingSlash: 'append' } } },

  // Building starts from the home page and follows every link: a page nothing links to is
  // not built. The list of pages for search engines is made afterwards (scripts/sitemap.mjs).
  nitro: { prerender: { crawlLinks: true, routes: ['/'] } },

  // The mailbox the contact form sends from. The address and the password are given to the
  // server where it runs (NUXT_SMTP_USER, NUXT_SMTP_PASS in Coolify), never written here.
  runtimeConfig: {
    smtpHost: 'mail.infomaniak.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    /** Where messages go: the mailbox itself, unless another address is given. */
    contactTo: '',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      // The top of the page, so that the browser's own bar continues it on a phone.
      meta: [{ name: 'theme-color', content: '#2a1912' }],
      // Says that scripts run, before anything is drawn: what a script is about to write
      // letter by letter (the guide's words) can then start unseen instead of flashing.
      // Without scripts the mark is not there, and everything is simply shown.
      script: [{ innerHTML: "document.documentElement.classList.add('js')", tagPosition: 'head' }],
    },
  },
})
