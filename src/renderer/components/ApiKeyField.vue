<script setup lang="ts">
import { KeyRound } from '@lucide/vue'

// The field for an API key. A saved key is never shown again, not even in part:
// the app only says that one is saved, and lets the user replace or remove it.

const props = defineProps<{
  /** A key is already saved for this service. */
  saved: boolean
  /** False when this computer cannot encrypt keys: a "saved" key then only lasts until the app quits. */
  persistent: boolean
  placeholder: string
  checking: boolean
}>()
const emit = defineEmits<{ check: []; remove: [] }>()

/** The key being typed. It leaves this component only when the connection is tested or saved. */
const typed = defineModel<string>({ required: true })

/** The user asked to type a new key over the saved one. */
const replacing = ref(false)
const showField = computed(() => !props.saved || replacing.value)

watch(
  () => props.saved,
  () => (replacing.value = false),
)

function cancelReplace(): void {
  replacing.value = false
  typed.value = ''
}
</script>

<template>
  <div class="key">
    <template v-if="showField">
      <input
        v-model="typed"
        class="field"
        type="password"
        autocomplete="off"
        spellcheck="false"
        aria-label="API key"
        :placeholder="placeholder"
        @keydown.enter.prevent="typed.trim() && emit('check')"
      />
      <button type="button" class="btn" :disabled="checking || !typed.trim()" @click="emit('check')">Check</button>
      <button v-if="saved" type="button" class="btn" @click="cancelReplace">Keep the saved key</button>
    </template>

    <template v-else>
      <span class="saved">
        <KeyRound :size="14" :stroke-width="1.8" />
        {{ persistent ? `A key is saved on this ${deviceName()}, encrypted.` : 'A key is set until you quit the app.' }}
      </span>
      <button type="button" class="btn" @click="replacing = true">Replace</button>
      <button type="button" class="btn" @click="emit('remove')">Remove</button>
    </template>
  </div>
</template>

<style scoped>
.key {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.saved {
  flex: 1;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  color: var(--text-muted);
}
</style>
