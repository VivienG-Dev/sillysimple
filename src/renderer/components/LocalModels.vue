<script setup lang="ts">
import { Check, Download, Trash2, X } from '@lucide/vue'
import { cleanModelName } from '@core/engine/models'
import { sameOllamaModel } from '@core/providers/ollama'
import type { ModelInfo, ModelOffer } from '@shared/types'

// "On this computer", inside the connection picker: the models the app offers for this
// computer, those Ollama already holds, and the download of one. The user never installs
// anything by hand: the first download brings the program that runs models with it.

/** The model that is picked: its name in Ollama. Only a model that is installed can be. */
const model = defineModel<string | null>({ required: true })

const engineStore = useEngineStore()
const { confirm } = useConfirm()

const status = computed(() => engineStore.status)

/**
 * What decides which model runs quickly. On a Mac, its memory (shared with the graphics);
 * on a PC, the graphics card's own, and the computer's memory only for what does not fit on it.
 */
const hardware = computed(() => {
  const now = status.value
  if (!now) return ''
  if (now.graphics === undefined) return `${formatMemory(now.memoryBytes)} of memory`
  if (now.graphics === null) return `${formatMemory(now.memoryBytes)} of memory · no graphics card found`
  return `${now.graphics.name.replace(/^NVIDIA\s+/i, '')} · ${formatMemory(now.graphics.memoryBytes)}`
})
const job = computed(() => engineStore.job)

// What went wrong the last time this was on screen is old news.
onMounted(() => (engineStore.error = ''))

/** The name Ollama holds a model under, when it holds it. */
function installedId(id: string): string | null {
  return status.value?.models.find((item) => sameOllamaModel(item.id, id))?.id ?? null
}

const isPicked = (id: string): boolean => model.value !== null && sameOllamaModel(model.value, id)

/** What Ollama holds that is not one of the app's own models: the user's, or one they typed the name of. */
const others = computed<ModelInfo[]>(() => {
  const current = status.value
  if (!current) return []
  return current.models.filter((item) => !current.offers.some((offer) => sameOllamaModel(offer.id, item.id)))
})

/** How much a click on "Download" brings: the model, and the engine with the very first one. */
function downloadBytes(offer: ModelOffer): number {
  return offer.bytes + (status.value?.state === 'missing' ? status.value.engineBytes : 0)
}

// --- Downloading -------------------------------------------------------------------

/** The model that has just arrived: the mascot is glad about it for a moment, on its line. */
const justArrived = ref<string | null>(null)
let gladTimer = 0

// On the first launch the guide is the one that is glad (see useGuide.ts): one mascot is enough.
const guide = inject(GUIDE, null)

function celebrate(id: string): void {
  if (guide) return
  justArrived.value = id
  clearTimeout(gladTimer)
  gladTimer = window.setTimeout(() => (justArrived.value = null), 3200)
}
onBeforeUnmount(() => clearTimeout(gladTimer))

async function download(id: string): Promise<void> {
  // Once it is there it becomes the model picked, unless the user picked another one meanwhile.
  const picked = model.value
  if (!(await engineStore.download(id))) return
  if (model.value === picked) model.value = installedId(id) ?? id
  celebrate(id)
}

/** A download that is not of one of the rows above: a name the user typed. */
const typedJob = computed(() => {
  const current = job.value
  if (!current || status.value?.offers.some((offer) => sameOllamaModel(offer.id, current.model))) return null
  return current
})

const adding = ref(false)
const typed = ref('')

async function downloadTyped(): Promise<void> {
  if (!typed.value.trim() || job.value) return
  // What was typed may be a whole command or an address: the name is what is left of it.
  const name = cleanModelName(typed.value) ?? typed.value.trim()
  const picked = model.value
  if (await engineStore.download(name)) {
    if (model.value === picked) model.value = installedId(name) ?? model.value
    celebrate(installedId(name) ?? name)
    typed.value = ''
    adding.value = false
  }
}

// --- Removing ----------------------------------------------------------------------

async function remove(id: string, name: string, bytes?: number): Promise<void> {
  const frees = bytes ? `It frees ${formatBytes(bytes)} on this ${deviceName()}. ` : ''
  const shared = status.value?.state === 'yours' ? ' Your Ollama will not have it either.' : ''
  const confirmed = await confirm({
    title: `Remove ${name}?`,
    message: `${frees}You can download it again whenever you want.${shared}`,
    confirmLabel: 'Remove model',
  })
  if (!confirmed) return

  const wasPicked = isPicked(id)
  if ((await engineStore.remove(id)) && wasPicked) {
    // Something has to be picked if anything is left: the app's own models first.
    const left = status.value
    model.value = left?.offers.findLast((offer) => offer.installed)?.id ?? left?.models[0]?.id ?? null
    if (model.value) model.value = installedId(model.value) ?? model.value
  }
}
</script>

<template>
  <div class="local">
    <p v-if="!status" class="notice">Looking at this {{ deviceName() }}…</p>

    <template v-else>
      <p v-if="status.state === 'unsupported'" class="notice">
        SillySimple cannot run a model by itself on this kind of computer. Pick “Another server” or “Online service” above.
      </p>
      <p v-else-if="status.state === 'missing'" class="intro">
        Nothing to install by hand. Pick a model below: SillySimple downloads it, along with the engine that runs it
        (Ollama, {{ formatBytes(status.engineBytes) }}, once).
      </p>
      <p v-else-if="status.state === 'yours'" class="intro">
        Ollama is open on this {{ deviceName() }}, so SillySimple uses it instead of running a second one. What you
        download here is in your Ollama too.
      </p>

      <div v-if="status.state !== 'unsupported'" class="models" role="radiogroup" aria-label="Model">
        <div class="head">
          <span class="eyebrow">Models for this {{ deviceName() }}</span>
          <span class="memory" :title="status.graphics ? `${formatMemory(status.memoryBytes)} of memory` : undefined">{{ hardware }}</span>
        </div>
        <p v-if="status.graphics === null" class="left-out">
          Without a graphics card, models run on the processor alone: replies take a while. An online service, above,
          is quicker on this {{ deviceName() }}.
        </p>

        <div
          v-for="offer in status.offers"
          :key="offer.id"
          class="row"
          :class="{ selected: offer.installed && isPicked(offer.id), waiting: !offer.installed }"
        >
          <label class="pick">
            <input
              v-model="model"
              type="radio"
              class="sr-only"
              name="model"
              :value="installedId(offer.id) ?? offer.id"
              :disabled="!offer.installed"
            />
            <span class="radio" />
            <span class="text">
              <span class="name">
                <!-- The exact model in brackets, for who knows them by that name. -->
                <span class="title">{{ offer.name }} <span class="variant">({{ offer.variant }})</span></span>
                <span v-if="offer.recommended" class="badge">Recommended</span>
              </span>
              <span class="blurb">{{ offer.blurb }}</span>
              <span v-if="offer.fitsGraphics === false && status.graphics" class="blurb slower">
                Larger than the graphics card: part of it runs on the processor, and replies are slower.
              </span>
            </span>
          </label>

          <template v-if="offer.installed">
            <!-- Just arrived: the mascot is glad about it, where the size will be. -->
            <AppMascot v-if="justArrived !== null && sameOllamaModel(justArrived, offer.id)" :size="30" mood="happy" />
            <span v-else class="size">{{ formatBytes(offer.bytes) }}</span>
            <span class="ready"><Check :size="13" :stroke-width="2.4" />On this {{ deviceName() }}</span>
            <button
              type="button"
              class="icon-button"
              :aria-label="`Remove ${offer.name}`"
              :title="`Remove ${offer.name}`"
              :disabled="job !== null"
              @click="remove(offer.id, `${offer.name} (${offer.variant})`, offer.bytes)"
            >
              <Trash2 :size="14" :stroke-width="1.8" />
            </button>
          </template>
          <button
            v-else-if="job?.model !== offer.id"
            type="button"
            class="btn btn-small"
            :disabled="job !== null"
            @click="download(offer.id)"
          >
            <Download :size="13" :stroke-width="2" />Download · {{ formatBytes(downloadBytes(offer)) }}
          </button>

          <DownloadProgress v-if="job && job.model === offer.id" :job="job" :label="offer.name" />
        </div>

        <p v-if="status.tooLarge > 0" class="left-out">
          {{ status.tooLarge === 1 ? 'One larger model is not offered: it needs' : `${status.tooLarge} larger models are not offered: they need` }}
          more memory than this {{ deviceName() }} has.
        </p>

        <template v-if="others.length > 0">
          <div class="head"><span class="eyebrow">Also in Ollama</span></div>
          <div v-for="item in others" :key="item.id" class="row plain" :class="{ selected: isPicked(item.id) }">
            <label class="pick">
              <input v-model="model" type="radio" class="sr-only" name="model" :value="item.id" />
              <span class="radio" />
              <span class="model-id">{{ item.id }}</span>
            </label>
            <AppMascot v-if="justArrived !== null && sameOllamaModel(justArrived, item.id)" :size="30" mood="happy" />
            <span v-else-if="item.sizeBytes" class="size">{{ formatBytes(item.sizeBytes) }}</span>
            <button
              type="button"
              class="icon-button"
              :aria-label="`Remove ${item.id}`"
              :title="`Remove ${item.id}`"
              :disabled="job !== null"
              @click="remove(item.id, item.id, item.sizeBytes)"
            >
              <Trash2 :size="14" :stroke-width="1.8" />
            </button>
          </div>
        </template>

        <!-- For the curious: any model of Ollama's library, or a GGUF file on Hugging Face. -->
        <div class="another">
          <button v-if="!adding && !typedJob" type="button" class="link" @click="adding = true">Another model…</button>
          <form v-else-if="!typedJob" class="another-form" @submit.prevent="downloadTyped">
            <input
              v-model="typed"
              class="field"
              type="text"
              spellcheck="false"
              autocomplete="off"
              aria-label="Name of the model"
              placeholder="A name from ollama.com, or hf.co/someone/model-GGUF"
            />
            <button type="submit" class="btn btn-small" :disabled="!typed.trim() || job !== null">
              <Download :size="13" :stroke-width="2" />Download
            </button>
            <button type="button" class="icon-button" aria-label="Close" @click="adding = false"><X :size="14" :stroke-width="2" /></button>
          </form>
          <div v-else class="typed">
            <span class="model-id">{{ typedJob.model }}</span>
            <DownloadProgress :job="typedJob" :label="typedJob.model" />
          </div>
        </div>
      </div>

      <!-- A download that failed, or the app's own Ollama that is installed and does not start:
           without the second the list would just be empty. -->
      <div v-if="engineStore.error || status.problem" class="notice error" role="alert">
        <AppMascot v-if="!guide" :size="34" mood="worried" />
        <p>{{ engineStore.error || status.problem }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.local {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro {
  padding: 0 2px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
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
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-text);
}

.models {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px 10px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 8px 4px;
}
.memory {
  font-size: 11.5px;
  color: var(--text-faint);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 9px 8px;
  border-radius: var(--radius);
}
.row:hover {
  background: var(--bg-panel);
}
.row.selected {
  background: var(--accent-bg);
}
.row:has(:focus-visible) {
  outline: 2px solid var(--accent-strong);
  outline-offset: -2px;
}

.pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.waiting .pick {
  cursor: default;
}

.radio {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border: 1.5px solid #685042;
  border-radius: 50%;
}
.selected .radio {
  border: 5px solid var(--accent-strong);
}
/* Not on this computer yet: there is nothing to pick. */
.waiting .radio {
  border-style: dashed;
  opacity: 0.6;
}

.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  font-size: 13.5px;
  font-weight: 700;
}
.title {
  white-space: nowrap;
}
.blurb {
  font-size: 12px;
  color: var(--text-dim);
}
.blurb.slower {
  color: var(--text-faint);
}
.badge {
  padding: 1px 7px;
  background: var(--bg-selected);
  border-radius: var(--radius-pill);
  color: var(--accent-soft);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

.model-id {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-faint);
}

.ready {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--success-text);
  white-space: nowrap;
}

.icon-button {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-faint);
}
.icon-button:hover:not(:disabled) {
  background: var(--bg-button);
  color: var(--text);
}

.variant {
  font-weight: 500;
  color: var(--text-dim);
}

/* A name that was typed, and its download under it. */
.typed {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.left-out {
  padding: 4px 8px 2px;
  font-size: 12px;
  color: var(--text-faint);
}

.another {
  padding: 8px 8px 2px;
}
.another-form {
  display: flex;
  align-items: center;
  gap: 8px;
}
.another-form .field {
  height: 30px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.link {
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
}
.link:hover {
  text-decoration: underline;
}
</style>
