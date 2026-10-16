<script setup lang="ts">
import { ImagePlus, Trash2 } from '@lucide/vue'
import type { ChatBackground, SenseStatus } from '@shared/types'

// How the app looks: what sits behind the chat, whether its colours follow the
// character, and whether the character's mood shows on its picture.

const settingsStore = useSettingsStore()
const charactersStore = useCharactersStore()

// --- Chat background -------------------------------------------------------------------

const backgrounds: { value: ChatBackground; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'character', label: "Character's picture" },
  { value: 'custom', label: 'Your own picture' },
]
const background = computed<ChatBackground>({
  get: () => settingsStore.appearance.background,
  set: (value) => void settingsStore.update({ appearance: { background: value } }),
})
const hasOwnPicture = computed(() => settingsStore.appearance.backgroundVersion > 0)
const backgroundHint = computed(() => {
  if (background.value === 'none') return 'The chat keeps a plain background.'
  if (background.value === 'character') {
    return 'The picture of the character you are talking to sits behind the chat, blurred into colours and light. A character without a picture gives a soft glow of its colour.'
  }
  return hasOwnPicture.value
    ? 'Your picture sits behind every chat, whoever you are talking to.'
    : 'Choose a picture to put behind every chat: a place, a landscape, anything you like to look at.'
})

const strengthLabel = (value: number): string => `${value < 30 ? 'Subtle' : value < 70 ? 'Medium' : 'Vivid'} · ${value}%`
function setStrength(value: number): void {
  void settingsStore.update({ appearance: { backgroundStrength: value } })
}

const pictureInput = ref<HTMLInputElement | null>(null)
const pictureProblem = ref('')
const choosing = ref(false)

async function onPicturePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // So picking the same file again is noticed.
  if (!file) return

  choosing.value = true
  pictureProblem.value = ''
  try {
    await settingsStore.setBackground(file)
  } catch (error) {
    pictureProblem.value = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error)
  } finally {
    choosing.value = false
  }
}

async function removePicture(): Promise<void> {
  pictureProblem.value = ''
  await settingsStore.removeBackground()
}

async function setWebMedia(event: Event): Promise<void> {
  await settingsStore.update({ appearance: { webMedia: (event.target as HTMLInputElement).checked } })
}

async function setAmbiance(event: Event): Promise<void> {
  await settingsStore.update({ appearance: { ambiance: (event.target as HTMLInputElement).checked } })
}

async function setStyledText(event: Event): Promise<void> {
  await settingsStore.update({ appearance: { styledText: (event.target as HTMLInputElement).checked } })
}

async function setMoods(event: Event): Promise<void> {
  await settingsStore.update({ appearance: { moods: (event.target as HTMLInputElement).checked } })
  void lookAtSense()
}

// --- The mood, read from the meaning -----------------------------------------------------
// Where the app's own embedding model can run (src/main/sense.ts). The page only says
// where it stands: the model comes by itself. Looked at again every other second, since a
// download or a first start changes it without the page doing anything.

const sense = ref<SenseStatus | null>(null)
let senseTimer = 0

async function lookAtSense(): Promise<void> {
  sense.value = await window.api.mood.status().catch(() => null)
}
onMounted(() => {
  void lookAtSense()
  senseTimer = window.setInterval(lookAtSense, 2000)
})
onBeforeUnmount(() => clearInterval(senseTimer))

async function setMoodsByMeaning(event: Event): Promise<void> {
  await settingsStore.update({ appearance: { moodsByMeaning: (event.target as HTMLInputElement).checked } })
  void lookAtSense()
}

/** A few words on where it stands, and whether that is good news. */
const senseLine = computed<{ text: string; ok?: boolean } | null>(() => {
  switch (sense.value?.state) {
    case 'ready':
      return { text: 'Ready', ok: true }
    case 'downloading':
      return { text: `Downloading · ${Math.round((sense.value.progress ?? 0) * 100)}%` }
    case 'preparing':
      return { text: 'Getting ready…' }
    case 'asleep':
      return { text: 'Starts with the next reply' }
    case 'elsewhere':
      return { text: `Only when replies come from this ${deviceName()}` }
    default:
      return null
  }
})

function setCharacterColors(event: Event): void {
  void settingsStore.update({ appearance: { characterColors: (event.target as HTMLInputElement).checked } })
}
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Appearance</h1>
      <p>How the app looks.</p>
    </header>

    <section class="card background">
      <div class="heading">
        <span class="toggle-title">Chat background</span>
        <span class="toggle-hint">{{ backgroundHint }}</span>
      </div>
      <SegmentedControl v-model="background" :options="backgrounds" label="Chat background" />

      <!-- The chat as it will look, with the character on screen -->
      <div class="preview" :class="{ 'with-backdrop': background !== 'none' }">
        <ChatBackdrop :character="charactersStore.active" />
        <div class="preview-message">
          <span class="preview-author">{{ charactersStore.active?.name ?? 'The character' }}</span>
          <span class="preview-text">*She looks up from the ledger.* "You found the stairs."</span>
        </div>
        <div class="preview-message user">
          <span class="preview-author you">{{ settingsStore.persona.name }}</span>
          <span class="preview-text">I shake the rain off my coat.</span>
        </div>
      </div>

      <div v-if="background === 'custom'" class="own">
        <button type="button" class="btn btn-small" :disabled="choosing" @click="pictureInput?.click()">
          <ImagePlus :size="14" :stroke-width="2" />{{ hasOwnPicture ? 'Change picture…' : 'Choose a picture…' }}
        </button>
        <button v-if="hasOwnPicture" type="button" class="btn btn-small" :disabled="choosing" @click="removePicture">
          <Trash2 :size="14" :stroke-width="2" />Remove
        </button>
        <input ref="pictureInput" class="sr-only" type="file" accept="image/*" aria-label="Background picture" @change="onPicturePicked" />
        <span v-if="choosing" class="toggle-hint">Preparing the picture…</span>
        <span v-else-if="!hasOwnPicture" class="toggle-hint">Until you choose one, the chat keeps the character's picture.</span>
      </div>
      <p v-if="pictureProblem" class="problem" role="alert">{{ pictureProblem }}</p>

      <AppSlider
        v-if="background !== 'none'"
        label="Intensity"
        :value="settingsStore.appearance.backgroundStrength"
        :min="0"
        :max="100"
        :step="5"
        :format="strengthLabel"
        @commit="setStrength"
      />
    </section>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" :checked="settingsStore.appearance.characterColors" @change="setCharacterColors" />
        <span class="toggle-text">
          <span class="toggle-title">Take the colours from the character</span>
          <span class="toggle-hint">
            In a chat, the app leans towards the main colour of the picture of the character you are talking to:
            its buttons, its links, and a hint of it in the dark background. A character without a picture gives the
            colour of its initials. The Library and the settings keep the app's own colours. Turn this off to keep them
            in the chat too.
          </span>
        </span>
      </label>
    </section>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" :checked="settingsStore.appearance.moods" @change="setMoods" />
        <span class="toggle-text">
          <span class="toggle-title">Show the character's mood on its picture</span>
          <span class="toggle-hint">
            When the character's mood changes, a small symbol pops beside them for a moment: an exclamation mark for
            surprise, a drop of sweat for unease, a heart, a sigh… Not at every reply: a character who goes on smiling
            is not given stars each time. The mood is read from the words of the reply, so it is sometimes missed, and
            a reply that shows no clear feeling gets no symbol.
          </span>
        </span>
      </label>

      <!-- Only where the model can run: elsewhere there is nothing to choose. -->
      <label v-if="sense && sense.state !== 'unsupported'" class="toggle" :class="{ dimmed: !settingsStore.appearance.moods }">
        <input
          type="checkbox"
          :checked="settingsStore.appearance.moodsByMeaning"
          :disabled="!settingsStore.appearance.moods"
          @change="setMoodsByMeaning"
        />
        <span class="toggle-text">
          <span class="toggle-title">
            Read it from the meaning too
            <span v-if="senseLine && settingsStore.appearance.moods" class="pill" :class="{ ok: senseLine.ok }">{{ senseLine.text }}</span>
          </span>
          <span class="toggle-hint">
            A small model of the app's own ({{ sense.model }}, {{ formatBytes(sense.bytes) }}) reads what a reply feels like
            when no telling word is in it, in any language. It runs on this {{ deviceName() }} next to the chat model,
            and the app downloads it once, by itself.
          </span>
          <span v-if="sense.state === 'failed'" class="toggle-hint problem">
            It does not work right now, so the mood is read from the words alone. {{ sense.problem }}
          </span>
        </span>
      </label>
    </section>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" :checked="settingsStore.appearance.ambiance" @change="setAmbiance" />
        <span class="toggle-text">
          <span class="toggle-title">Light that follows the mood</span>
          <span class="toggle-hint">
            A few soft patches of colour drift slowly behind the chat and take the mood of the character's last
            reply: warm when they smile, blue when they are sad, red when they are angry. The change fades over a few
            seconds.
          </span>
        </span>
      </label>
    </section>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" :checked="settingsStore.appearance.styledText" @change="setStyledText" />
        <span class="toggle-text">
          <span class="toggle-title">Set dialogue apart</span>
          <span class="toggle-hint">
            What a character says between quotes takes a touch of their colour, so it stands out from the
            telling. Actions between asterisks stay in italics either way.
          </span>
        </span>
      </label>
    </section>

    <section class="card">
      <label class="toggle">
        <input type="checkbox" :checked="settingsStore.appearance.webMedia" @change="setWebMedia" />
        <span class="toggle-text">
          <span class="toggle-title">Show pictures and sounds in messages</span>
          <span class="toggle-hint">
            Some characters bring a picture of the scene or a song in their messages, kept on a website. Showing them
            means asking that website for them, as a browser would. Off: they are left out of the messages, and
            nothing is asked.
          </span>
        </span>
      </label>
    </section>
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
.toggle-hint.problem {
  color: var(--warning-text);
}
.toggle.dimmed {
  opacity: 0.55;
  cursor: default;
}
.toggle-title .pill {
  margin-left: 6px;
  padding: 2px 8px;
  background: var(--bg-button);
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.toggle-title .pill.ok {
  background: var(--success-bg);
  color: var(--success-text);
}

.heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* A small copy of the chat: the same backdrop, and the panels its messages get. */
.preview {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 16px;
  min-height: 150px;
  justify-content: center;
  background: var(--bg-app);
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  overflow: hidden;
}
.preview-message {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 12px;
  border-radius: var(--radius);
  font-size: 12.5px;
}
.preview.with-backdrop .preview-message {
  background: color-mix(in srgb, var(--bg-app) 76%, transparent);
}
.preview-message.user,
.preview.with-backdrop .preview-message.user {
  background: color-mix(in srgb, var(--bg-card) 88%, transparent);
}
.preview-author {
  font-weight: 700;
  color: var(--accent-soft);
}
.preview-author.you {
  color: #a9cbee;
}
.preview-text {
  font-family: var(--font-prose);
  font-size: 14px;
  color: var(--text-soft);
}

.own {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.own .btn {
  gap: 6px;
}
.problem {
  font-size: 12px;
  color: var(--danger-text);
}
</style>
