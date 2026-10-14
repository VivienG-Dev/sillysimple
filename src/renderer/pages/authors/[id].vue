<script setup lang="ts">
import { ArrowLeft, ExternalLink, MessageCircle, Play } from '@lucide/vue'
import { applyMacros } from '@core/prompt/macros'
import type { Scenario } from '@shared/types'

// A partner's page: who they are, where to find them, and the characters of theirs that
// come with the app. Reached from "by …" wherever one of those characters is shown, and
// from Settings › Help › Credits. Written in scenarios/authors/authors.json.

const route = useRoute('/authors/[id]')
const router = useRouter()
const charactersStore = useCharactersStore()
const settingsStore = useSettingsStore()
const { authors } = useAuthors()

const author = computed(() => authors.value.find((item) => item.id === route.params.id) ?? null)

const scenarios = ref<Scenario[]>([])
onMounted(async () => {
  scenarios.value = await window.api.scenarios.list().catch(() => [])
})
const theirs = computed(() => scenarios.value.filter((scenario) => author.value?.scenarioIds.includes(scenario.id)))

/** Already one of the user's characters: "Chat" opens it, rather than adding it again. */
const owned = computed(() => new Set(charactersStore.characters.map((character) => character.id)))

function pitchOf(scenario: Scenario): string {
  return applyMacros(scenario.pitch, { char: scenario.name, user: settingsStore.persona.name })
}

const starting = ref('')
const problem = ref('')

async function play(scenario: Scenario): Promise<void> {
  if (starting.value) return
  starting.value = scenario.id
  problem.value = ''
  try {
    const character = owned.value.has(scenario.id) ? null : await window.api.scenarios.play(scenario.id)
    if (character) await charactersStore.load()
    charactersStore.select(character?.id ?? scenario.id)
    await router.push('/')
  } catch {
    problem.value = `${scenario.name} could not be added to your characters.`
  } finally {
    starting.value = ''
  }
}

function back(): void {
  if (window.history.state?.back) router.back()
  else void router.push('/library')
}
</script>

<template>
  <div class="screen">
    <header class="header drag">
      <button type="button" class="btn btn-ghost btn-small no-drag" @click="back">
        <ArrowLeft :size="14" :stroke-width="2" />Back
      </button>
    </header>

    <main class="content">
      <template v-if="author">
        <!-- Their banner, when they have one: their picture sits on its lower edge, as on their profiles. -->
        <div v-if="author.bannerUrl" class="banner">
          <img :src="author.bannerUrl" alt="" draggable="false" />
        </div>
        <section class="who" :class="{ 'under-banner': author.bannerUrl }">
          <CharacterAvatar class="avatar" :name="author.name" :src="author.pictureUrl" :size="96" round />
          <div class="who-text">
            <span class="eyebrow">Partner author</span>
            <h1 class="title-serif">{{ author.name }}</h1>
            <p v-if="author.about" class="about">{{ author.about }}</p>
            <div v-if="author.links.length" class="links">
              <!-- Opened in the browser (see setWindowOpenHandler in src/main/index.ts). -->
              <a v-for="link in author.links" :key="link.url" :href="link.url" target="_blank" rel="noreferrer" class="btn btn-small" :title="link.url">
                {{ link.label }}<ExternalLink :size="12" :stroke-width="2" />
              </a>
            </div>
          </div>
        </section>

        <p class="thanks">
          {{ author.name }} lets SillySimple come with {{ theirs.length === 1 ? 'a character' : 'characters' }} they wrote.
          Thank you to them.
        </p>

        <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

        <section v-if="theirs.length" class="theirs" aria-labelledby="theirs-title">
          <h2 id="theirs-title">{{ theirs.length === 1 ? 'Their character' : 'Their characters' }}</h2>
          <div class="grid">
            <article v-for="scenario in theirs" :key="scenario.id" class="scenario">
              <span
                class="picture title-serif"
                :style="{ background: avatarColors(scenario.name).portraitBg, color: avatarColors(scenario.name).portraitFg }"
              >
                <img v-if="scenario.pictureUrl" :src="scenario.pictureUrl" alt="" draggable="false" />
                <template v-else>{{ initials(scenario.name) }}</template>
              </span>
              <div class="body">
                <h3>{{ scenario.name }}</h3>
                <p v-if="scenario.tagline" class="tagline">{{ scenario.tagline }}</p>
                <p class="pitch">{{ pitchOf(scenario) }}</p>
                <div class="foot">
                  <button type="button" class="btn btn-primary" :disabled="starting === scenario.id" @click="play(scenario)">
                    <template v-if="owned.has(scenario.id)"><MessageCircle :size="14" :stroke-width="2" />Chat</template>
                    <template v-else><Play :size="14" :stroke-width="2" />Play</template>
                  </button>
                  <span v-if="scenario.greetings > 1" class="openings">{{ scenario.greetings }} ways to begin</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>

      <p v-else-if="authors.length" class="missing">This author is not among the app's partners.</p>
    </main>
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.header {
  height: var(--titlebar-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  /* On macOS the three window buttons sit at the left of this bar: Back leaves them some room. */
  padding: 0 16px 0 calc(var(--window-controls-left) + 16px);
  border-bottom: 1px solid var(--border);
}
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 32px;
  overflow-y: auto;
}
.content > * {
  flex-shrink: 0;
}

.banner {
  height: clamp(140px, 22vw, 240px);
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: var(--bg-card);
}
.banner img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
}

.who {
  display: flex;
  align-items: flex-start;
  gap: 22px;
}
/* Under a banner, the picture overlaps its lower edge, ringed in the page's colour. */
.who.under-banner {
  margin-top: -70px;
  padding-left: 24px;
}
.who.under-banner .avatar {
  flex-shrink: 0;
  box-shadow: 0 0 0 5px var(--bg-app);
  border-radius: 50%;
}
.who.under-banner .who-text {
  padding-top: 76px;
}
.who-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-text);
}
h1 {
  font-size: 30px;
}
.about {
  max-width: 62ch;
  line-height: 1.6;
  color: var(--text-muted);
  white-space: pre-line;
  user-select: text;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.links a {
  text-decoration: none;
}

.thanks {
  color: var(--text-dim);
}
.problem {
  color: var(--danger-text);
}
.missing {
  color: var(--text-dim);
}

.theirs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h2 {
  font-size: 15px;
  font-weight: 700;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}
.scenario {
  display: flex;
  min-height: 255px;
  background: var(--bg-card);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-xl);
  overflow: hidden;
}
.picture {
  position: relative;
  flex: 0 0 170px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
}
.picture img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
}
h3 {
  font-size: 16px;
}
.tagline {
  font-size: 12px;
  color: var(--text-dim);
}
.pitch {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  color: var(--text-muted);
}
.foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.openings {
  font-size: 12px;
  color: var(--text-dim);
}
</style>
