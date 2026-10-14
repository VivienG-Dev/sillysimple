<script setup lang="ts">
import { Compass, Sparkles } from '@lucide/vue'
import wordmark from '@/assets/brand/wordmark.png'
import type { CardCreator } from '@shared/types'

// Help: the tour again, the app's few special words in plain language, and what to do
// when something goes wrong. Written for someone who has never used an app like this one.

const router = useRouter()
const settingsStore = useSettingsStore()

/** Which version this is: what someone is asked first when they report a problem. */
const version = __APP_VERSION__

const intro = ref<{ play: () => void } | null>(null)

// A newer version: looked for by itself (Settings › Data & Privacy), or here by hand.
const updates = useUpdatesStore()
const checking = computed(() => updates.status.state === 'checking')
const updateLine = computed(() => {
  const now = updates.status
  switch (now.state) {
    case 'unavailable':
      return ''
    case 'idle':
      return now.checkedAt ? 'This is the latest version.' : ''
    case 'checking':
      return 'Looking for a new version…'
    case 'available':
      return `Version ${now.version} is out.`
    case 'downloading':
      return `Downloading version ${now.version}… ${now.percent}%`
    case 'ready':
      return `Version ${now.version} is ready: restart the app to use it.`
    case 'error':
      return now.message
  }
})

// The characters that come with the app, credited to the people who wrote them: some are
// shared by their authors on the promise that they always are. Read from the cards
// themselves (their `creator`), so a new card is credited here as soon as it is added.
const { partnerOf } = useAuthors()
const credits = ref<{ creator: CardCreator; characters: string[] }[]>([])
onMounted(async () => {
  const scenarios = await window.api.scenarios.list().catch(() => [])
  const byCreator = new Map<string, { creator: CardCreator; characters: string[] }>()
  for (const scenario of scenarios) {
    if (!scenario.creator) continue
    const key = scenario.creator.name.toLowerCase()
    const entry = byCreator.get(key) ?? { creator: scenario.creator, characters: [] }
    if (!entry.creator.link && scenario.creator.link) entry.creator = scenario.creator
    entry.characters.push(scenario.name)
    byCreator.set(key, entry)
  }
  credits.value = [...byCreator.values()].sort((a, b) => a.creator.name.localeCompare(b.creator.name))
})

/** The tour starts by itself on the chat screen when it has not been seen. */
async function showTour(): Promise<void> {
  await settingsStore.update({ tourDone: false })
  await router.push('/')
}

const words = [
  {
    word: 'Character',
    meaning:
      'Who you talk to: a name, a personality, a way of speaking, and the first thing they say. You can write one yourself, have one written from a sentence, or import one.',
  },
  {
    word: 'Character card',
    meaning:
      'A character saved as a file, most often a picture (PNG) with the character hidden inside. People share them online. Drop one into the Library and the character is yours. Cards made for SillyTavern work here.',
  },
  {
    word: 'Persona',
    meaning:
      'Who you are in the story: your name, and a few words the character should know about you. You can have several and switch between them.',
  },
  {
    word: 'Model',
    meaning:
      'The program that writes the replies. It runs on your computer (SillySimple downloads one for you in Settings › Connection, or uses LM Studio) or at an online service. A larger model writes better, more slowly, and needs more memory.',
  },
  {
    word: 'Greeting',
    meaning:
      "The character's first message, which opens every new chat. A character can have several: the arrows under the first message switch between them.",
  },
  {
    word: 'Version',
    meaning:
      'Another try at the same reply. The arrows under the last reply write a new one and keep the old ones, so you can go back.',
  },
  {
    word: 'Directing the scene',
    meaning:
      'The buttons above the message box move the story along without you writing it. "More…" lets the character carry on by itself. "Something happens", "Somewhere else" and "Later…" tell the next reply where to go, and you can still write a message to send along.',
  },
  {
    word: 'OOC',
    meaning:
      'Out of character: a word to the AI itself, outside the story, in brackets. "(OOC: write longer replies)" or "(OOC: describe the room first)". The OOC button above the message box writes the brackets for you. It works for a moment; for good, use Reply length or the system prompt.',
  },
  {
    word: 'Context',
    meaning:
      'How much the model can read at once, counted in tokens (pieces of words). The bar under the message box shows how full it is.',
  },
  {
    word: 'Memory',
    meaning:
      'When a chat grows longer than the context, its oldest messages are summed up so the character does not forget them. You can read and correct that summary in the Memory tab.',
  },
  {
    word: 'Tastes',
    meaning:
      'Short tags about how you like to play ("slow burn", "short replies"), which the app can learn from your chats and tell every character about. It is a beta option, off until you turn it on in Settings › Adapts to you, where you see every tag and can take any of them out.',
  },
  {
    word: 'Lorebook',
    meaning:
      "Notes about the character's world: places, people, rules. Each note is only given to the model when the chat mentions it, so a big world does not fill the context.",
  },
  {
    word: 'System prompt',
    meaning:
      'The standing instructions given to the model before every chat, such as "stay in character". The one that comes with the app works: you never have to touch it.',
  },
]

const troubles = [
  {
    question: 'A reply stops in the middle of a sentence',
    answer:
      'It ran into the length limit. Press Continue under the message to get the rest, or make replies longer with Reply length, in the right panel.',
  },
  {
    question: 'The character forgot something',
    answer:
      'Open the Memory tab in the right panel: it shows what is kept of the older messages. Add what is missing, in a sentence. For things that must never be forgotten, write them in your Persona or in the character.',
  },
  {
    question: 'Replies are slow',
    answer:
      'With a model on your computer, speed depends on the computer and on the size of the model. Shorter replies come sooner; a smaller model is faster; an online service is usually the fastest.',
  },
  {
    question: 'The character speaks for me',
    answer:
      'Edit the reply and cut that part, or write another version with the arrows. Models copy what they see: a first message that never speaks for you sets the tone.',
  },
  {
    question: 'Nothing happens when I send a message',
    answer:
      'The dot at the bottom left says whether the app reaches the model. If it is not green, open Settings › Connection: no model may be downloaded yet, or the server you chose (LM Studio…) may not be running.',
  },
]
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Help</h1>
      <p>What is where, and what the words mean.</p>
    </header>

    <section class="card tour">
      <div class="tour-text">
        <span class="card-title">The tour</span>
        <span class="hint">Six short steps around the chat screen. It takes a minute.</span>
      </div>
      <button type="button" class="btn" @click="showTour"><Compass :size="14" :stroke-width="2" />Show the tour</button>
    </section>

    <!-- The first launch again, with its guide. It only writes what is confirmed on its way. -->
    <section class="card tour">
      <div class="tour-text">
        <span class="card-title">The welcome</span>
        <span class="hint">The three steps of the first launch. Nothing is erased: your characters and your chats stay as they are.</span>
      </div>
      <RouterLink to="/onboarding" class="btn"><Sparkles :size="14" :stroke-width="2" />See the welcome again</RouterLink>
    </section>

    <section class="card">
      <h2 class="card-title">In plain words</h2>
      <dl>
        <div v-for="item in words" :key="item.word" class="entry">
          <dt>{{ item.word }}</dt>
          <dd>{{ item.meaning }}</dd>
        </div>
      </dl>
    </section>

    <section class="card">
      <h2 class="card-title">When something goes wrong</h2>
      <dl>
        <div v-for="item in troubles" :key="item.question" class="entry trouble">
          <dt>{{ item.question }}</dt>
          <dd>{{ item.answer }}</dd>
        </div>
      </dl>
      <p class="hint">
        What the app keeps and what leaves this computer is in
        <RouterLink to="/settings/data">Data &amp; Privacy</RouterLink>.
      </p>
    </section>

    <section v-if="credits.length" class="card">
      <h2 class="card-title">Credits</h2>
      <p class="hint">The characters that come with the app were written by these people. Thank you to them.</p>
      <dl>
        <div v-for="item in credits" :key="item.creator.name" class="entry">
          <dt>
            <RouterLink v-if="partnerOf(item.creator.name)" :to="`/authors/${partnerOf(item.creator.name)?.id}`">{{
              item.creator.name
            }}</RouterLink>
            <a v-else-if="item.creator.link" :href="item.creator.link" target="_blank" rel="noreferrer">{{ item.creator.name }}</a>
            <template v-else>{{ item.creator.name }}</template>
          </dt>
          <dd>{{ item.characters.join(', ') }}</dd>
        </div>
      </dl>
    </section>

    <footer class="about">
      <!-- The logo plays its first-launch entrance again when it is clicked. -->
      <button class="logo" type="button" aria-label="SillySimple. Play the logo's entrance." @click="intro?.play()">
        <LogoIntro ref="intro" :size="40" />
        <img :src="wordmark" alt="" height="40" draggable="false" />
      </button>
      <span class="version">Version {{ version }}</span>
      <div v-if="updates.status.state !== 'unavailable'" class="update-line">
        <span v-if="updateLine" :class="{ problem: updates.status.state === 'error' }" role="status">{{ updateLine }}</span>
        <button v-if="updates.status.state === 'available' || (updates.status.state === 'error' && updates.version)" type="button" class="btn btn-small" @click="updates.download()">
          Download
        </button>
        <button v-else-if="updates.status.state === 'ready'" type="button" class="btn btn-small btn-primary" @click="updates.install()">
          Restart to update
        </button>
        <button v-else-if="updates.status.state !== 'downloading'" type="button" class="btn btn-small" :disabled="checking" @click="updates.check()">
          Check for updates
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
h1 {
  font-size: 26px;
}
header p {
  color: var(--text-dim);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
}
.card-title {
  font-size: 14px;
  font-weight: 700;
}
.hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}
.hint a {
  font-weight: 600;
}

.tour {
  flex-direction: row;
  align-items: center;
  gap: 16px;
}
.tour-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tour .btn {
  gap: 7px;
}

dl {
  display: flex;
  flex-direction: column;
  margin: 0;
}
/* The word on the left, what it means on the right; one thin line between entries. */
.entry {
  display: grid;
  grid-template-columns: 132px 1fr;
  gap: 16px;
  padding: 11px 0;
  border-top: 1px solid var(--border);
}
.entry:first-child {
  padding-top: 0;
  border-top: none;
}
.entry:last-child {
  padding-bottom: 0;
}
.entry.trouble {
  grid-template-columns: 200px 1fr;
}
dt {
  font-weight: 600;
}
dd {
  margin: 0;
  line-height: 1.55;
  color: var(--text-muted);
}
.about {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 0 6px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  /* No growing on hover: the entrance lands its icon where this one sits at rest. */
  transition: background 0.15s;
}
.logo:hover {
  background: var(--bg-button);
}
.logo img {
  height: 40px;
  width: auto;
}
.version {
  font-size: 12px;
  color: var(--text-faint);
  user-select: text;
}
.update-line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.update-line .problem {
  color: var(--danger-text);
}
</style>
