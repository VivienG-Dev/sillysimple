<script setup lang="ts">
import { AudioLines, Check, ExternalLink, Lock, Server, VolumeX } from '@lucide/vue'
import { ELEVENLABS, voiceDestination, voiceKeySlot } from '@shared/providers'
import type { KeysStatus, VoiceChoice, VoiceEngine } from '@shared/types'

// Settings › Voice: have the replies read aloud. The user picks what reads them
// (nothing, ElevenLabs, or a speech server that takes OpenAI's speech requests, on the
// internet or on this computer), gives its key, and chooses the voice of everyone.
// A character gets a voice of its own in the panel beside the chat.
//
// Every change here is saved at once: what is heard when a voice is tried is then the
// very thing the chat will use.

const settingsStore = useSettingsStore()
const voiceStore = useVoiceStore()

const voice = computed(() => settingsStore.voice)
const status = computed(() => voiceStore.status)

// --- API key -----------------------------------------------------------------------
// As for the model: the key lives in the main process, this page only knows whether
// one is saved. A key that was typed is saved once the service has accepted it.

const keys = ref<KeysStatus>({ slots: [], persistent: true })
const typedKey = ref('')
const slot = computed(() => voiceKeySlot(voice.value))
const hasSavedKey = computed(() => slot.value !== null && keys.value.slots.includes(slot.value))
// A key typed for one service must not be tried on another.
watch(slot, () => (typedKey.value = ''))

/** A speech server on one's own computer rarely wants a key: the field stays out of the way until it is asked for. */
const wantsServerKey = ref(false)
const showServerKey = computed(
  () => wantsServerKey.value || hasSavedKey.value || (status.value !== null && !status.value.ok && status.value.error.includes('API key')),
)

async function check(): Promise<void> {
  // ElevenLabs cannot be asked anything without a key.
  if (voice.value.engine === 'elevenlabs' && !hasSavedKey.value && !typedKey.value.trim()) {
    voiceStore.status = null
    return
  }
  const key = typedKey.value.trim()
  const result = await voiceStore.check(key || undefined)
  if (!result) return

  // A key the service knows is kept, even when it may not do everything yet: ElevenLabs
  // shows a key only once, and its permissions are changed on ElevenLabs' side, not here.
  if (key && slot.value && (result.ok || result.keyKnown)) {
    keys.value = await window.api.keys.set(slot.value, key)
    typedKey.value = ''
  }
  if (!result.ok) return
  // A first voice is chosen for everyone, so that replies can be heard at once. It is the user's to change.
  if (!voiceStore.defaultVoice && result.voices[0]) await setDefaultVoice({ id: result.voices[0].id, name: result.voices[0].name })
}

async function removeKey(): Promise<void> {
  if (!slot.value) return
  keys.value = await window.api.keys.remove(slot.value)
  voiceStore.status = null
  if (voice.value.engine === 'server') void check()
}

// --- What reads the replies ----------------------------------------------------------

async function choose(engine: VoiceEngine): Promise<void> {
  if (engine === voice.value.engine) return
  await settingsStore.update({ voice: { engine } })
  await nextTick()
  void check()
}

/** The address of the speech server, as it is being typed. Saved when it is checked. */
const address = ref(voice.value.baseUrl)
const serverModel = ref(voice.value.serverModel)
async function checkServer(): Promise<void> {
  await settingsStore.update({ voice: { baseUrl: address.value.trim(), serverModel: serverModel.value.trim() } })
  await nextTick()
  await check()
}
const serverModels = ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd', 'kokoro']

function setElevenLabsModel(event: Event): void {
  void settingsStore.update({ voice: { elevenlabsModel: (event.target as HTMLSelectElement).value } })
}

// --- How it is used ------------------------------------------------------------------

async function setDefaultVoice(choice: VoiceChoice | null): Promise<void> {
  await settingsStore.update({ voice: voice.value.engine === 'elevenlabs' ? { elevenlabsVoice: choice } : { serverVoice: choice } })
}

const readModes = [
  { value: 'all' as const, label: 'Everything' },
  { value: 'speech' as const, label: 'Only what is said' },
  { value: 'narrator' as const, label: 'With a narrator' },
]
async function setNarrator(choice: VoiceChoice | null): Promise<void> {
  await settingsStore.update({ voice: voice.value.engine === 'elevenlabs' ? { elevenlabsNarrator: choice } : { serverNarrator: choice } })
}
const readMode = computed({
  get: () => voice.value.read,
  set: (read) => void settingsStore.update({ voice: { read } }),
})
function setAutoRead(event: Event): void {
  void settingsStore.update({ voice: { autoRead: (event.target as HTMLInputElement).checked } })
}

const usage = computed(() => (status.value?.ok ? status.value.usage : undefined))
const destination = computed(() => voiceDestination(voice.value))
const ready = computed(() => status.value?.ok === true)

onMounted(async () => {
  keys.value = await window.api.keys.status()
  if (voiceStore.enabled && !voiceStore.status) await check()
})
onBeforeUnmount(() => voiceStore.stop())
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Voice</h1>
      <p>
        Have the replies read aloud, each character with a voice of its own. The voices come from a voice service:
        choose one, and it is asked for the sound each time a reply is read.
      </p>
    </header>

    <section class="card">
      <div class="options" role="radiogroup" aria-label="What reads the replies aloud">
        <label class="option" :class="{ selected: voice.engine === 'off' }">
          <input type="radio" class="sr-only" name="voice" :checked="voice.engine === 'off'" @change="choose('off')" />
          <span class="radio" />
          <span class="icon"><VolumeX :size="18" :stroke-width="1.8" /></span>
          <span class="option-text">
            <span class="option-title">No voice</span>
            <span class="option-description">Replies are only written. Nothing is sent to any voice service.</span>
          </span>
        </label>

        <label class="option" :class="{ selected: voice.engine === 'elevenlabs' }">
          <input type="radio" class="sr-only" name="voice" :checked="voice.engine === 'elevenlabs'" @change="choose('elevenlabs')" />
          <span class="radio" />
          <span class="icon"><AudioLines :size="18" :stroke-width="1.8" /></span>
          <span class="option-text">
            <span class="option-title">ElevenLabs</span>
            <span class="option-description">Expressive voices, in many languages. Online, with your own API key; paid by the character read.</span>
          </span>
          <span v-if="voice.engine === 'elevenlabs' && ready" class="pill ok">
            <Check :size="13" :stroke-width="2.4" />{{ voiceStore.voices.length }} {{ voiceStore.voices.length === 1 ? 'voice' : 'voices' }}
          </span>
        </label>

        <label class="option" :class="{ selected: voice.engine === 'server' }">
          <input type="radio" class="sr-only" name="voice" :checked="voice.engine === 'server'" @change="choose('server')" />
          <span class="radio" />
          <span class="icon"><Server :size="18" :stroke-width="1.8" /></span>
          <span class="option-text">
            <span class="option-title">A speech server</span>
            <span class="option-description">OpenAI, or a voice program running on this {{ deviceName() }}: anything that takes OpenAI's speech requests.</span>
          </span>
          <span v-if="voice.engine === 'server' && ready" class="pill ok"><Check :size="13" :stroke-width="2.4" />Answers</span>
        </label>
      </div>

      <div v-if="voice.engine === 'elevenlabs'" class="details">
        <p class="hint">
          Create a key in your ElevenLabs account, then paste it here. ElevenLabs asks what the key may do: give it
          <strong>Text to Speech</strong> and <strong>Voices: Read</strong>, or leave it unrestricted.
          <a :href="ELEVENLABS.keyUrl" target="_blank" rel="noreferrer">Get an ElevenLabs key<ExternalLink :size="12" :stroke-width="2" /></a>
        </p>
        <ApiKeyField
          v-model="typedKey"
          :saved="hasSavedKey"
          :persistent="keys.persistent"
          :checking="voiceStore.checking"
          :placeholder="ELEVENLABS.keyPlaceholder"
          @check="check"
          @remove="removeKey"
        />
      </div>

      <div v-if="voice.engine === 'server'" class="details">
        <div class="url-row">
          <label class="grow">
            <span class="field-label">Address</span>
            <input
              v-model="address"
              class="field mono"
              type="text"
              spellcheck="false"
              aria-label="Address of the speech server"
              placeholder="https://api.openai.com/v1"
              @keydown.enter="checkServer"
            />
          </label>
          <label>
            <span class="field-label">Speech model</span>
            <input
              v-model="serverModel"
              class="field mono"
              type="text"
              spellcheck="false"
              list="speech-models"
              aria-label="Speech model"
              placeholder="gpt-4o-mini-tts"
              @keydown.enter="checkServer"
            />
            <datalist id="speech-models"><option v-for="item in serverModels" :key="item" :value="item" /></datalist>
          </label>
          <button type="button" class="btn" :disabled="voiceStore.checking" @click="checkServer">Check</button>
        </div>
        <button v-if="!showServerKey" type="button" class="link key-link" @click="wantsServerKey = true">This server needs an API key</button>
        <ApiKeyField
          v-else
          v-model="typedKey"
          :saved="hasSavedKey"
          :persistent="keys.persistent"
          :checking="voiceStore.checking"
          placeholder="API key of this server"
          @check="checkServer"
          @remove="removeKey"
        />
      </div>

      <p v-if="!keys.persistent && voice.engine !== 'off'" class="notice">
        This computer has no secure place to keep keys, so yours is only kept until you quit the app.
      </p>

      <div v-if="voice.engine !== 'off'" aria-live="polite">
        <p v-if="voiceStore.checking" class="notice">Asking for the voices…</p>
        <p v-else-if="status && !status.ok" class="notice error">
          {{ status.error }}
          <button type="button" class="link" @click="check">Try again</button>
        </p>
      </div>

      <p v-if="voice.engine !== 'off'" class="privacy" :class="{ leaves: destination }">
        <Lock :size="13" :stroke-width="2" />
        <template v-if="destination">The text of each reply you listen to is sent to {{ destination }}. Nothing else is.</template>
        <template v-else>The text that is read aloud stays on this {{ deviceName() }}.</template>
      </p>
    </section>

    <section v-if="ready" class="card">
      <div class="setting">
        <div class="setting-text">
          <span class="setting-title">Voice of everyone</span>
          <span class="hint">
            The voice a character is read with until you give it one of its own: that is done beside the chat, under
            the character's name.
          </span>
        </div>
        <VoicePicker class="setting-control" :model-value="voiceStore.defaultVoice" label="Voice of everyone" @update:model-value="setDefaultVoice" />
      </div>

      <div v-if="voice.engine === 'elevenlabs' && status?.ok && status.models.length > 0" class="setting">
        <div class="setting-text">
          <span class="setting-title">Speech model</span>
          <span class="hint">
            Which of ElevenLabs' models speaks. Left to ElevenLabs, it is Multilingual v2. The newer ones are more
            expressive; they differ in speed and price, and not every plan has them all.
          </span>
        </div>
        <select class="field setting-control" aria-label="ElevenLabs speech model" :value="voice.elevenlabsModel" @change="setElevenLabsModel">
          <option value="">ElevenLabs' own choice (Multilingual v2)</option>
          <option v-if="voice.elevenlabsModel && !status.models.some((item) => item.id === voice.elevenlabsModel)" :value="voice.elevenlabsModel">
            {{ voice.elevenlabsModel }}
          </option>
          <option v-for="item in status.models" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>

      <div class="setting">
        <div class="setting-text">
          <span class="setting-title">What is read</span>
          <span class="hint">
            Everything a character writes, in its voice. Or only what it says aloud, the text in "quotes", leaving out
            what it does between *asterisks*. Or everything with two voices: the character says its lines, and a
            narrator tells the rest.
          </span>
        </div>
        <SegmentedControl v-model="readMode" :options="readModes" label="What is read" />
      </div>

      <div v-if="voice.read === 'narrator'" class="setting narrator">
        <div class="setting-text">
          <span class="setting-title">Voice of the narrator</span>
          <span class="hint">
            The voice that tells what the characters do. A character that has this same voice reads its whole message
            alone: give the narrator a voice of its own.
          </span>
        </div>
        <VoicePicker
          class="setting-control"
          :model-value="voiceStore.narratorVoice"
          :inherit="voiceStore.defaultVoice ? `Same as everyone · ${voiceStore.defaultVoice.name}` : undefined"
          :fallback="voiceStore.defaultVoice"
          label="Voice of the narrator"
          @update:model-value="setNarrator"
        />
      </div>

      <label class="toggle">
        <input type="checkbox" aria-label="Read replies aloud as they arrive" :checked="voice.autoRead" @change="setAutoRead" />
        <span class="toggle-text">
          <span class="toggle-title">Read replies aloud as they arrive</span>
          <span class="toggle-hint">
            Each reply is read as soon as it is written. Without this, a reply is read when you press the speaker
            button that shows on it.
          </span>
        </span>
      </label>

      <p v-if="usage" class="hint usage">
        {{ usage.used.toLocaleString('en') }} of {{ usage.limit.toLocaleString('en') }} characters used this month on your ElevenLabs account.
      </p>
      <p v-if="voice.engine === 'elevenlabs'" class="hint">
        ElevenLabs counts every character it reads. Listening to the same reply again costs nothing while the app stays open, and trying a voice here
        plays ElevenLabs' own sample of it, which is free.
      </p>
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
  line-height: 1.5;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-sunken);
  border: 1.5px solid var(--border-field);
  border-radius: var(--radius-lg);
  cursor: pointer;
}
.option:hover:not(.selected) {
  border-color: var(--border-hover);
}
.option.selected {
  background: var(--accent-bg);
  border-color: var(--accent-hover);
}
.option:has(:focus-visible) {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
.radio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: 1.5px solid #55526a;
  border-radius: 50%;
}
.selected > .radio {
  border: 5px solid var(--accent-strong);
}
.icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tile);
  border-radius: var(--radius-md);
  color: var(--accent-soft);
}
.option-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.option-title {
  font-size: 14px;
  font-weight: 700;
}
.option-description {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-dim);
}
.pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.pill.ok {
  background: var(--success-bg);
  color: var(--success-text);
}

.details {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.url-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.url-row label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 190px;
}
.url-row .grow {
  flex: 1;
  width: auto;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.key-link {
  align-self: flex-start;
  font-size: 12px;
}
.link {
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-text);
  font-weight: 600;
}
.link:hover {
  text-decoration: underline;
}

.hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}
.hint strong {
  font-weight: 600;
  color: var(--text-muted);
}
.hint a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  font-weight: 600;
}
.notice {
  padding: 12px 14px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  line-height: 1.5;
}
.notice.error {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-text);
}
.privacy {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.privacy.leaves {
  color: var(--warning-text);
}

.setting {
  display: flex;
  align-items: center;
  gap: 20px;
}
.setting-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.setting-title {
  font-weight: 600;
}
.setting-control {
  width: 300px;
  flex-shrink: 0;
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
.usage {
  color: var(--text-muted);
}
</style>
