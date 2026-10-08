<script setup lang="ts">
import { Heart, Pencil, Play, Plus, Search, Trash2, Upload } from '@lucide/vue'
import { applyMacros } from '@core/prompt/macros'
import type { Character, ImportResult, Scenario } from '@shared/types'

// The library: every character as a card. Clicking one opens its chat.
// Cards are imported by dropping files anywhere on the page, or with the Import button.
// "New character" and the pencil on a card open the character editor.
// Above them, "Ready to play": the scenarios the app comes with that the user has not started yet.

const router = useRouter()
const charactersStore = useCharactersStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const { confirm } = useConfirm()
const characterEditor = useCharacterEditor()

const search = ref('')
/** Only the characters marked with a heart. */
const favoritesOnly = ref(false)
// With no favourite left, the filter would show an empty page with no way to see why.
watch(
  () => charactersStore.favorites.length,
  (count) => {
    if (count === 0) favoritesOnly.value = false
  },
)

const visibleCharacters = computed(() => {
  const query = search.value.trim().toLowerCase()
  const shown = favoritesOnly.value ? charactersStore.ordered.filter((character) => character.favorite) : charactersStore.ordered
  if (!query) return shown
  return shown.filter(
    (character) =>
      character.name.toLowerCase().includes(query) ||
      character.tags.some((tag) => tag.toLowerCase().includes(query)),
  )
})

// The top tabs are navigation: picking "Chats" goes back to the chat screen.
const sections = [
  { value: 'chats' as const, label: 'Chats' },
  { value: 'library' as const, label: 'Library' },
]
const section = computed({
  get: () => 'library' as 'chats' | 'library',
  set: (value) => {
    if (value === 'chats') void router.push('/')
  },
})

// Every card has the same size, whatever its picture and however many tags it carries
// (cards from chub.ai often come with thirty). The rest shows when the card is pointed at.
/** The tags a card shows at rest. */
const TAGS_AT_REST = 2
/** The most tags the card shows when pointed at: beyond that they would not fit on it. */
const TAGS_ON_HOVER = 8

function open(character: Character): void {
  charactersStore.select(character.id)
  void router.push('/')
}

// --- Ready to play -----------------------------------------------------------

const scenarios = ref<Scenario[]>([])
onMounted(async () => {
  // Without them the library is still whole: a failure here is not worth a message.
  scenarios.value = await window.api.scenarios.list().catch(() => [])
})

/** Those the user does not have yet. Once played, a scenario is one of their characters, under the same id. */
const readyToPlay = computed(() => {
  const owned = new Set(charactersStore.characters.map((character) => character.id))
  return scenarios.value.filter((scenario) => !owned.has(scenario.id))
})

// One row of them is shown, so that the user's own characters stay close: the rest is a click away.
const scenarioGrid = ref<HTMLElement | null>(null)
const columns = ref(1)
const showAll = ref(false)
let gridWatcher: ResizeObserver | null = null
watch(scenarioGrid, (grid) => {
  gridWatcher?.disconnect()
  if (!grid) return
  // The grid says itself how many cards fit side by side at this width.
  const count = (): void => {
    columns.value = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  }
  count()
  gridWatcher = new ResizeObserver(count)
  gridWatcher.observe(grid)
})
onBeforeUnmount(() => gridWatcher?.disconnect())

const shownScenarios = computed(() => (showAll.value ? readyToPlay.value : readyToPlay.value.slice(0, columns.value)))

/** The pitch as the user will live it: with the character's name and their own. */
function pitchOf(scenario: Scenario): string {
  return applyMacros(scenario.pitch, { char: scenario.name, user: settingsStore.persona.name })
}

/** The scenario being added, so that a second click does nothing. */
const starting = ref('')

async function play(scenario: Scenario): Promise<void> {
  if (starting.value) return
  starting.value = scenario.id
  try {
    problem.value = ''
    const character = await window.api.scenarios.play(scenario.id)
    await charactersStore.load()
    open(character)
  } catch {
    problem.value = `${scenario.name} could not be added to your characters.`
  } finally {
    starting.value = ''
  }
}

// --- Delete ------------------------------------------------------------------

const problem = ref('')

async function remove(character: Character): Promise<void> {
  const chats = await window.api.chats.list(character.id)
  const used = chats.filter((chat) => chat.messageCount > 1).length
  const fate =
    used === 0
      ? 'You have no chats with this character.'
      : `Your ${used === 1 ? 'chat' : `${used} chats`} with this character will be gone for good.`

  const confirmed = await confirm({
    title: `Delete ${character.name}?`,
    message: `The card file moves to the ${trashName()}, where you can still get it back. ${fate}`,
    confirmLabel: 'Delete character',
  })
  if (!confirmed) return

  try {
    problem.value = ''
    await charactersStore.remove(character.id)
  } catch {
    problem.value = `${character.name} could not be moved to the ${trashName()}. Nothing was deleted.`
  }
}

// --- Import ------------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const lastImport = ref<ImportResult | null>(null)

async function importFiles(files: File[]): Promise<void> {
  if (files.length === 0 || importing.value) return
  importing.value = true
  try {
    lastImport.value = await charactersStore.importFiles(files)
  } finally {
    importing.value = false
  }
}

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  void importFiles([...(input.files ?? [])])
  input.value = '' // So picking the same file again triggers a new import.
}

// dragenter/dragleave also fire for every child element the pointer crosses,
// so entries are counted: the page is "dragged over" while the count is above zero.
const dragDepth = ref(0)
const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false

function onDragEnter(event: DragEvent): void {
  if (hasFiles(event)) dragDepth.value++
}
function onDragLeave(event: DragEvent): void {
  if (hasFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function onDrop(event: DragEvent): void {
  dragDepth.value = 0
  void importFiles([...(event.dataTransfer?.files ?? [])])
}
</script>

<template>
  <div class="screen">
    <header class="header drag">
      <SegmentedControl v-model="section" :options="sections" label="Sections" />
    </header>

    <main
      class="content"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div class="top">
        <div class="heading">
          <h1 class="title-serif">Your characters</h1>
          <span class="count">
            {{ charactersStore.characters.length }}
            {{ charactersStore.characters.length === 1 ? 'character' : 'characters' }} · stored on this
            {{ deviceName() }}
          </span>
        </div>
        <button type="button" class="btn" :disabled="importing" @click="fileInput?.click()">
          <Upload :size="14" :stroke-width="2" />Import cards
        </button>
        <button type="button" class="btn btn-primary" @click="characterEditor.open(null)">
          <Plus :size="14" :stroke-width="2" />New character
        </button>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept=".png,.json"
          multiple
          tabindex="-1"
          aria-hidden="true"
          @change="onFilesPicked"
        />
      </div>

      <p v-if="problem" class="import-report import-failure" role="alert">{{ problem }}</p>

      <div v-if="lastImport" class="import-report" role="status">
        <p v-if="lastImport.imported.length">
          Imported {{ lastImport.imported.map((character) => character.name).join(', ') }}.
        </p>
        <p v-for="failure in lastImport.failed" :key="failure.file" class="import-failure">
          <strong>{{ failure.file }}</strong> was not imported. {{ failure.error }}
        </p>
        <button type="button" class="dismiss" @click="lastImport = null">Dismiss</button>
      </div>

      <section v-if="readyToPlay.length > 0" class="ready" aria-labelledby="ready-title">
        <div class="ready-heading">
          <h2 id="ready-title">Ready to play</h2>
          <span class="count">Stories that come with the app. Pick one and start: it becomes yours to change.</span>
        </div>
        <div ref="scenarioGrid" class="scenarios">
          <article v-for="scenario in shownScenarios" :key="scenario.id" class="scenario">
            <span
              class="scenario-picture title-serif"
              :style="{
                background: avatarColors(scenario.name).portraitBg,
                color: avatarColors(scenario.name).portraitFg,
              }"
            >
              <img v-if="scenario.pictureUrl" :src="scenario.pictureUrl" alt="" draggable="false" />
              <template v-else>{{ initials(scenario.name) }}</template>
            </span>
            <div class="scenario-body">
              <h3 class="card-name">{{ scenario.name }}</h3>
              <p class="card-tagline">{{ scenario.tagline }}</p>
              <p class="scenario-pitch">{{ pitchOf(scenario) }}</p>
              <span class="card-tags">
                <span v-for="tag in scenario.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
              </span>
              <div class="scenario-foot">
                <button
                  type="button"
                  class="btn btn-primary btn-small"
                  :disabled="starting !== ''"
                  :aria-label="`Play ${scenario.name}`"
                  @click="play(scenario)"
                >
                  <Play :size="13" :stroke-width="2" fill="currentColor" />Play
                </button>
                <span v-if="scenario.greetings > 1" class="scenario-openings">{{ scenario.greetings }} ways to begin</span>
              </div>
            </div>
          </article>
        </div>
        <button
          v-if="readyToPlay.length > columns"
          type="button"
          class="dismiss"
          :aria-expanded="showAll"
          @click="showAll = !showAll"
        >
          {{ showAll ? 'Show fewer' : `Show all ${readyToPlay.length} stories` }}
        </button>
      </section>

      <div class="filters">
        <label class="search">
          <Search :size="14" :stroke-width="2" />
          <input v-model="search" type="text" placeholder="Search by name or tag" aria-label="Search library" />
        </label>
        <!-- Shown once a character has a heart: before that there is nothing to filter -->
        <button
          v-if="charactersStore.favorites.length > 0"
          type="button"
          class="btn btn-small favorites-filter"
          :class="{ on: favoritesOnly }"
          :aria-pressed="favoritesOnly"
          @click="favoritesOnly = !favoritesOnly"
        >
          <Heart :size="13" :stroke-width="2" :fill="favoritesOnly ? 'currentColor' : 'none'" />
          Favourites · {{ charactersStore.favorites.length }}
        </button>
      </div>

      <div class="grid">
        <!-- A drop zone that is also a button: clicking it opens the same file window as "Import cards". -->
        <button
          type="button"
          class="import"
          :class="{ dragging: dragDepth > 0 }"
          :disabled="importing"
          @click="fileInput?.click()"
        >
          <span class="import-icon"><Upload :size="20" :stroke-width="1.8" /></span>
          <span class="import-title">{{ dragDepth > 0 ? 'Drop to import' : 'Drop character cards here' }}</span>
          <span class="import-click">or click to choose files</span>
          <span class="import-text">PNG or JSON · SillyTavern, TavernAI and chub.ai cards, V2 &amp; V3</span>
        </button>

        <div v-for="character in visibleCharacters" :key="character.id" class="card">
          <button type="button" class="card-open" @click="open(character)">
            <span
              class="card-portrait title-serif"
              :style="{
                background: avatarColors(character.name).portraitBg,
                color: avatarColors(character.name).portraitFg,
              }"
            >
              <img v-if="character.portraitUrl" :src="character.portraitUrl" alt="" draggable="false" />
              <template v-else>{{ initials(character.name) }}</template>
            </span>
            <span class="card-body">
              <span class="card-name">{{ character.name }}</span>
              <span class="card-tagline">{{ character.tagline }}</span>
              <span class="card-tags">
                <span v-for="tag in character.tags.slice(0, TAGS_AT_REST)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="character.tags.length > TAGS_AT_REST" class="tag tag-more">+{{ character.tags.length - TAGS_AT_REST }}</span>
              </span>
            </span>
            <!-- The same, in full, over the picture: shown when the card is pointed at or reached with the keyboard.
                 Hidden from screen readers, which already read the card above. -->
            <span class="card-more" aria-hidden="true">
              <span class="card-name">{{ character.name }}</span>
              <span v-if="character.tagline" class="card-tagline">{{ character.tagline }}</span>
              <span v-if="character.tags.length > 0" class="card-tags">
                <span v-for="tag in character.tags.slice(0, TAGS_ON_HOVER)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="character.tags.length > TAGS_ON_HOVER" class="tag tag-more">+{{ character.tags.length - TAGS_ON_HOVER }}</span>
              </span>
              <span v-if="cardExtras(character)" class="card-extras">{{ cardExtras(character) }}</span>
            </span>
          </button>
          <button
            type="button"
            class="card-like"
            :class="{ on: character.favorite }"
            :aria-pressed="character.favorite === true"
            :aria-label="character.favorite ? `Remove ${character.name} from your favourites` : `Add ${character.name} to your favourites`"
            :title="character.favorite ? 'Remove from favourites' : 'Add to favourites'"
            @click="charactersStore.toggleFavorite(character.id)"
          >
            <Heart :size="15" :stroke-width="2" :fill="character.favorite ? 'currentColor' : 'none'" />
          </button>
          <button
            type="button"
            class="card-action card-edit"
            :aria-label="`Edit ${character.name}`"
            title="Edit character"
            @click="characterEditor.open(character)"
          >
            <Pencil :size="14" :stroke-width="2" />
          </button>
          <button
            type="button"
            class="card-action card-delete"
            :aria-label="`Delete ${character.name}`"
            title="Delete character"
            :disabled="chatStore.isBusy"
            @click="remove(character)"
          >
            <Trash2 :size="14" :stroke-width="2" />
          </button>
        </div>
      </div>
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
  justify-content: center;
  /* Equal padding on both sides keeps the tabs centered next to the window buttons */
  padding: 0 max(var(--window-controls-left), var(--window-controls-right), 16px);
  border-bottom: 1px solid var(--border);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px 32px;
  overflow-y: auto;
}

/* The page scrolls: its sections keep their height and are never squeezed. */
.content > * {
  flex-shrink: 0;
}

.top {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.heading {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.import-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
  line-height: 1.5;
  user-select: text;
}
.import-failure {
  color: var(--danger-text);
}
.dismiss {
  align-self: flex-start;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
}
h1 {
  font-size: 28px;
}
.count {
  color: var(--text-dim);
}

.ready {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ready-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
}
h2 {
  font-size: 15px;
  font-weight: 700;
}
.scenarios {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}
/* A scenario is told in a few lines, so its card is wide: the picture on the side, the pitch next to it. */
.scenario {
  display: flex;
  /* The picture's own shape (2:3) when the text is short; a longer text cuts a little off its sides. */
  min-height: 255px;
  background: var(--bg-card);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-xl);
  overflow: hidden;
}
.scenario-picture {
  position: relative;
  flex: 0 0 170px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 400;
}
.scenario-picture img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}
.scenario-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
}
.scenario-body h3 {
  margin: 0;
  font-size: 16px;
}
.scenario-pitch {
  /* Long pitches are cut after a few lines: the whole story is one click away. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-soft);
}
.scenario-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding-top: 6px;
}
.scenario-foot .btn {
  gap: 6px;
}
.scenario-openings {
  font-size: 12px;
  color: var(--text-faint);
}

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
}
.favorites-filter {
  gap: 6px;
  height: 32px;
}
.favorites-filter.on {
  background: var(--bg-selected);
  border-color: var(--border-hover);
  color: var(--like);
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 280px;
  height: 32px;
  padding: 0 10px;
  background: var(--bg-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  color: var(--text-faint);
}
.search:focus-within {
  border-color: var(--accent-strong);
}
.search input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  user-select: text;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  /* Every card has the same height, and the drop zone takes it too. */
  gap: 16px;
}

.import {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 280px;
  padding: 20px;
  background: var(--bg-sunken);
  border: 1.5px dashed #444158;
  border-radius: var(--radius-xl);
  text-align: center;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.import:hover:not(:disabled),
.import.dragging {
  background: var(--accent-bg);
  border-color: var(--accent-hover);
}
.import-click {
  margin-top: -6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}
.import-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-active);
  border-radius: var(--radius-lg);
  color: var(--accent-text);
}
.import-title {
  font-size: 14px;
  font-weight: 700;
}
.import-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
}

.card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-xl);
  overflow: hidden;
  transition:
    border-color 0.12s,
    transform 0.12s;
}
/* The whole card opens the chat; the edit and delete buttons sit on top of it. */
.card-open {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  text-align: left;
}
.card-action {
  position: absolute;
  z-index: 1;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(20 19 27 / 0.82);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-soft);
  opacity: 0;
  transition: opacity 0.12s;
}
.card-edit {
  right: 44px;
}
/* The heart sits on the other corner. It shows when the card is pointed at, and stays once pressed. */
.card-like {
  position: absolute;
  z-index: 1;
  top: 8px;
  left: 8px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(20 19 27 / 0.82);
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  color: var(--text-soft);
  opacity: 0;
  transition:
    opacity 0.12s,
    color 0.12s,
    transform 0.12s;
}
.card:hover .card-like,
.card-like:focus-visible,
.card-like.on {
  opacity: 1;
}
.card-like:hover {
  color: var(--like);
  transform: scale(1.1);
}
.card-like.on {
  color: var(--like);
}
.card-like.on svg {
  animation: like 0.36s cubic-bezier(0.3, 1.7, 0.5, 1);
}
@keyframes like {
  from {
    transform: scale(0.4);
  }
}
@media (prefers-reduced-motion: reduce) {
  .card-like.on svg {
    animation: none;
  }
}
.card:hover .card-action,
.card-action:focus-visible {
  opacity: 1;
}
.card-edit:hover {
  background: var(--bg-selected);
  color: #fff;
}
.card-delete:hover:not(:disabled) {
  background: #b3364a;
  border-color: transparent;
  color: #fff;
}
.card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

/* Every card is the same: a picture frame of the usual shape of card art (2:3), then three
   lines of text. A picture of another shape fills the frame and is cut, keeping its top. */
.card-portrait {
  aspect-ratio: 2 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 48px;
  font-weight: 400;
}
.card-portrait img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* The same height on every card: one line for the name, two for the tagline, one of tags. */
  height: 110px;
  padding: 12px;
}
.card-name {
  font-size: 14px;
  font-weight: 700;
}
.card-tagline {
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-dim);
}
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.card-body .card-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.card-body .card-tagline {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.card-body .card-tags {
  flex-wrap: nowrap;
  margin-top: auto;
  min-width: 0;
}
/* A long tag is shortened rather than pushed off the card; the count of the others always shows. */
.card-body .tag {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tag-more {
  flex-shrink: 0;
  color: var(--text-faint);
}

/* What the card says in full. It rises from the bottom over the picture, and leaves the
   top of the card to the heart and the edit and delete buttons. */
.card-more {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 110px;
  max-height: calc(100% - 46px);
  padding: 14px 12px 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  border-top: 1px solid var(--border-hover);
  backdrop-filter: blur(10px);
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition:
    opacity 0.14s ease-out,
    transform 0.14s ease-out;
}
.card:hover .card-more,
.card-open:focus-visible .card-more {
  opacity: 1;
  transform: none;
  /* A short wait, so that crossing the page with the pointer does not make every card flap. */
  transition-delay: 0.12s;
}
/* When a card says too much for its size, the tags are what gives way: the name and the tagline stay whole. */
.card-more > * {
  flex-shrink: 0;
}
.card-more .card-name,
.card-more .card-tagline {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-more .card-name {
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.card-more .card-tagline {
  -webkit-line-clamp: 5;
  line-clamp: 5;
  color: var(--text-soft);
}
.card-more .card-tags {
  flex-shrink: 1;
  min-height: 0;
  overflow: hidden;
}
.card-extras {
  font-size: 11px;
  color: var(--text-faint);
}
@media (prefers-reduced-motion: reduce) {
  .card-more {
    transform: none;
    transition: none;
  }
}
</style>
