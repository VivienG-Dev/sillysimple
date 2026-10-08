<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { cleanTag, MAX_TAGS, NOTICE_AFTER } from '@core/prompt/notice'
import { cloudProvider } from '@shared/providers'

// "Adapts to you": two options that let the app get to know how its user plays. Both
// are in beta and off until the user turns them on: not everyone wants an app to learn
// anything about them. Everything they note is shown, here or in the chat's Memory tab,
// and can be changed. See src/core/prompt/notice.ts.

const settingsStore = useSettingsStore()
const { confirm } = useConfirm()

const adapt = computed(() => settingsStore.adapt)

function setLearnTastes(event: Event): void {
  void settingsStore.update({ adapt: { learnTastes: (event.target as HTMLInputElement).checked } })
}
function setFollowStory(event: Event): void {
  void settingsStore.update({ adapt: { followStory: (event.target as HTMLInputElement).checked } })
}

// --- Tags ----------------------------------------------------------------------------

type Side = 'likes' | 'dislikes'
const sides: { side: Side; title: string; placeholder: string; empty: string }[] = [
  { side: 'likes', title: 'You enjoy', placeholder: 'slow burn, dry humour…', empty: 'Nothing noted yet.' },
  { side: 'dislikes', title: 'You do not enjoy', placeholder: 'time skips, long monologues…', empty: 'Nothing noted yet.' },
]
const drafts = reactive<Record<Side, string>>({ likes: '', dislikes: '' })

/** Takes a tag out. It is remembered as taken out, so the model does not propose it again. */
async function remove(side: Side, tag: string): Promise<void> {
  await settingsStore.update({
    adapt: {
      [side]: adapt.value[side].filter((item) => item !== tag),
      removed: [...adapt.value.removed.filter((item) => item !== tag), tag],
    },
  })
}

/** Adds the tags typed in a box: several can be given at once, separated by commas. */
async function add(side: Side): Promise<void> {
  const other: Side = side === 'likes' ? 'dislikes' : 'likes'
  const typed = [...new Set(drafts[side].split(/[,;\n]/).map(cleanTag).filter(Boolean))]
  drafts[side] = ''
  const fresh = typed.filter((tag) => !adapt.value[side].includes(tag)).slice(0, MAX_TAGS - adapt.value[side].length)
  if (fresh.length === 0) return

  await settingsStore.update({
    adapt: {
      [side]: [...adapt.value[side], ...fresh],
      // A tag is on one side only, and adding it by hand lifts its ban.
      [other]: adapt.value[other].filter((tag) => !fresh.includes(tag)),
      removed: adapt.value.removed.filter((tag) => !fresh.includes(tag)),
    },
  })
}

const isFull = (side: Side): boolean => adapt.value[side].length >= MAX_TAGS

async function allowRemoved(): Promise<void> {
  await settingsStore.update({ adapt: { removed: [] } })
}

async function forgetAll(): Promise<void> {
  const confirmed = await confirm({
    title: 'Forget all your tastes?',
    message: 'Every tag is thrown away, those you took out included. If learning stays on, the list fills up again from your next chats.',
    confirmLabel: 'Forget them',
  })
  if (confirmed) await settingsStore.update({ adapt: { likes: [], dislikes: [], removed: [] } })
}

const hasTags = computed(() => adapt.value.likes.length + adapt.value.dislikes.length + adapt.value.removed.length > 0)

/** Where the tags are kept, and where they travel. */
const kept = computed(() => {
  const connection = settingsStore.connection
  const here = `Your tags are kept on this ${deviceName()}, with your settings.`
  if (connection.kind !== 'cloud') return here
  const service = cloudProvider(connection.provider)?.name ?? 'the online service you chose'
  return `${here} They are sent to ${service} with each message, like the rest of the chat, and reading your messages uses a little of your credit there.`
})
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Adapts to you <span class="beta">Beta</span></h1>
      <p>
        Two options that let the app get to know how you play. Both are off until you turn them on. They are new and
        can get things wrong, so everything they note is shown to you and yours to change.
      </p>
    </header>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" aria-label="Learn my tastes" :checked="adapt.learnTastes" @change="setLearnTastes" />
        <span class="toggle-text">
          <span class="toggle-title">Learn my tastes</span>
          <span class="toggle-hint">
            Every so often, after a reply, the model rereads your latest messages and notes what you seem to enjoy in
            a story, as short tags, a few at a time. Every character is told about them, as something to take into
            account and not to follow blindly, and "Describe your character" can write new characters with them in
            mind. Tags are about stories and writing (tone, pace, kinds of scenes), never about you as a person.
          </span>
        </span>
      </label>

      <div v-if="adapt.learnTastes || hasTags" class="tastes" :class="{ unused: !adapt.learnTastes }">
        <p v-if="!adapt.learnTastes" class="note">Learning is off: these tags are kept, but no character is told about them.</p>

        <div v-for="item in sides" :key="item.side" class="side" :data-side="item.side">
          <h2>{{ item.title }}</h2>
          <ul v-if="adapt[item.side].length > 0" class="tags">
            <li v-for="tag in adapt[item.side]" :key="tag" class="taste">
              {{ tag }}
              <button type="button" :aria-label="`Take out ${tag}`" title="Take out: it will not be proposed again" @click="remove(item.side, tag)">
                <X :size="11" :stroke-width="2.4" />
              </button>
            </li>
          </ul>
          <p v-else class="note">{{ item.empty }}</p>

          <form class="add" @submit.prevent="add(item.side)">
            <input
              v-model="drafts[item.side]"
              class="field"
              maxlength="120"
              :aria-label="`Add to: ${item.title}`"
              :placeholder="isFull(item.side) ? `${MAX_TAGS} tags at most: take one out first` : item.placeholder"
              :disabled="isFull(item.side)"
            />
            <button type="submit" class="btn btn-small" :disabled="!drafts[item.side].trim() || isFull(item.side)">
              <Plus :size="13" :stroke-width="2.2" />Add
            </button>
          </form>
        </div>

        <p class="note">
          A tag you take out is not proposed again.
          <template v-if="adapt.removed.length > 0">
            {{ adapt.removed.length }} taken out so far.
            <button type="button" class="link" @click="allowRemoved">Allow them again</button>
          </template>
        </p>
        <p class="note">{{ kept }}</p>
        <button v-if="hasTags" type="button" class="btn btn-small danger" @click="forgetAll">Forget all my tastes</button>
      </div>
    </section>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" aria-label="Follow where each story is heading" :checked="adapt.followStory" @change="setFollowStory" />
        <span class="toggle-text">
          <span class="toggle-title">Follow where each story is heading</span>
          <span class="toggle-hint">
            Every so often, the model also writes two or three sentences on where the story of a chat seems to be going
            and what you seem to want from it. The character reads that note as a guess, and follows you if you go
            another way. You find it in the Memory tab beside the chat, where you can correct it or empty it.
          </span>
        </span>
      </label>
    </section>

    <p class="note outside">
      Reading your latest messages happens in the background, about every {{ NOTICE_AFTER }} messages you write. It
      stops as soon as you send something, so you never wait for it.
    </p>
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
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 26px;
}
header p {
  color: var(--text-dim);
  line-height: 1.5;
}
.beta {
  padding: 2px 8px;
  border: 1px solid var(--warning-text);
  border-radius: var(--radius-pill);
  font-family: var(--font-ui, inherit);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--warning-text);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
}

.toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.toggle input {
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
  flex-shrink: 0;
  accent-color: var(--accent);
}
.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.toggle-title {
  font-weight: 600;
}
.toggle-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}

.tastes {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 14px;
  background: var(--bg-sunken);
  border-radius: var(--radius);
}
.tastes.unused .tags {
  opacity: 0.55;
}
.side {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
h2 {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.taste {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 10px;
  background: var(--bg-button);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  font-size: 12px;
  color: var(--text-soft);
}
.side[data-side='likes'] .taste {
  border-color: var(--accent-strong);
}
.taste button {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--text-faint);
}
.taste button:hover {
  background: var(--bg-selected);
  color: var(--text);
}

.add {
  display: flex;
  gap: 8px;
  max-width: 380px;
}
.add .btn {
  flex-shrink: 0;
  gap: 5px;
}

.note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}
.note.outside {
  padding: 0 4px;
}
.link {
  padding: 0;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}
.link:hover {
  text-decoration: underline;
}
.btn.danger {
  color: var(--danger-text);
}
.btn.danger:hover:not(:disabled) {
  border-color: var(--danger-border);
}
</style>
