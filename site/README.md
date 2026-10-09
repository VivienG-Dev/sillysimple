# The SillySimple website

A few pages that present the app, answer questions and show how to use it. Built with Nuxt
into plain files: nothing is worked out when a page is asked for, and there is no server
behind the site. How it should look is in `DESIGN.md`, at the root of the project.

| Page | Address | What it is |
|---|---|---|
| Home | `/` | what the app is, in eight parts, and the download |
| Help | `/help/` | what people ask, by subject, and the app's words in plain language |
| Guides | `/guides/` | the list of guides |
| A guide | `/guides/<name>/` | one thing shown in a film of the real app, with the icon saying what to do |

## Commands

```bash
pnpm install     # once
pnpm dev         # the site with hot reload, on http://localhost:3100
pnpm generate    # the site as plain files, in .output/public
pnpm preview     # look at what generate made
pnpm typecheck   # check types
```

The site is its own project: it has its own `package.json` and its own dependencies, and
the app's commands do not touch it. Requires Node 22.12 or newer.

To put it online, upload the content of `.output/public` to any host of static files.

## Where things are

```
app/
  app.vue              every page goes through its layout
  app.config.ts        the download addresses, the address of the site, and that of the code
  error.vue            the page for an address that leads nowhere (built as 404.html)
  layouts/
    default.vue        the home page: the bar, the page from edge to edge, the foot
    doc.vue            the pages that are read (help, guides): the same, in one column
  pages/
    index.vue          the home page: the order of its parts
    help.vue           the Help page
    guides/index.vue   the list of guides
    guides/[slug].vue  one guide
  components/          sorted by what they belong to; each keeps its own name
    site/              the bar at the top (with the menu of the phone) and the foot
    home/              the parts of the home page (HeroSection, StoriesSection…)
    brand/             the icon, the icon alive, its entrance, the icon as a guide
    film/              the player of a film of the app
    help/              a subject of the Help page
    guide/             a guide as it is watched, and its card in the list
  composables/
    usePage.ts         what a page says to browsers and search engines (title, description…)
    useFilmPlayback.ts a film that starts when it is in sight and knows which part it shows
    useSeen.ts         tells a part when it comes into sight, to play its movement once
  data/                what the pages show, apart from how they show it
    help.ts            the questions of the Help page
    guides.ts          the guides: their steps, and what the icon says at each
    stories.json       the stories of the home page (written by `pnpm stories`)
    films.json         how long each film lasts and when its parts start (written by the film scripts)
    notes.json         what the app noted during a real chat (written by scripts/film/notes.cjs)
  utils/               small functions over that data: which film goes where, which guides are ready…
  assets/css/          tokens.css (colours, type, spacing) and base.css
  assets/brand/        the icon's shapes and the wordmark, as in the app
public/
  film/                the films, and the picture each shows before it plays
  shots/               pictures of the app
  stories/             the pictures of the stories that have one
scripts/
  stories.mjs          makes data/stories.json from the app's stories
  sitemap.mjs          lists the pages for search engines, after each build
  film/                films the real app (see "The films")
```

## Adding to the site

- **A question**: add it to `app/data/help.ts`, under its subject. It is on the Help page
  and in what search engines read of it, with an address of its own (`/help/#its-id`).
- **A guide**: film it (see "The films"), then add it to `app/data/guides.ts` with one
  step for each part of its film. A guide whose film is not made yet is simply not shown.
- **A page**: a file in `app/pages/`. Give it `usePage({ title, description, path })`, and
  `definePageMeta({ layout: 'doc' })` if it is a page to read. Link to it from the bar or
  the foot (`app/utils/site.ts`): the build starts from the home page and follows the links,
  so a page nothing links to is not built.

## For search engines

- Every page has its own title and description (`usePage`), one main title, and its text is
  in the page as it is built: nothing waits for a script.
- The home page says what the app is, the Help page lists its questions and answers, and
  each guide its steps, in the form search engines read (schema.org).
- `pnpm generate` ends by writing `robots.txt`, and `sitemap.xml` once the site has an
  address (below).
- Addresses end with a slash (`/help/`).

## When the app is ready to download

Put the address of each installer in `app/app.config.ts`. Until a line is filled, the page
says that the app is not out yet, and shows no download button for that system.

## When the site has its address

Put it in `url`, in `app/app.config.ts` (`https://…`, without a slash at the end). Three
things need it and are left out until then: the picture shown when a link is shared
(`public/og.png`), the address search engines keep for each page, and `sitemap.xml`.

## When the code is public

Put its address in `repo`, in `app/app.config.ts` (`https://github.com/…`, without a slash
at the end). Until then the site says the app is free and, in Help, that it is under the
GPL-3.0 licence and that its code is not public yet. With the address: the top of the home
page says "Free and open source", GitHub's mark in the foot (there from the start, dimmed and
leading nowhere) becomes the link to the code, the Help answer links to it too, and a question appears on where to report a problem (the "Issues" of that address).

## The stories

The page shows the stories that come with the app, read from the app's own cards in
`../scenarios`. After adding or changing one there:

```bash
pnpm stories
```

A story shows its picture when `public/stories/<name>.webp` exists (about 640 pixels wide),
and its initials otherwise, as in the app.

## The films

Every film of the site is the real app, filmed while a script drives it. One script per film,
named like it, in `scripts/film/`:

| Film | Shows | Model | Where it is used |
|---|---|---|---|
| `first-launch` | the three questions of the first launch, with the download of a model | none: the download is a stand-in, shortened | home ("Three questions"), guide "Your first chat" |
| `chat` | a line written, the character's reply, another version, its mood on the picture | a real one | the top of the home page |
| `import` | a character card imported in the Library, and its first chat | none | guide "Bring your SillyTavern characters" |
| `character` | a character written by the model from one sentence | a real one | guide "A character from one sentence" |
| `scene` | a second character brought into a chat, both answering | a real one | guide "Several characters in one scene" |

To make one (again):

```bash
# in the app (the folder above this one)
pnpm build

# here
node scripts/film/import.cjs              # the script named like the film: films the app, into .film/
node scripts/film/assemble.cjs import     # makes public/film/ from it (needs ffmpeg)
```

The second command also writes `app/data/films.json` (how long the film lasts, when each part
starts): the page follows it by itself, and a guide appears once its film is listed there.

What drives the app is `playwright-core`, which comes with `pnpm install`: it opens no browser
and downloads none. What the scripts share is in `scripts/film/lib.cjs`.

Things to know:

- **The films without a model download nothing.** They put the stand-in for Ollama that the
  app's tests use in the place of the app's engine. In `first-launch` the 4.6 GB "arrive" in
  five seconds, and the page says so under the film. Quit Ollama before running them, or the
  app uses yours and says so on screen.
- **The models shown depend on the computer that films**: with 8 GB of memory only the small
  one, with 32 GB all three. `first-launch` was made with 8 GB, on purpose.
- **The films with a real model** use the small one unless `MODEL` says otherwise. The first
  time, the app downloads its engine (167 MB on a Mac) into `.film/chat-data`, and the model
  if it is not on the computer yet. Look at a film before keeping it: what the model writes
  is not known in advance. In `chat` the reply is shown at the speed it was written; in
  `character` the writing of the card is sped up, and the page says so.
- The scripts were written on Linux, where they run without a screen. `chat.cjs`,
  `notes.cjs`, `character.cjs` and `scene.cjs` have been run on a Mac (7 and 8 October
  2026); `first-launch.cjs` and `import.cjs` have not. On a Mac they open the
  app's window for real: leave the mouse alone while they film. What each does is written
  at its top.
- The pictures are as sharp as the screen that films: 2240 pixels wide on a Retina screen,
  1120 on an ordinary one. The films are 1680 wide.

## The notes of "It keeps the story straight"

That part of the page shows what the app noted by itself during a real chat: where the scene
is, what the character wears, what it remembers, where the story is heading, the tastes it
learned. They come from `app/data/notes.json`, which a script writes:

```bash
# in the app (the folder above this one)
pnpm build

# here
node scripts/film/notes.cjs
```

It plays ten lines of a story in the real app with a real model (the small one unless `MODEL`
says otherwise) and takes a few minutes. Before keeping `notes.json`, read
`.film/notes/log.json`: every line, every reply, and the notes after each. A model does not
always get them right, and the page says nothing in them was written by hand. Until the
script has been run, `notes.json` holds `null` and the page shows the four features without
notes.

## What comes from the app

These files are copies of the app's, with the differences written at the top of each. When
the app's version changes, change these too.

| Here | In the app |
|---|---|
| `app/assets/brand/shapes.ts`, `wordmark.png` | `src/renderer/assets/brand/` (unchanged) |
| `app/components/brand/AppIcon.vue` | `src/renderer/components/AppIcon.vue` |
| `app/components/brand/AppMascot.vue` | `src/renderer/components/AppMascot.vue` |
| `app/components/brand/LogoIntro.vue` | `src/renderer/components/LogoIntro.vue` (an earlier version: without the talking icon inside) |
| `app/components/brand/MascotGuide.vue` | `src/renderer/components/MascotGuide.vue`, redrawn in the site's colours |
| the answers of `app/data/help.ts`, where the app says the same | `src/renderer/pages/settings/help.vue`, and the labels of the settings |
| `app/utils/avatar.ts` | `src/renderer/utils/avatar.ts` (unchanged) |
| `app/utils/format.ts` | two functions of `src/renderer/utils/format.ts` and `src/core/prompt/macros.ts` |
| the three models in `app/components/home/ComputerSection.vue` | `src/core/engine/models.ts` (names, sizes, memory each needs) |
