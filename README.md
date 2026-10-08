# SillySimple

A simple desktop app for AI roleplay chat, with local models or an online service. A friendlier
alternative to SillyTavern: no terminal, a clean interface, and compatibility with its character cards.

Built with Electron, Vue 3 and Vite. Free software, under the GNU General Public License: see
[Licence](#licence) at the end.

## Commands

```bash
pnpm install     # once (also downloads the Electron binary, see below)
pnpm dev         # run the app with hot reload
pnpm typecheck   # check types (run `pnpm dev` or `pnpm build` once first, see below)
pnpm test        # unit tests (src/core, and the storage code in src/main)
pnpm mood:lab    # by hand, with a real Ollama: how well moods are read (see lab/mood)
pnpm mood:replay # the same report again from the vectors kept by mood:lab, without a model
pnpm scene:lab   # by hand, with a real Ollama: how well the place and the clothes are read (see lab/scene)
pnpm scene:replay # the same report again from the answers kept by scene:lab, without a model
pnpm build       # production build into out/
pnpm dist        # check, build and package the installer for this system into dist/
pnpm dist:all    # the same for macOS, Windows and Linux at once, from a Mac
```

Requires Node 22.12 or newer. To chat you need one of:

- nothing: "On this Mac" downloads a model and what runs it (see "The model on this computer" below),
- [Ollama](https://ollama.com) running: the app uses it instead of its own,
- any server that speaks the OpenAI chat API (LM Studio, KoboldCpp, llama.cpp),
- an API key for OpenRouter, Claude, OpenAI or Mistral.

## How the code is organised

An Electron app has two halves that cannot call each other directly. Compared to a Nuxt project:
the **renderer** is the `app/` folder, the **main process** is the `server/` folder, and the
**preload** script is the HTTP layer between them.

```
src/
  shared/      Types and constants used by both halves. No logic.
  core/        The app's logic in plain TypeScript: prompts, model providers, card formats.
               No Electron, no Vue, so it is unit-tested on its own.
  main/        The Node side: window, storage (settings, card files, chat database, API keys),
               and the handlers that call core/.
  preload/     Exposes a fixed list of functions to the UI as `window.api`.
  renderer/    The Vue app, organised like Nuxt:
    pages/         file-based routes (pages/library.vue -> /library)
    components/    usable in templates without importing them
    composables/   auto-imported
    stores/        Pinia stores, auto-imported
    utils/         auto-imported
    assets/css/    tokens.css (design tokens) and base.css
```

### Where the user's data lives

Everything is in the app's data folder: `~/Library/Application Support/SillySimple` on macOS,
`%APPDATA%\SillySimple` on Windows.

```
engine/          the app's own Ollama, once downloaded (not the user's data: backups leave it out)
settings.json    connection, generation settings, personas
characters/      one card file per character (.png or .json, SillyTavern format).
                 The folder is the library: a card copied here by hand shows up at next launch.
chats.db         every conversation, in SQLite (Node's built-in `node:sqlite`, no native module)
keys.json        API keys of online services, encrypted by the operating system
```

### Ready-to-play scenarios

The `scenarios/` folder at the root of the project holds the characters the app comes with:
ordinary card files, named `lowercase-words.png` (or `.json`, for one that has no picture yet).
The app writes no character of its own into the user's folder: the last step of the first launch
offers these, and the Library shows those the user does not have yet under "Ready to play". "Play" copies the card into the user's `characters/`
folder under the same name, which is how the app knows it was taken (`adoptCard` in
`src/main/characters.ts`); from then on it is the user's own character, and the scenario file is
never changed. To add a scenario, drop a card file in `scenarios/`: nothing else to declare
(`src/main/scenarios.ts`; a test checks every file there is a complete card). The folder is read
from the project in development and from the app's resources once packaged
(`extraResources` in `electron-builder.yml`). `scenarios/PORTRAITS.md` describes the pictures still to
be made; it is not shipped.

**Settings > Data & Privacy** shows this folder and what it holds, and works on it
(`src/main/userData.ts`, which knows nothing of Electron and is tested with plain folders):

- **Backup**: one ordinary `.zip` with `backup.json` (what it holds), `settings.json`, a tidy
  copy of `chats.db` and `characters/`. Never the keys. `src/main/zip.ts` writes and reads the
  archive without a dependency.
- **Restore**: the backup is taken apart and checked in a staging folder first, then put in place
  of the current data (with a way back if that fails), and the page is loaded again.
- **Delete all chats** and **Erase everything** remove for good; the database is rewritten
  afterwards so that deleted text does not linger in the file.

A character's id is its file name without the extension; chats are attached to that id. Renaming
a character in the app does not rename its file, so it keeps its chats.

A new character can be **written by the model from one sentence** ("Describe your character" at
the top of the editor): see `src/core/cards/writeCard.ts`, and `src/core/cards/moods.ts` for the
mood pills (three strengths each, a sentence per strength added to the request; no idea at all
means "Surprise me"). The model answers in plain text cut
into sections by headings, which is read while it is still being written, so the editor's fields
fill in live. Nothing is saved until the user creates the character.

A card file is only rewritten when the user edits the character in the app (`updateCharacter` in
`src/main/characters.ts`). Only the fields of the editor change: the lorebook, the creator's notes
and whatever other apps stored in the card are written back as they were, and a PNG keeps its
picture byte for byte. The lorebook is only rewritten if its entries were changed in the editor,
and then each entry keeps the settings the editor does not show. So a card edited here still works in SillyTavern.

The heart that marks a **favourite** is written in the card too, where SillyTavern keeps it
(`data.extensions.fav`): `setFavorite` changes that mark and nothing else.

To change the database layout, add a new entry at the end of `MIGRATIONS` in
`src/main/chatDatabase.ts`. Never edit an entry that has already run on someone's computer.

Deleting a character moves its card file to the system trash and removes its chats from the
database. Deleting a chat removes it for good. Deleting a message removes it and every message
after it: the chat goes back to that point.

The user can have several **personas** (`personas` in `settings.json`); one is in use at a time.
A message the user writes keeps the name of the persona it was written as (`messages.author`),
so an old chat still shows who the user was then.

### How a chat is sent to the model

`src/main/ipc.ts` (`chatStart`) builds the request in three steps, all in `src/core/prompt/`:

1. `buildMessages` writes one system message (system prompt, character sheet, persona) followed
   by the chat history, with the `{{char}}` / `{{user}}` macros replaced. What a card brings
   beyond its description is used here:
   - its own **system prompt** replaces the app's (`{{original}}` in it stands for the app's);
     the setting "Follow the instructions written into character cards" turns this off;
   - its **post-history instructions** are appended to the user's last message. They are not
     sent as a separate system message, which many local models refuse in the middle of a chat;
   - its **lorebook** (`lorebook.ts`): an entry joins the system message while one of its keys
     appears in the last few messages. Entries may take up to a quarter of the context.
2. `fitToContext` drops the oldest messages when the whole thing would not fit in the model's
   context. The system message and the newest message are always kept. Sizes are estimated
   (about 3.3 characters per token), with a 5% margin, because the exact count depends on the model.
3. The provider streams the reply back.

The **context size** is read from the model server when the setting is "Automatic"
(`src/core/providers/contextLength.ts`): what the model is *loaded with*, not what it was trained
for. Ollama, LM Studio, llama.cpp and KoboldCpp each say it in their own way; online services say
it in their list of models. It is capped at 32,768 tokens (`AUTO_CONTEXT_LIMIT`), and when a
server does not say, the size set by hand is used (8192 by default). Ollama only knows once the
model is in memory, so the first message of a session loads it before reading the value.

**The character's mood** shows on its picture as a small manga-style symbol after a reply
(`components/MoodEmote.vue`). The mood is read from the words of the reply with word lists, in
English and French (`src/core/mood/detectMood.ts`): no request to the model, and no symbol when
the text gives no clear sign.

Where the app's own embedding model runs (EmbeddingGemma 2, `senseModel` in
`src/core/engine/models.ts`: replies coming from this computer, on any system),
the mood is also read from what the reply means, where the word lists are silent
(`src/core/mood/senseMood.ts` for the arithmetic, `src/main/sense.ts` for the model: the app
downloads it by itself, quietly, and falls back to the words whenever it cannot be used). It
picks the file by itself: the compressed one (`270m-nvfp4-text`, 378 MB) on a Mac with an Apple
chip, which runs on Ollama's MLX engine, and the plain one (`270m-bf16-text`, 574 MB) everywhere
else, which runs on Ollama's usual engine. Ollama's short tags (`270m`, `latest`) are the MLX
files: always write the full tag. A
telling word still wins, unless the meaning finds no trace of that mood in what the character
does or says (it was the user's). The page asks the main process (`window.api.mood.read`), and
only plays a mood that differs from the one of the reply before (`isNews` in
`components/CharacterPanel.vue`): a symbol at every reply is too much. The sentences
that stand for each mood (`ANCHORS`) and the two thresholds (`ENOUGH`, `LEAD`) were set on a
trial with the real model, and are tried again with `pnpm mood:lab`, which needs a real Ollama:
it reads the labelled replies of `lab/mood/replies.ts` the three ways (words, meaning, both) and
writes `lab/out/mood-report.md` and every vector to `lab/out/mood-vectors.json`. After changing
a threshold, `pnpm mood:replay` writes the report again from those vectors, without the model.
`lab/` is not part of the app and is not packaged.

**A guided tour** of the chat screen runs once after the first launch (`useTour()`,
`components/AppTour.vue`; `settings.tourDone`), and Settings > Help explains the app's few special
words in plain language.

**The colours follow the character**: the accent and the dark surfaces turn towards the main
colour of the picture of the character on screen, see `src/core/color/accent.ts`. Only the hue
changes: every colour of `tokens.css` keeps its exact brightness, so the design and its
contrasts stay the same.

**Where the scene is, what the character wears**: models change a scene without warning (the
kitchen, then the sofa; a skirt, then trousers). With "Keep the place and the clothes" on
(Settings > Generation, on by default), every reply ends on a note in brackets saying where the
scene is and what the character has on (`steadyNote` in `src/core/prompt/place.ts`, added by
`buildMessages` to the last message of the conversation, not to the instructions at the top). The
place stays until the user moves; the clothes stay until the story changes them. Both are kept
with the chat (the place in `chats.place`; the clothes of each character in `chats.outfits`), each
with what it was before the last reply, which is what another version of that reply is told. After
each reply the main process asks the chat model one short question about both (`noteScene` in
`src/main/ipc.ts`): apart from the conversation, with the last four messages and what was known
(`sceneFromLines`), which is how a small model reads a scene best. A server on this computer
that may hold one conversation in memory and no more (LM Studio, an Ollama older than 0.40) is
asked in the conversation the reply was written in (`sceneAfter`), so that the next reply does
not read everything again: see `asksApart`. The user reads and corrects both in the Memory tab
of the chat, or writes them first. The terminal says it:
`[scene] … place "the kitchen"; Suzu wears "…"`, and `(told: …)` on the `[chat]` line.
How the question is asked and worded was settled by trials with the real model, and is tried
again with `pnpm scene:lab`: the chat model is asked about the scene endings of
`lab/scene/scenes.ts` in each of the ways of `lab/scene/ways.ts` (the app's own first), every
answer is written to `lab/out/scene-report.md`, and it measures whether a question asked apart
costs the next reply. `SCENE_LAB_MODEL=name` tries another model.

**Long memory**: when a chat outgrows the model's context, its oldest messages are not dropped
but summed up by the model, and that summary is sent in their place: see
`src/core/prompt/memory.ts`. The summary belongs to the chat (`chats.memory`, and
`chats.memory_count` for how many first messages it stands for); the user reads and edits it in
the Memory tab of the right panel.

**Advice on a character** that exists already is in `src/core/cards/reviewCard.ts`. `reviewCard`
is a handful of checks on what a card holds (no opening message, a thin description, no
lorebook notes…): no model is asked, so the advice shows at once at the top of the editor
(`CardAdvice.vue`) and follows what is typed. Most pieces of advice have a button:
`improveRequest` then has the model write that one part of the card, given the card as it is,
in the same headed format as a whole card. The result goes into the editor's fields, can be
undone, and is only saved when the user saves. When a character's greetings change, the chats
nothing was said in yet are given the new ones (`refreshGreeting` in the chat database).

The **chat background** (Settings › Appearance) is painted by `ChatBackdrop.vue`, behind
everything in the chat column: the character's picture, blurred, or one picture of the user's
own. That picture is kept as `background.webp` in the data folder (the page turns whatever file
was picked into a WebP of a sensible size; `card://background/<version>` shows it) and travels
with backups. While a backdrop is shown, the chat page sets a few CSS variables
(`--message-bg`…) that give messages, the header and the message box a panel, so text is never
read straight off a picture.

**Adapts to you** (beta, both options off by default): see `src/core/prompt/notice.ts`. With
"Learn my tastes" on, the app keeps short tags about how the user likes to play (in the
settings: `adapt.likes`, `adapt.dislikes`, and `adapt.removed` for the tags the user took out)
and tells every character about them. With "Follow where each story is heading" on, each chat
keeps a short note (`chats.story_note`), shown in the Memory tab. Both are written by the
model, in the background: about every 8 messages of the user, a moment after a reply, the main
process sends it the messages written since the last time (`notice` in `src/main/ipc.ts`). That
request is stopped as soon as anything else is asked of the model, and tried again after the
next reply, so the user never waits for it. The model only proposes new tags; the user removes
and adds them, and what is added is announced in the chat. "Describe your character" has a
"Use my tastes" box (`adapt.inCards`) that gives the tags to the model writing a new card,
after the idea, which always comes first.

**Reply length** is a length the model is asked to aim for, not only a limit: see
`src/core/prompt/replyLength.ts`. The setting is told to the model in words at the end of the
system message, and the limit sent to the server is 1.5 times higher, so a reply can end on its
own. A reply that still runs into the limit (`finish_reason: "length"`) is marked `cut` and gets
a "Continue" button, which has the model write the rest in the same message.

The row of buttons above the message box **directs the scene** without a message: see
`src/core/prompt/direction.ts`. "More…" asks for a reply with nothing new from the user (the
character goes on by itself); "Something happens", "Somewhere else" and "Later…" give the next
reply a stage direction. Neither is saved as a message. The model gets a note in brackets: at
the end of the user's last message, or as a `user` message of its own when the character spoke
last, since a model needs something to answer. Messages in a row from the same side are sent as
one, so turns still alternate. The reply remembers its direction (`messages.direction`), so
that another version of it follows the same one, and shows it as a small tag. For "Something
happens" the app draws two kinds of thing that may happen (`EVENTS`, `pickEvents`: never those of
the time before in a chat) and the model takes the one that fits the scene: given a list of
examples, a model takes the first one every time, and a kind imposed blindly may not fit. When
the user's tastes are known ("Adapts to you"), the event is asked to lean towards them.

A chat can hold **several characters** (up to four): see `src/core/prompt/scene.ts`. The model
still writes one reply at a time, as one of them, with that character's whole card. The others
are introduced in one line each, and the conversation is told from the speaker's side: its own
lines as `assistant`, everyone else's as `user` with the name of who said them. That keeps the
strict user / assistant alternation many local models insist on. A chat still belongs to one
character (the others are "guests" added to it), and each reply records who wrote it. On screen, the right panel shows whoever is speaking (`onStage` in the chat store).

A card's **alternate greetings** are not sent anywhere: when a chat is created they become
versions of its first message, picked with the same arrows as the versions of a reply.

A reply can have several versions ("swipes"). They are stored as a JSON list in the `swipes`
column of the message, and `content` always holds the version on screen, so everything that
reads a chat (the prompt, the context meter) can ignore that versions exist.

### The model on this computer

"On this Mac" is Ollama, and there is only ever one. `src/main/engine.ts` decides which:

- When the user runs an Ollama of their own (it answers at `127.0.0.1:11434`), the app uses it.
- Otherwise the app runs its own. It is not in the installer: the first download fetches it from
  Ollama's GitHub releases into `<data folder>/engine/<version>/`, checks it against a SHA-256
  written in the code, and starts it on a port of its own. It is stopped when the app quits.
- If the user opens their Ollama while the app's own runs, the app's own is stopped (once the
  reply or the download under way is over) and theirs takes over. Both keep their models in
  Ollama's usual folder, so a model downloaded through one is there for the other.

`targetOf` in `src/main/ipc.ts` asks `engine.baseUrl()` for the address each time, so the chat,
the memory and everything else that calls a model never know which one answers.

- `src/core/engine/release.ts`: the version of Ollama the app downloads, and the file, size and
  checksum for each kind of computer. To move to a newer Ollama, change the version and copy the
  lines of that release's `sha256sum.txt`.
- `src/core/engine/models.ts`: the three chat models the app offers (`BUILTIN_MODELS`), how much
  memory each needs, and the context the app's own Ollama loads them with. Every model that fits
  the computer is offered; the largest that fits is the recommended one. To change a model,
  change its line: nothing else names one.
- `src/core/providers/ollama.ts`: Ollama's own API (list, download with progress, remove).
- `src/renderer/components/LocalModels.vue` and `stores/engine.ts`: the list in the connection
  picker. The main process sends the whole status (`EngineStatus`) each time something changes.

`src/main/engine.test.ts` tries all of this for real, with `src/main/fixtures/fake-ollama.cjs`
standing in for the `ollama` program. That script also lets you run the app without a real
model: `OLLAMA_HOST=127.0.0.1:11434 node src/main/fixtures/fake-ollama.cjs serve`.

While developing, the terminal of `pnpm dev` prints a line starting with `engine:` at each step,
and what Ollama itself says goes to `<data folder>/engine/server.log`.

### Online services and API keys

Every service is reached through the same client (`src/core/providers/openaiCompatible.ts`): they
all accept the OpenAI chat format. What differs from one to the next is in one file,
`src/core/providers/dialects.ts`: the name of an option, how thinking is switched off, the shape
of the list of models. When a server refuses a request (HTTP 400 or 422), `adaptAfterRefusal`
reads the refusal, drops or renames the option it is about, and the request is sent again.

To add a service: add it to `CLOUD_PROVIDERS` in `src/shared/providers.ts` and to the
`CloudProviderId` type, then give it a `case` in `dialects.ts` if it has habits of its own.

API keys are handled by `src/main/keyStore.ts`. They are encrypted with Electron's `safeStorage`
(Keychain on macOS, DPAPI on Windows) and only ever read in the main process, to be put in a
request. The Vue app can save or remove a key and ask which ones exist; it cannot read one back.
For an online service, the address a key is sent to comes from `CLOUD_PROVIDERS`, never from the
page. For a server at an address the user typed, a key is tied to that address.

### Voice: replies read aloud

Off until the user picks a voice service in **Settings > Voice**. Two families, both in
`src/core/voice/engines.ts`: ElevenLabs (its own API: voices, models, usage, speech) and "a speech
server", anything that takes OpenAI's `POST /audio/speech` (OpenAI itself, or a voice program on
the user's computer). The service is called from the main process, where its key is; the page is
handed sound and plays it (`media-src blob:` in the page's security policy).

- `src/core/voice/speechText.ts` turns a message into what a voice should say (no asterisks, no
  quotes; optionally only what is said aloud) and cuts it into pieces, the first one short so the
  first sound comes quickly. Each piece is one request. `speechParts` cuts a message into what the
  character says and what a narrator tells, for reading with two voices.
- `src/renderer/stores/voice.ts` plays one thing at a time, fetches the next piece while one
  plays, and keeps what was spoken while the app runs: listening again costs nothing.
- The voice of everyone is in the settings (`voice.elevenlabsVoice`, `voice.serverVoice`); a
  character's own voice is in its card, under `extensions.sillysimple.voices`, one per service.
- Keys are saved apart from the chat keys (`voice:elevenlabs`, `voice:custom:<origin>`): a key
  typed for speech is never sent to a chat server.

To add a voice service: give it a branch in `engines.ts` (`checkVoiceService`, `synthesize`), a
name in the `VoiceService` type, and an option in `pages/settings/voice.vue`.

### The icon and the logo

Vivien made them. What comes from his two pictures:

| File | Size | Used for |
|---|---|---|
| `build/icon.png` | 1024 | The macOS app icon. It keeps the margin macOS icons have. |
| `build/icon-full.png` | 512 | The Windows and Linux app icon. It fills its square. |
| `resources/icon.png` | 512 | The Dock icon while developing on macOS (`pnpm dev`). |
| `resources/icon-full.png` | 256 | The window icon on Windows and Linux. |
| `src/renderer/assets/brand/shapes.ts` | | The icon as shapes, traced from the picture: tile, bubble, eyes, smile, colours. |
| `src/renderer/assets/brand/wordmark.png` | 775×220 | The word "SillySimple", next to the icon in Settings › Help. |

`electron-builder.yml` names the icon of each platform and makes the installers' own formats
(`.icns`, `.ico`) from the PNG files. `src/main/index.ts` imports the two `resources/` files
with `?asset`; they ship inside the app because `resources/**/*` is in `files`. The wordmark has
light letters: it only reads on a dark background. The version shown in Help is
`__APP_VERSION__`, which `electron.vite.config.ts` reads from `package.json`.

Inside the app the icon is not a picture: `AppIcon.vue` draws it from `shapes.ts`, so it is
sharp at any size and each piece can move. `AppMascot.vue` is that icon alive: its eyes follow
the pointer and turn to where the user clicks, it blinks, and it has four moods (`idle`,
`waiting` with its eyes on a progress bar, `happy`, `worried`). While it waits it passes the
time (a hop, a look at the user, a look around, a wiggle, a whistled tune) and jumps for joy at
each quarter of a download. It stands where the logo is shown (Settings › Help) and beside the
download of a model (`DownloadProgress.vue`). On the first launch it is the guide
(`MascotGuide.vue`): it hovers at the top of the screen and says what each step is about in a
speech bubble, written as it speaks. There, it is also the one that waits for the download: the
page provides `GUIDE` (`composables/useGuide.ts`), and the bar then comes without a mascot of its own. `LogoIntro.vue` is the icon with its entrance: a
cream liquid flies in, swirls into the bubble, the face comes, winks, and the tile bursts out
behind it; then the icon travels to its place in the page. It plays by itself once, at the
first launch (`auto`), and again when the logo of Settings › Help is clicked. A click, a key or
a resize ends it; it does not start by itself when the system asks for less motion. Everything
is timed with `element.animate()` from one start: to look at one moment of it, pause
`document.getAnimations()` and set their `currentTime`.

### The installers

`pnpm dist` makes the installer for the system it runs on; `pnpm dist:all`, from a Mac, makes
all of them (`scripts/dist.mjs`). It builds the app, checks the types and runs the tests
(`--quick` skips both), asks electron-builder for each system in turn, and lists what is in
`dist/`:

| File | For |
| --- | --- |
| `SillySimple-<version>-mac-arm64.dmg` | A Mac with an Apple chip |
| `SillySimple-<version>-mac-x64.dmg` | A Mac with an Intel chip |
| `SillySimple-<version>-win-x64.exe` | Windows 10 or 11: installs for the current user, no question asked |
| `SillySimple-<version>-linux-x86_64.AppImage` | Linux |
| `SHA256SUMS.txt`, `HOW-TO-OPEN.txt` | To send along: the fingerprints, and how to get past the system's warning |

The version is the one in `package.json`. The first run downloads Electron for each system
(about 110 MB each), kept in electron-builder's cache.

- **The Mac app is signed the best way the Mac it is built on allows** (`scripts/mac-signing.mjs`
  looks before anything is built, and `pnpm dist --check` only looks):
  - *notarized*: a "Developer ID Application" certificate is in the keychain, and credentials
    for Apple's notary are saved there under the name `SillySimple`. The app is signed, sent to
    Apple and stapled with its ticket: a downloaded copy opens like any app.
  - *signed*: the certificate without the credentials. macOS still blocks a downloaded copy.
  - *ad hoc*: no certificate. Signed by nobody (`electron-builder.adhoc.yml`), which keeps a Mac
    with an Apple chip from calling the app "damaged"; blocked all the same, and opened from
    System Settings › Privacy & Security › Open Anyway.

  To set it up, once, with an Apple Developer account: make the certificate (Xcode › Settings ›
  Accounts › the team › Manage Certificates › + › Developer ID Application; only the Account
  Holder can), make an app-specific password at account.apple.com, and save it with
  `xcrun notarytool store-credentials "SillySimple" --apple-id <email> --team-id <team>` (it
  asks for the password; nothing of it is kept in the project). `APPLE_ID` with
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or `APPLE_API_KEY` with its two companions,
  or `APPLE_KEYCHAIN_PROFILE`, given for one run, are used instead of the saved name.
  After building, the script asks macOS itself what it makes of each app (`codesign`,
  `stapler`, `spctl`) and says it; `HOW-TO-OPEN.txt` is written to match.
- **The Windows installer is not signed**: Windows shows "Windows protected your PC" (More info ›
  Run anyway). A code-signing certificate for Windows is another purchase, not looked into.
- **Where each can be made**: a `.dmg` only on a Mac. The Windows installer on Windows or on a
  Mac (there the packager reads the uninstaller out of the installer by itself); under Linux it
  needs Wine with 32-bit support. The AppImage anywhere.
- **Checked**: the AppImage is made and starts under Linux; the Windows installer is made under
  Linux with the packager told to work as it does on a Mac; the choice between the three ways of
  signing, with stand-ins for the Mac's tools. No installer was run on Windows, and nothing was
  made, signed or notarized on a Mac yet: the first `pnpm dist:all` on Vivien's Mac is the test.
- The app does not update itself: a new version is a new download (`publish: null`).

### Adding a feature that needs the main process

1. Describe the function in `src/shared/api.ts` and name its channel in `src/shared/ipc.ts`.
2. Write the logic in `src/core/`, with a test.
3. Add a handler in `src/main/ipc.ts`.
4. Forward the call in `src/preload/index.ts`.
5. Call `window.api.…` from a store.

### Things to know

- **Auto-imports**: `ref`, `computed`, `useRoute`, the stores, composables and utils need no import.
  Their types live in `src/renderer/types/*.d.ts`, regenerated by `pnpm dev` and `pnpm build`.
  After adding a new util or store, `pnpm typecheck` only sees it once one of those has run.
- **Sending data to the main process**: pass plain objects. Wrap reactive data in `toPlain()`.
- **Calls to the model happen in the main process**, not in the page. Node is not subject to
  CORS, so it works whatever the model server allows, and API keys never reach the page.
- **All packages are `devDependencies` on purpose.** Vite bundles everything the app needs into
  `out/`, so nothing from `node_modules` has to ship in the installer.
- **"Electron uninstall" when running `pnpm dev`** means the Electron binary is missing. Electron no
  longer downloads it during install, so the `postinstall` script does. Run `pnpm exec install-electron`
  to fetch it by hand.
- **TypeScript stays on 6.x** for now: `vue-tsc` does not run on TypeScript 7 yet.
- **Vite stays on 7.x** for now: `electron-vite` 5 does not support Vite 8 yet.

## Licence

Copyright (C) 2026 VivienG

SillySimple is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of
the License, or (at your option) any later version.

SillySimple is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See
the GNU General Public License for more details. Its full text is in [`LICENSE`](LICENSE).

In short: you may read this code, run it, change it and share it. If you share a changed
version, it stays open under the same licence, with its code.

What that licence does not cover:

- **The name and the icon.** The name "SillySimple", the icon and the wordmark (`build/`,
  `resources/`, `src/renderer/assets/brand/`, `site/app/assets/brand/`, `site/public/`) stay
  their author's. You may build and run the app as it is with them. A changed version that
  you give to others goes by another name, with another icon.
- **What comes from others**, each under its own licence: the fonts Figtree and Literata (SIL
  Open Font License), the Lucide icons (ISC), and the packages listed in `package.json`.
- **What the app downloads when it runs**: the engine (Ollama) and the models (Gemma, or any
  other the user picks) are not part of this code, and have their own terms.

SillySimple is an independent project. It reads SillyTavern character cards and is not
affiliated with SillyTavern.
