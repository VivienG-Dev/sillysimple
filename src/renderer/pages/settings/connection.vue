<script setup lang="ts">
import type { SenseStatus } from '@shared/types'

const settingsStore = useSettingsStore()
const justSaved = ref(false)

function onSaved(): void {
  justSaved.value = true
  setTimeout(() => (justSaved.value = false), 2000)
  void lookAtSense()
}

// --- The app's small model, with replies from elsewhere -----------------------------------
// With replies from this computer it runs by itself (src/main/sense.ts). With replies from
// another server or an online service, only when asked here: it takes a download, which
// someone who chose an online service did not ask for. Looked at again every other second,
// since a download changes it without the page doing anything.

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

const elsewhere = computed(() => settingsStore.connection.kind !== 'ollama')
const anywhere = computed(() => settingsStore.generation.meaningAnywhere)
const where = computed(() => (settingsStore.connection.kind === 'cloud' ? 'an online service' : 'another server'))

async function setAnywhere(event: Event): Promise<void> {
  await settingsStore.update({ generation: { meaningAnywhere: (event.target as HTMLInputElement).checked } })
  void lookAtSense()
}

/** What turning it on would download, said before it is turned on. */
const sizeLine = computed(() => {
  const status = sense.value
  if (!status || status.toFetch === null) return null
  if (status.toFetch === 0) return `Everything it needs is already on this ${deviceName()}: nothing to download.`
  const what = status.toFetch > status.bytes ? 'the engine that runs it, and the model' : 'the model'
  return `Turning it on downloads about ${formatBytes(status.toFetch)} once (${what}), and it takes some memory while you chat.`
})

/** Where it stands, once it is on. */
const senseLine = computed<{ text: string; ok?: boolean } | null>(() => {
  if (!anywhere.value) return null
  const status = sense.value
  switch (status?.state) {
    case 'ready':
      return { text: 'Ready', ok: true }
    case 'downloading':
      return { text: `Downloading ${status.step === 'engine' ? 'the engine' : 'the model'} · ${Math.round((status.progress ?? 0) * 100)}%` }
    case 'preparing':
      return { text: 'Getting ready…' }
    case 'off':
      return { text: 'Moods are off' }
    default:
      return null
  }
})
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Connection</h1>
      <p>Where replies come from, and which model writes them.</p>
    </header>

    <ConnectionPicker :save-label="justSaved ? 'Saved' : 'Save'" @saved="onSaved" />

    <!-- With replies from elsewhere only: from this computer, the small model runs by itself. -->
    <section v-if="elsewhere && sense && sense.state !== 'unsupported'" class="card">
      <label class="toggle">
        <input type="checkbox" :checked="anywhere" @change="setAnywhere" />
        <span class="toggle-text">
          <span class="toggle-title">
            Run the small model on this {{ deviceName() }} anyway
            <span v-if="senseLine" class="pill" :class="{ ok: senseLine.ok }">{{ senseLine.text }}</span>
          </span>
          <span class="toggle-hint">
            Replies come from {{ where }}, but the app can still run its own small model ({{ sense.model }}) here. It
            reads the mood of each reply from its meaning, brings in lorebook notes when the chat talks about them in
            other words, and finds old moments of long chats. It works on this {{ deviceName() }} only: nothing more is
            sent anywhere.
          </span>
          <span v-if="!anywhere" class="toggle-hint">
            {{ sizeLine }} Off, moods and lorebooks work from their keywords alone.
          </span>
          <span v-else class="toggle-hint">
            Turning it off stops it. What was downloaded stays on this {{ deviceName() }}, ready for next time. If you run
            Ollama yourself, the model is kept in yours and shows in <code>ollama list</code> as {{ sense.id }}.
          </span>
          <span v-if="anywhere && sense.state === 'failed'" class="toggle-hint problem">
            It does not work right now, so moods and lorebooks work from their keywords. {{ sense.problem }}
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
  gap: 20px;
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
.toggle-hint code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
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
</style>
