<script setup lang="ts">
import { Check, Cloud, Cpu, ExternalLink, Lock, Search, Server } from '@lucide/vue'
import { sameOllamaModel } from '@core/providers/ollama'
import { OLLAMA_BASE_URL } from '@shared/defaults'
import { CLOUD_PROVIDERS, cloudProvider, isLocalAddress, keySlot } from '@shared/providers'
import type { CloudProviderId, ConnectionKind, ConnectionSettings, ConnectionStatus, KeysStatus } from '@shared/types'

// Choose where replies come from, then choose a model.
// Used by the first-launch screen and by Settings > Connection.
// It works on a draft: nothing is saved until the main button is pressed.

/** What is picked right now, saved or not: the first launch's guide speaks about it. */
export interface ConnectionChoice {
  kind: ConnectionKind
  /** The online service that is picked: "OpenRouter". Null for the two other kinds. */
  service: string | null
  /** What is written would leave this computer. */
  leaves: boolean
  /** How many models the server or the service listed. Null until it answers ("on this computer": see the engine store). */
  found: number | null
  /** It was asked, and the answer was an error. */
  failed: boolean
}

defineProps<{ saveLabel: string }>()
const emit = defineEmits<{ saved: []; looking: [choice: ConnectionChoice] }>()

const settingsStore = useSettingsStore()
const connectionStore = useConnectionStore()
const engineStore = useEngineStore()

const saved = settingsStore.connection
const kind = ref<ConnectionKind>(saved.kind)
const providerId = ref<CloudProviderId>(saved.provider ?? 'openrouter')
const customUrl = ref(saved.kind === 'custom' ? saved.baseUrl : 'http://127.0.0.1:1234/v1')
const model = ref<string | null>(saved.model)

const status = ref<ConnectionStatus | null>(null)
const checking = ref(false)

const provider = computed(() => cloudProvider(providerId.value)!)

const draft = computed<ConnectionSettings>(() => {
  if (kind.value === 'cloud') {
    return { kind: 'cloud', provider: providerId.value, baseUrl: provider.value.baseUrl, model: model.value }
  }
  const baseUrl = kind.value === 'ollama' ? OLLAMA_BASE_URL : customUrl.value.trim()
  return { kind: kind.value, baseUrl, model: model.value }
})

// --- API key -----------------------------------------------------------------------
// Keys live in the main process. This page knows whether one is saved, and holds
// the one being typed until the connection is saved.

const keys = ref<KeysStatus>({ slots: [], persistent: true })
const typedKey = ref('')
const slot = computed(() => keySlot(draft.value))
const hasSavedKey = computed(() => slot.value !== null && keys.value.slots.includes(slot.value))
const hasKey = computed(() => hasSavedKey.value || typedKey.value.trim() !== '')

// A key typed for one service must not be tried on another.
watch(slot, () => (typedKey.value = ''))

// A server at an address the user typed rarely wants a key: the field stays out of
// the way until it is asked for, by the user or by the server.
const wantsCustomKey = ref(false)
const showCustomKey = computed(
  () =>
    wantsCustomKey.value ||
    hasSavedKey.value ||
    (status.value !== null && !status.value.ok && status.value.error.includes('API key')),
)

async function removeKey(): Promise<void> {
  if (!slot.value) return
  keys.value = await window.api.keys.remove(slot.value)
  status.value = null
  if (kind.value === 'custom') void check()
}

// --- Models --------------------------------------------------------------------------

// "On this computer" has its own list (LocalModels.vue): what Ollama holds, as the engine reports it.
const models = computed(() => (kind.value === 'ollama' ? (engineStore.status?.models ?? []) : status.value?.ok ? status.value.models : []))
const canSave = computed(() => !checking.value && models.value.some((item) => item.id === model.value))

// Online services list hundreds of models: a search box appears when the list is long.
const modelSearch = ref('')
const visibleModels = computed(() => {
  const query = modelSearch.value.trim().toLowerCase()
  if (!query) return models.value
  return models.value.filter((item) => `${item.id} ${item.name ?? ''}`.toLowerCase().includes(query))
})

const ollamaPill = computed(() => {
  const engine = engineStore.status
  if (kind.value !== 'ollama' || !engine) return null
  if (engine.state === 'unsupported') return { ok: false, text: 'Not available' }
  if (engine.state === 'missing') return { ok: false, text: 'One download' }
  const count = engine.models.length
  const what = `${count} ${count === 1 ? 'model' : 'models'}`
  return { ok: count > 0, text: engine.state === 'yours' ? `Your Ollama · ${what}` : count > 0 ? `Ready · ${what}` : 'No model yet' }
})

let latestCheck = 0

async function check(): Promise<void> {
  const thisCheck = ++latestCheck

  // On this computer: the engine says what is there, and is started if it takes that to know.
  if (kind.value === 'ollama') {
    checking.value = true
    const engine = await engineStore.load(true)
    if (thisCheck !== latestCheck) return
    status.value = null
    checking.value = false
    // Keep the chosen model if it is there. Otherwise the app's own first, the largest that is installed.
    if (!engine.models.some((item) => item.id === model.value)) {
      const offered = engine.offers.findLast((offer) => offer.installed)
      const held = offered && engine.models.find((item) => sameOllamaModel(item.id, offered.id))
      model.value = held?.id ?? engine.models[0]?.id ?? null
    }
    return
  }

  // An online service cannot be asked anything without a key.
  if (kind.value === 'cloud' && !hasKey.value) {
    status.value = null
    checking.value = false
    return
  }

  checking.value = true
  const result = await window.api.connection.test(toPlain(draft.value), typedKey.value.trim() || undefined)

  // A newer test was started while this one was running: ignore the stale answer.
  if (thisCheck !== latestCheck) return

  status.value = result
  checking.value = false
  modelSearch.value = ''

  // Keep the chosen model if the server has it, otherwise preselect the first one.
  if (result.ok && !result.models.some((item) => item.id === model.value)) {
    model.value = result.models[0]?.id ?? null
  }
}

function choose(next: ConnectionKind): void {
  if (next === kind.value) return
  kind.value = next
  status.value = null
  void check()
}

function chooseProvider(next: CloudProviderId): void {
  if (next === providerId.value) return
  providerId.value = next
  status.value = null
  // Wait for the key field to follow the new service before testing.
  void nextTick(check)
}

async function save(): Promise<void> {
  // The key that was just tested is saved along with the connection.
  if (slot.value && typedKey.value.trim()) {
    keys.value = await window.api.keys.set(slot.value, typedKey.value.trim())
    typedKey.value = ''
  }
  await settingsStore.update({ connection: draft.value })
  await connectionStore.check()
  emit('saved')
}

// --- What leaves the computer ------------------------------------------------------------

const destination = computed(() => {
  if (kind.value === 'cloud') return provider.value.name
  if (kind.value === 'custom' && !isLocalAddress(customUrl.value)) {
    try {
      return new URL(customUrl.value.trim()).host
    } catch {
      return 'that server'
    }
  }
  return null // Everything stays on this computer.
})

watch(
  (): ConnectionChoice => ({
    kind: kind.value,
    service: kind.value === 'cloud' ? provider.value.name : null,
    leaves: destination.value !== null,
    found: kind.value !== 'ollama' && status.value?.ok ? status.value.models.length : null,
    failed: kind.value !== 'ollama' && status.value?.ok === false,
  }),
  (choice, before) => {
    if (!before || (Object.keys(choice) as (keyof ConnectionChoice)[]).some((key) => choice[key] !== before[key])) emit('looking', choice)
  },
  { immediate: true },
)

onMounted(async () => {
  keys.value = await window.api.keys.status()
  await check()
})

// Looking at "On this computer" may have started the app's own Ollama. If the
// connection that was kept is another one, it has nothing to do.
onBeforeUnmount(() => window.api.engine.rest())
</script>

<template>
  <div class="picker">
    <div class="options" role="radiogroup" aria-label="Where replies come from">
      <label class="option" :class="{ selected: kind === 'ollama' }">
        <input type="radio" class="sr-only" name="connection" :checked="kind === 'ollama'" @change="choose('ollama')" />
        <span class="radio" />
        <span class="icon"><Cpu :size="18" :stroke-width="1.8" /></span>
        <span class="option-text">
          <span class="option-title">On this {{ deviceName() }}</span>
          <span class="option-description">Private and offline. SillySimple runs the model itself, or uses your Ollama if you have one: nothing else to install.</span>
        </span>
        <span v-if="ollamaPill" class="pill" :class="{ ok: ollamaPill.ok }">
          <Check v-if="ollamaPill.ok" :size="13" :stroke-width="2.4" />{{ ollamaPill.text }}
        </span>
      </label>

      <label class="option" :class="{ selected: kind === 'custom' }">
        <input type="radio" class="sr-only" name="connection" :checked="kind === 'custom'" @change="choose('custom')" />
        <span class="radio" />
        <span class="icon"><Server :size="18" :stroke-width="1.8" /></span>
        <span class="option-text">
          <span class="option-title">Another server</span>
          <span class="option-description">LM Studio, KoboldCpp, llama.cpp, Ollama on another computer, or any OpenAI-compatible address.</span>
        </span>
      </label>

      <label class="option" :class="{ selected: kind === 'cloud' }">
        <input type="radio" class="sr-only" name="connection" :checked="kind === 'cloud'" @change="choose('cloud')" />
        <span class="radio" />
        <span class="icon"><Cloud :size="18" :stroke-width="1.8" /></span>
        <span class="option-text">
          <span class="option-title">Online service</span>
          <span class="option-description">Claude, OpenAI, Mistral or OpenRouter, with your own API key.</span>
        </span>
      </label>
    </div>

    <div v-if="kind === 'custom'" class="details">
      <div class="url-row">
        <input
          v-model="customUrl"
          class="field"
          type="text"
          spellcheck="false"
          aria-label="Server address"
          placeholder="http://127.0.0.1:1234/v1"
          @keydown.enter="check"
        />
        <button type="button" class="btn" :disabled="checking" @click="check">Check</button>
      </div>
      <button v-if="!showCustomKey" type="button" class="link key-link" @click="wantsCustomKey = true">
        This server needs an API key
      </button>
      <ApiKeyField
        v-else
        v-model="typedKey"
        :saved="hasSavedKey"
        :persistent="keys.persistent"
        :checking="checking"
        placeholder="API key of this server"
        @check="check"
        @remove="removeKey"
      />
    </div>

    <div v-if="kind === 'cloud'" class="details">
      <div class="providers" role="radiogroup" aria-label="Online service">
        <label
          v-for="item in CLOUD_PROVIDERS"
          :key="item.id"
          class="provider"
          :class="{ selected: item.id === providerId }"
        >
          <input
            type="radio"
            class="sr-only"
            name="provider"
            :checked="item.id === providerId"
            @change="chooseProvider(item.id)"
          />
          {{ item.name }}
        </label>
      </div>

      <p class="provider-note">
        {{ provider.description }}
        <a :href="provider.keyUrl" target="_blank" rel="noreferrer">
          Get your key from {{ provider.name }}<ExternalLink :size="12" :stroke-width="2" />
        </a>
      </p>

      <ApiKeyField
        v-model="typedKey"
        :saved="hasSavedKey"
        :persistent="keys.persistent"
        :checking="checking"
        :placeholder="provider.keyPlaceholder"
        @check="check"
        @remove="removeKey"
      />

    </div>

    <p v-if="!keys.persistent && (kind === 'cloud' || showCustomKey)" class="notice">
      This computer has no secure place to keep keys, so yours is only kept until you quit the app.
    </p>

    <LocalModels v-if="kind === 'ollama'" v-model="model" />

    <div v-else class="result" aria-live="polite">
      <p v-if="checking && !status" class="notice">Looking for models…</p>

      <p v-else-if="status && !status.ok" class="notice error">
        {{ status.error }}
        <button type="button" class="link" @click="check">Try again</button>
      </p>

      <p v-else-if="status && models.length === 0" class="notice">
        The server answers but has no model yet. Download one, then
        <button type="button" class="link" @click="check">check again</button>.
      </p>

      <div v-else-if="models.length" class="models">
        <div class="models-head">
          <span class="eyebrow">Model</span>
          <label v-if="models.length > 8" class="model-search">
            <Search :size="13" :stroke-width="2" />
            <input v-model="modelSearch" type="text" placeholder="Search models" aria-label="Search models" />
          </label>
        </div>
        <label v-for="item in visibleModels" :key="item.id" class="model" :class="{ selected: item.id === model }">
          <input v-model="model" type="radio" class="sr-only" name="model" :value="item.id" />
          <span class="radio small" />
          <span class="model-id">{{ item.id }}</span>
          <span v-if="item.name" class="model-name">{{ item.name }}</span>
          <span v-if="item.sizeBytes" class="model-size">{{ formatBytes(item.sizeBytes) }}</span>
          <span v-else-if="item.contextLength" class="model-size">{{ formatContextLength(item.contextLength) }} context</span>
        </label>
        <p v-if="visibleModels.length === 0" class="no-match">No model matches “{{ modelSearch }}”.</p>
      </div>
    </div>

    <div class="actions">
      <span v-if="destination" class="privacy leaves">
        <Cloud :size="14" :stroke-width="1.8" />Your chats are sent to {{ destination }} to write the replies.
      </span>
      <span v-else class="privacy">
        <Lock :size="14" :stroke-width="1.8" />Your chats never leave this {{ deviceName() }}.
      </span>
      <slot name="secondary" />
      <button type="button" class="btn btn-primary" :disabled="!canSave" @click="save">{{ saveLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  background: var(--bg-panel);
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
  border: 1.5px solid #685042;
  border-radius: 50%;
}
.radio.small {
  width: 16px;
  height: 16px;
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
  color: var(--text-dim);
}

.pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--bg-button);
  border-radius: var(--radius-pill);
  color: var(--text-muted);
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
  gap: 8px;
}

.providers {
  display: flex;
  gap: 8px;
}
.provider {
  flex: 1;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel);
  border: 1.5px solid var(--border-field);
  border-radius: var(--radius);
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}
.provider:hover:not(.selected) {
  border-color: var(--border-hover);
}
.provider.selected {
  background: var(--accent-bg);
  border-color: var(--accent-hover);
  color: var(--text);
}
.provider:has(:focus-visible) {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
.provider-note {
  font-size: 12px;
  color: var(--text-dim);
}
.provider-note a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  font-weight: 600;
}
.url-row .field {
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.result {
  min-height: 44px;
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
.key-link {
  align-self: flex-start;
  font-size: 12px;
}

.models {
  /* Each model's radio is hidden (.sr-only, absolute): placed against this box, it scrolls
     with the list. Without it, the radio of a model far down a long list (OpenRouter has
     hundreds) sat far below the window, and choosing it scrolled the whole app out of sight. */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 230px;
  padding: 0 12px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
  overflow-y: auto;
}
/* Stays in view while the list scrolls under it. */
.models-head {
  position: sticky;
  top: 0;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  padding: 12px 4px 6px 12px;
  background: var(--bg-sunken);
}
.model-search {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 220px;
  height: 28px;
  padding: 0 8px;
  background: var(--bg-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  color: var(--text-faint);
}
.model-search:focus-within {
  border-color: var(--accent-strong);
}
.model-search input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--text);
  user-select: text;
}
.no-match {
  padding: 9px 12px;
  color: var(--text-faint);
}

.model {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--radius);
  cursor: pointer;
}
.model:hover {
  background: var(--bg-panel);
}
.model.selected {
  background: #3d2416;
}
.model-id {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-name {
  max-width: 40%;
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-faint);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.privacy {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.privacy.leaves {
  color: var(--warning-text);
}
</style>
