<script setup lang="ts">
import { LoaderCircle, Play, Square } from '@lucide/vue'
import type { VoiceChoice } from '@shared/types'

// Choosing a voice among those the voice service offers, and listening to it first.
// Used for the voice of everyone (Settings › Voice) and for a character's own (the panel
// beside the chat). A server that has no list of voices gets a box to type a name in.

const props = defineProps<{
  /** The voice chosen, or null: none yet, or "the same as everyone" when `inherit` is given. */
  modelValue: VoiceChoice | null
  /** What the choice of no voice of one's own is called. Left out: a voice has to be picked. */
  inherit?: string
  /** The voice heard when none is chosen here: the one of everyone. */
  fallback?: VoiceChoice | null
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [voice: VoiceChoice | null] }>()

const voiceStore = useVoiceStore()
onMounted(() => void voiceStore.ensureChecked())

const status = computed(() => voiceStore.status)
/** The service has no list of voices: the user types the name of one. */
const typed = computed(() => status.value?.ok === true && !status.value.listed)
/** The chosen voice is not in the list (any more): it is still shown, under its name. */
const missing = computed(() => props.modelValue !== null && !voiceStore.voices.some((voice) => voice.id === props.modelValue!.id))

function pick(event: Event): void {
  const id = (event.target as HTMLSelectElement | HTMLInputElement).value.trim()
  if (!id) {
    emit('update:modelValue', null)
    return
  }
  const voice = voiceStore.voices.find((item) => item.id === id)
  emit('update:modelValue', { id, name: voice?.name ?? (props.modelValue?.id === id ? props.modelValue.name : id) })
}

/** The voice the listen button plays: the one chosen here, or else the one of everyone. */
const heard = computed(() => props.modelValue ?? props.fallback ?? null)
const sample = computed(() => (heard.value ? voiceStore.stateOf(voiceStore.sampleKey(heard.value.id)) : 'idle'))
const sampleProblem = computed(() =>
  heard.value && voiceStore.problem?.key === voiceStore.sampleKey(heard.value.id) ? voiceStore.problem.message : '',
)
</script>

<template>
  <div class="voice-picker">
    <div class="row">
      <input
        v-if="typed"
        class="field"
        type="text"
        spellcheck="false"
        :aria-label="label"
        :value="modelValue?.id ?? ''"
        :placeholder="inherit ?? 'Name of a voice, as the server calls it'"
        :disabled="disabled"
        @change="pick"
      />
      <select v-else class="field" :aria-label="label" :value="modelValue?.id ?? ''" :disabled="disabled || voiceStore.checking" @change="pick">
        <option value="">{{ inherit ?? (voiceStore.checking ? 'Loading the voices…' : 'Pick a voice…') }}</option>
        <option v-if="modelValue && missing" :value="modelValue.id">{{ modelValue.name }}</option>
        <option v-for="voice in voiceStore.voices" :key="voice.id" :value="voice.id">
          {{ voice.name }}{{ voice.description ? ` · ${voice.description}` : '' }}
        </option>
      </select>
      <button
        type="button"
        class="btn listen"
        :class="{ on: sample !== 'idle' }"
        :disabled="!heard"
        :aria-label="sample === 'idle' ? `Listen to ${heard?.name ?? 'this voice'}` : 'Stop'"
        :title="sample === 'idle' ? 'Listen to this voice' : 'Stop'"
        @click="heard && voiceStore.toggleSample(heard.id)"
      >
        <LoaderCircle v-if="sample === 'loading'" class="spin" :size="14" />
        <Square v-else-if="sample === 'playing'" :size="12" :stroke-width="2.4" fill="currentColor" />
        <Play v-else :size="13" :stroke-width="2" fill="currentColor" />
      </button>
    </div>
    <p v-if="sampleProblem" class="problem" role="alert">{{ sampleProblem }}</p>
    <p v-else-if="status && !status.ok" class="problem">{{ status.error }}</p>
  </div>
</template>

<style scoped>
.voice-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.row {
  display: flex;
  gap: 6px;
}
.field {
  flex: 1;
  min-width: 0;
  text-overflow: ellipsis;
}
.listen {
  flex-shrink: 0;
  width: 32px;
  padding: 0;
  justify-content: center;
}
.listen.on {
  background: var(--bg-selected);
  border-color: var(--border-hover);
  color: var(--accent-text);
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
.problem {
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger-text);
}
</style>
