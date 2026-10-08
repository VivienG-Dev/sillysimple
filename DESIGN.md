---
version: alpha
name: SillySimple
description: |
  The look of SillySimple, for the desktop app and for its website. A calm, dark, violet-tinted
  reading room for stories, with one warm exception: the orange icon and its smiling cream
  speech bubble. Written from the app's code on 7 October 2026; the code stays the reference
  (src/renderer/assets/css/tokens.css and base.css).

colors:
  # Brand: the icon, the logo's entrance and the wordmark. From src/renderer/assets/brand/shapes.ts.
  brand-orange-top: "#e07023"
  brand-orange-mid: "#b94910"
  brand-orange-bottom: "#912f0d"
  brand-cream: "#fceed6"
  brand-ink: "#2a1912"
  # Interface surfaces, darkest to lightest.
  bg-sidebar: "#15141b"
  bg-sunken: "#18171e"
  bg-app: "#1b1a22"
  bg-panel: "#1e1d26"
  bg-field: "#201f28"
  bg-card: "#201f29"
  bg-button: "#23222c"
  bg-active: "#262435"
  bg-tile: "#2a2836"
  bg-selected: "#34324a"
  # Lines.
  border: "#2a2834"
  border-field: "#2c2a36"
  border-strong: "#2f2d3a"
  border-input: "#383548"
  border-hover: "#45425c"
  # Text, brightest to faintest.
  text: "#ecebf2"
  text-prose: "#e4e2ec"
  text-soft: "#dcdae6"
  text-tag: "#b8b5c8"
  text-action: "#a9a6ba"
  text-muted: "#a3a1b3"
  text-dim: "#9896aa"
  text-faint: "#8f8da0"
  text-ghost: "#88869d"
  # Accent.
  accent: "#6d5ce0"
  accent-hover: "#7d6ff0"
  accent-strong: "#8f84e8"
  accent-text: "#b4a9ff"
  accent-soft: "#cbbcff"
  accent-bg: "#232035"
  # States.
  success: "#3fb97a"
  success-text: "#7fdcaa"
  warning-text: "#e8b86b"
  danger-text: "#f2a4a4"
  danger-bg: "#36202a"
  danger-border: "#5a2f3d"
  like: "#ff6b93"

typography:
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Figtree Variable', 'Segoe UI', sans-serif"
    fontSize: 13px
    lineHeight: 1.4
  prose:
    fontFamily: "'Literata Variable', Georgia, serif"
    fontSize: 15px
    lineHeight: 1.6
  page-title:
    fontFamily: "'Literata Variable', Georgia, serif"
    fontSize: 26px
    fontWeight: 600
  eyebrow:
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.06em
    textTransform: uppercase
  mono:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"

rounded:
  sm: 6px
  DEFAULT: 8px
  md: 10px
  lg: 12px
  xl: 14px
  pill: 999px
---

# SillySimple design

## Overview

SillySimple is a desktop app for AI roleplay chat: a friendlier alternative to SillyTavern, with
no terminal and nothing to configure before the first message. The design follows from the name.
It has to stay simple and be usable by anyone, including people who have never touched a local
model.

Two things make it recognisable:

- **A quiet, dark place to read.** Dark surfaces with a hint of violet, a serif for the story,
  few controls on screen. The text of the story is the brightest and largest thing in the window.
- **One friendly face.** The icon is an orange tile with a cream speech bubble that smiles. It is
  the only warm, saturated thing in the product, and it is used sparingly: the app icon, the
  first launch, the Help page.

## Colours

There are two families. In the app as it is today they are not mixed. The website has a dark
of its own, taken from the first one (see "The website").

### Brand (the icon)

| Role | Value |
|---|---|
| Tile, top to bottom | `#e07023` → `#b94910` → `#912f0d` (vertical gradient, seven stops in `shapes.ts`) |
| Speech bubble, wordmark | `#fceed6` (cream) |
| Eyes and smile | `#2a1912` (warm near-black) |

In the app these colours appear only in the logo. Nothing in the interface is orange.

Which pairs can carry text (4.5:1 or more):

| Pair | Contrast | Use |
|---|---|---|
| Ink on cream | 14.7:1 | Any text |
| Cream on the lower half of the tile (`#b94910` and darker) | 4.6:1 to 7.0:1 | Any text |
| `#b94910` and darker, as text on cream | 4.6:1 to 7.0:1 | Links, small headings |
| Ink on the top of the tile (`#e07023`) | 5.2:1 | Any text |
| Cream or white on the top of the tile (`#e07023`) | 2.8:1 and 3.2:1 | Not for text; large shapes only |
| `#e07023` as text on cream | 2.8:1 | Not for text |

So the bright orange is for surfaces and shapes, and the darker orange for anything that is read.

### Interface

- **Surfaces** are ten steps of the same violet-tinted near-black, from `--bg-sidebar` (darkest)
  to `--bg-selected`. Depth comes from stepping one or two shades and from a 1px border, not
  from shadows.
- **Text** has nine steps from `--text` to `--text-ghost`. Every step reaches at least 4.5:1 on
  `--bg-app`, `--bg-panel` and `--bg-card`. `--text-ghost` is the faintest and is only for small
  secondary lines (hints, counters, captions) and for things that are switched off.
- **Accent** is one violet, `--accent` (`#6d5ce0`), with lighter steps for text and links
  (`--accent-text`, `--accent-soft`). White text on `--accent` is 4.9:1.
- **States** keep their usual meaning: green for success, amber for a warning, a soft red for
  errors and for what cannot be undone. `--like` (`#ff6b93`) is the heart of a favourite and
  never changes.

### The interface takes its tint from the character

By default the app turns its surfaces, text and accent towards the main colour of the
character on screen ("Take the colours from the character", in Appearance). Only the hue
changes: each colour keeps its exact brightness, so every contrast stays what it was. The
change fades over 0.45s. The first-launch screens always show the app's own violet.

A character without a picture gets initials on one of six muted tiles (violet, brown, teal,
plum, olive, blue; see `utils/avatar.ts`). The user's own persona is always the teal one.

## Typography

| Use | Font | Size and weight |
|---|---|---|
| Interface | System font on macOS, Figtree Variable elsewhere | 13px, line height 1.4; labels 600, names 700 |
| Story text, message box, message editor | Literata Variable | 15px, line height 1.6 |
| Page and dialog titles (`.title-serif`) | Literata Variable, 600 | 26px for pages, 30px at first launch, 18 to 20px in dialogs and panels |
| Small labels | Interface font | 10.5 to 12.5px |
| Eyebrow | Interface font, 600, uppercase, 0.06em | 11px |
| Technical values | System monospace | as needed |

- The serif is for stories and for titles. Controls, labels and settings stay in the sans.
- In story text, `*actions*` are shown in italics in a dimmer colour (`--text-action`).
- The wordmark is a picture (`assets/brand/wordmark.png`): "SillySimple" in one word, both S
  in capitals, in cream. Use the picture; do not set it again in another font.
- Fonts ship with the app (`@fontsource-variable/figtree`, `@fontsource-variable/literata`).
  Nothing is loaded from a font service.

## Shape

- Corners: 8px for controls, 12px for cards and messages, 14px for the large containers (the
  message box, scenario cards), full pills for chips, tags and small toggles. Avatars and dots
  are circles.
- The icon's tile is a rounded square with soft, continuous corners.
- Lines are 1px, in the border colours.

## Depth

The interface is almost flat. One floating layer in the whole app has a drop shadow (the guided
tour's bubble: `0 16px 40px rgb(0 0 0 / 0.45)`). Soft coloured glows exist in one place (the
character assistant). Keyboard focus is a 2px `--accent-strong` outline, 2px away from the
control.

When a picture sits behind the chat, text never sits directly on it: messages, the top bar and
the message box get their own translucent panel of the app's background colour.

## Motion

- **State changes** (hover, focus, border): 0.12s.
- **Things arriving** (a message, a first-launch step): fade in while rising 8 to 12px, 0.2s,
  ease-out.
- **Sliding selections** (segmented control): a stiff spring, no bounce to speak of.
- **Playful pops** (mood emotes on the character's picture): 0.45s with a small overshoot,
  `cubic-bezier(0.3, 1.7, 0.5, 1)`.
- **The logo's entrance**: a cream liquid flies in from both sides, swirls into the middle and
  gathers into the speech bubble; the face comes, it winks, and the orange tile bursts out behind
  it. It plays once at first launch and again when the logo is clicked in Help. It lives in
  `components/LogoIntro.vue`, which uses only `AppIcon.vue` and the shapes in
  `assets/brand/shapes.ts`.
- Everything stops or is skipped when the system asks for less motion.

Motion is done with CSS and the browser's own animations, plus `motion-v` for a few entrances.

## Icons

Lucide (`@lucide/vue`), mostly 13 or 14px in controls, stroke width around 2. No emoji as
icons. A button that is only an icon must have a label for screen readers and a tooltip.

## Layout of the app

- Top bar 52px. Left sidebar 264px, right character panel 300px. The story is a centred column,
  760px at most.
- Buttons are 32px tall (30px for small ones), fields 32px, the row of story chips 26px.
- A message is a 40px avatar, the name, then the text. The user's own messages sit on a card
  (`--bg-card`, 12px corners); the character's sit on the background.
- A ready-to-play story is a wide card: its picture on the side (2:3), its pitch next to it.

## Words

- Plain, short sentences in the second person: "What should characters call you?", "You can
  change it anytime."
- Say what will happen, in everyday words: "It will be gone for good."
- No jargon where a common word exists, and no exclamation marks.
- Buttons name their action: "Start chatting", "Delete chat", "Try again".

## Do and do not

Do:
- Keep the story text the most readable thing on screen.
- Keep few controls in view; reveal the rest on hover or focus.
- Use one accent colour at a time.
- Keep every text colour at 4.5:1 or more on the surface it sits on.

Do not:
- Add a second saturated colour to the interface.
- Put text straight on a picture.
- Crowd a screen with buttons, or use heavy effects where a border and a shade are enough.
- Draw the logo, the wordmark or the bubble's face again by hand.

## The website

Decided on 7 October 2026:

- The site lives in `site/`, is built with Nuxt, and started as a single page that presents
  the app and offers the download. It now has a Help page and guides beside it ("The pages").
- **The page is dark, with the icon's orange as its one accent.** A page that was orange from
  top to bottom was built first and dropped: too much for the eyes. There is one look; a light
  one may come later.
- Its interface font is Figtree everywhere. No system font on the web.

What carries over from the app as it is:
- The icon, the wordmark and the logo's entrance (a Vue component that does not depend on the
  rest of the app).
- Figtree and Literata, Lucide icons, the corner scale and the tone of voice.
- The accessibility rules: contrast, visible focus, reduced motion.

Orange, cream, ink, Literata and Lucide are the brand's own choices, taken from the icon Vivien
drew and from the app. A design tool or skill that discourages them by default must keep them
here.

What does not carry over: the violet accent and the violet-tinted surfaces of the app's
`tokens.css`. The site's dark is a warm one. Screenshots of the app show the app's own colours.

The app may move to these colours later. That is an idea, not a plan: nothing in the app
changes for now.

### The colours of the page

They are in `site/app/assets/css/tokens.css`. Components use the names of what a colour is
for (`--text`, `--action-bg`…), so a light look would only give these names other values.

| For | Colour |
|---|---|
| The page, top to foot | `#2a1912` (the ink of the icon's face) down to `#150c08` |
| Text on the page | Cream, `#fceed6` (14.7:1 at the top of the page) |
| The main button, the film's play button, the visitor's questions, the "Recommended" tag | Orange `#e07023` with ink text (5.2:1) |
| What the icon says | Cream speech bubbles with ink text |
| The panel a story is read in, the field a name is typed in | `#35221a` with cream text |
| The edge of a picture laid on the page | Cream at 16% |

Orange is never used for text, and never as a background behind long text. Besides the icon,
the page shows it in four places only: the main button, the play button, the questions, and
the model recommended for the visitor's computer (its tag and its edge).

Measured on the built page: every text is at 4.5:1 or more, 3:1 for large titles.

### How the page is made

- **Titles are in Figtree, extra bold and tight**, like the wordmark. Literata is kept for the
  text of the stories. This differs from the app, whose titles are in Literata.
- **Three weights only**: 400 for text, 700 for labels and buttons, 800 for titles. Titles
  have a line height of 1.05.
- **Buttons are pills.** The main one is orange; the others are cream. A choice among several
  (the film's steps, the memory sizes) has a thin, quiet edge (1px, `--field-line`); the one
  picked is filled in cream.
- **The bar at the top stays in the window** (58px, `--nav`), so the download is always one
  click away. A thin line marks its lower edge once the page has moved under it. It has three
  links (Stories, Guides, Help) and the download. Under 720 pixels the links go into a menu
  that opens under the bar; the download stays in the bar.
- **The icon is alive**, as in the app: its face follows the pointer, blinks, and is glad when
  the main button is reached.
- **A film opens the page**: the real app, filmed while a script drives it
  (`site/scripts/film`), never a drawn or promotional one. It plays without sound, has a
  pause button, and does not play by itself for people who asked for less motion. It starts
  once most of it is in sight (60%), not before: on a laptop the page opens with only the top
  of the film showing, and nobody should miss its beginning.
- **Two films, each where it answers a question** (decided on 7 October 2026):
  - at the top, *a chat*: a line is written, the character answers, another version is asked
    for, and its mood plays on its picture. This is what makes someone want the app, so it
    comes first. It is filmed with a real model, the small one, so that the film shows what
    a computer with 8 GB gets, and the reply is left at the speed it was written.
  - under "Three questions, then you are in", *the first launch*, with the icon that speaks
    and the download of a model. It answers "is it hard to set up?". Its download is a
    stand-in, shortened to a few seconds, and the page says so under the film.
  Both are made (the chat on Vivien's Mac, 7 October 2026). Were the chat film to be
  removed from `site/app/data/films.json`, the first launch would take the top of the page
  again and "Three questions" would show a picture (`site/README.md`, "The films").
- **The page says what computer the app is made for, and promises nothing beyond it**
  (Vivien, 8 October 2026): a Mac with an Apple chip, or a PC with a graphics card. On a PC
  without one, nothing is promised, and the page points to an online service with a key of
  one's own. It is said in the first sentence of the page, and under the film in "A model
  that fits your computer". There the visitor says how much memory their computer has (8,
  16, 32 GB) and sees what the app would offer: the same three models and the same rule as
  `src/core/engine/models.ts`. When that file changes, `ComputerSection.vue` changes.
  Memory decides which model fits, not how fast it writes: the page keeps the two apart.
  The page said "8 GB of memory is enough" until then; nobody had seen it on an ordinary PC.
- **"It keeps the story straight"** (decided on 7 October 2026) presents what the app keeps
  track of without being asked: where the scene is, the memory of a long chat (both on from
  the start), where the story is heading and the user's tastes (both in beta, off until
  turned on: the page says so on each, as the app does). The page does not call them unique:
  SillyTavern has extensions for some of this. What it says is that here they are part of the
  app, with nothing to find or set up, and that every note can be read and corrected.
  Under each, the note the app really took in a real chat (`site/README.md`, "The notes"),
  shown as text in the type of the stories, with the labels of the app's Memory tab. Never
  written by hand.
- **What people ask is laid out as a chat**: their questions in orange, the icon's answers in
  cream bubbles.
- **What moves, and why.** Each movement shows something the app does; nothing fades in just
  to decorate. Each plays once, when its part comes into sight (`composables/useSeen.ts`):
  - a question arrives, the icon "writes" (three dots), then answers, as in a chat;
  - the stories' covers arrive one after the other, and a story changes with a short fade;
  - a model steps forward or back when another memory size is picked;
  - the icon hops once when the download part is reached.
  The logo's entrance plays when the logo is clicked. With reduced motion, and without
  scripts, everything is simply there.
- **Two parts of the page are about 130px apart** on a computer and 80px on a phone
  (`--band`, counted twice). It was 216px: more than twice what Linear, Raycast and Ollama use.
- No text is smaller than 12px.
- Sizes, spacing and the page's width are in the same `tokens.css`. The layout changes at 720,
  820 and 900 pixels.

### The pages

Decided on 7 October 2026, when the site got more than one page:

- **Three kinds of pages.** The home page (`/`), Help (`/help/`), and the guides (`/guides/`
  and one page for each). Where each file is: `site/README.md`.
- **Nothing is worked out when a page is asked for.** Every page is written as a plain file
  when the site is built, and reads the same with scripts turned off: the questions, the
  steps of a guide and what the icon says are all in the page. Scripts add what moves.
- **Two layouts.** The home page runs from edge to edge, part after part. The pages that are
  read (Help, a guide, the page for a wrong address) are in one column on a single
  background. Both have the same bar and the same foot.
- **The menu of the phone works without scripts**: it is a part of the page that opens and
  closes by itself. Scripts only close it: when a link is followed, with Escape, or with a
  press beside it.
- **Help answers what worries people for no reason**, by subject: before installing, models,
  chats and data, in a story, coming from SillyTavern. Then the app's words in plain
  language, the same as in the app's own Help. An answer is a few sentences, never a list of
  settings. It says nothing the app does not do. **The app is free** (Vivien, 8 October 2026):
  the site says so at the top, in the download part and in Help. **Its code will be
  public, under the GPL-3.0 licence** (Vivien, 8 October 2026: open source, and nobody should
  be able to close it and sell it; the name and the icon stay his). Help says so now. The
  site calls the app "open source" and links to the code only once the code's address is in
  `site/app/app.config.ts` (`repo`): before that, nobody could go and look. GitHub's mark is
  in the foot of every page from the start, dimmed and leading nowhere until then. It is the
  one icon that is not from Lucide, which has no marks of brands: it comes from the
  `simple-icons` package. The first question it was made for: several lines named "ollama" in
  Activity Monitor are normal (the program, plus one for each model in memory).
- **A guide is a film of the real app with the icon beside it, saying what to do**, the way
  it does at the app's first launch: it hovers, and its sentence is written letter by letter
  in a cream bubble. The sentence changes when the film reaches the next step, and a step
  can be picked to see it again. Under the film, the same steps as plain text, for reading
  and for search engines. One guide shows one thing, in three to five steps.
- **A guide is on the site only once its film is made.** The list of guides is in
  `site/app/data/guides.ts`; a guide whose film is missing from `films.json` has no page and
  no card. Never a guide with a drawn picture or a "coming soon".
- **For search engines**: each page has its own title, description and sharing picture; the
  home page says it is an app, Help that it is a list of questions, a guide that it is a
  how-to. A page for a wrong address asks not to be listed. The list of pages
  (`sitemap.xml`) is written when the site is built, once the site's address is known.

Still open:
- Titles in Figtree on the site, in Literata in the app: keep the difference, or choose one.
- Seven of the eight stories have no picture yet (`scenarios/PORTRAITS.md`).
- The page is in English only, like the app.
- A light look, if one is wanted.
- The film of the chat was made on a screen that is not Retina: its pictures are 1120
  pixels wide, a little soft on a sharp screen. To film it again sharper: on a Retina screen.
- "It keeps the story straight" leaves two things out, after the chat of 7 October 2026 with
  the small model (ten lines, on Vivien's Mac; all of it is in `site/.film/notes/log.json`):
  - **The clothes are not on the page.** They did not change by themselves in ten replies,
    but a scarf put on in the story was never added to the note ("Sailor uniform, silver
    headphones" from the first reply to the last). To look at in the app, then to try again.
  - **The tags of the tastes are not shown** (the feature is, as beta). Two of five were
    right ("quiet moments", "rushed pace"); "soft light", "comforting scents" and "anxiety"
    came from the character's own words, and the user's jokes were not noticed.
  What held up: the place stayed at the school until the user walked into a bakery, then
  followed; the memory of the first 11 messages is faithful; the story note is right.
  Each of the two comes back with one word in `KeepsSection.vue`.
- The page does not show yet: the voice, the mood buttons when a character is created.
- The four guides are on the site. "A character from one sentence" and "Several characters
  in one scene" were filmed on Vivien's Mac with the small model (8 October 2026). In the
  first, the writing of the card (23 seconds) is shown in 8, and the page says so.
- In that film the character's first message starts with "Silas:": the model wrote
  `{{char}}:` in front of its greeting, and the app kept it. To look at in the app (take a
  leading `{{char}}:` off a greeting when a card is written), then to film again.
- The guide "Bring your SillyTavern characters" was filmed on Linux, like the first launch.
  Neither script has been run on a Mac.
- The answers of the Help page on online services come from the app's code: nobody has tried
  one with a real key yet.
- Before the site goes online: its address in `site/app/app.config.ts` (without it there is
  no `sitemap.xml` and no sharing picture), the download addresses, the legal pages, and a
  look at the films in Safari.
- **What the app needs has been seen on one computer only**: Vivien's Mac, with an Apple
  chip and the small model. Never tried: a Mac with 8 GB, a PC with a graphics card, a PC
  without one. The site says so in Help ("Do I need a graphics card?"). After a try on a
  real PC with 8 GB and no graphics card, the page can say more, in one direction or the
  other.
