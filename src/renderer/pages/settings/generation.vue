<script setup lang="ts">
import { engineContextLength } from '@core/engine/models'
import { AUTO_CONTEXT_LIMIT, effectiveContextSize } from '@core/prompt/context'
import { DEFAULT_SYSTEM_PROMPT } from '@shared/defaults'

// The simple mode from the mockups: two sliders and the system prompt.
// The advanced mode (every sampler) is not built yet.

const settingsStore = useSettingsStore()
const connectionStore = useConnectionStore()
const engineStore = useEngineStore()

/**
 * Replies come from the app's own Ollama (not the user's, not another server): a size set
 * by hand is then the one the app loads the model with, not only what it sends.
 */
const ownEngine = computed(
  () => settingsStore.connection.kind === 'ollama' && engineStore.status !== null && engineStore.status.state !== 'yours',
)
/** What the app's own Ollama loads models with on this computer, when nothing is set by hand. */
const ownAutomatic = computed(() => (engineStore.status ? engineContextLength(engineStore.status.memoryBytes) : null))

// Common context lengths, for when the size is set by hand.
const contextSizes = [2048, 4096, 8192, 16384, 32768, 65536, 131072]

function saveContextSize(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  void settingsStore.update({
    generation: value === 'auto' ? { autoContext: true } : { autoContext: false, contextSize: Number(value) },
  })
}

/** What "Automatic" amounts to right now, in words. */
const autoContextNote = computed(() => {
  const detected = connectionStore.detectedContext
  const used = effectiveContextSize(settingsStore.generation, detected).toLocaleString('en')
  if (!detected) return `The model server does not say what it runs with, so ${used} tokens are used.`
  if (detected > AUTO_CONTEXT_LIMIT) {
    return `The model can read ${detected.toLocaleString('en')} tokens. ${used} are used, to keep replies fast and affordable; pick a size by hand to go higher.`
  }
  return `The model runs with ${used} tokens.`
})

onMounted(() => {
  void connectionStore.refreshContext()
  void engineStore.load()
})

function saveSystemPrompt(event: Event): void {
  void settingsStore.update({ generation: { systemPrompt: (event.target as HTMLTextAreaElement).value } })
}

function resetSystemPrompt(): void {
  void settingsStore.update({ generation: { systemPrompt: DEFAULT_SYSTEM_PROMPT } })
}
</script>

<template>
  <div class="page">
    <header>
      <h1 class="title-serif">Generation</h1>
      <p>How the model writes its replies.</p>
    </header>

    <section class="card">
      <AppSlider
        label="Creativity (temperature)"
        :value="settingsStore.generation.temperature"
        :min="0"
        :max="1.5"
        :step="0.05"
        :format="(value) => value.toFixed(2)"
        @commit="(temperature) => settingsStore.update({ generation: { temperature } })"
      />
      <AppSlider
        label="Reply length"
        :value="settingsStore.generation.maxTokens"
        :min="80"
        :max="800"
        :step="20"
        :format="formatReplyLength"
        @commit="(maxTokens) => settingsStore.update({ generation: { maxTokens } })"
      />
      <label class="select-row">
        <span class="toggle-text">
          <span class="toggle-title">Context size</span>
          <span class="toggle-hint">
            How much the model can read at once. When a chat grows past it, the oldest messages are summed up, or left out
            if long memory is turned off.
            <template v-if="ownEngine && settingsStore.generation.autoContext">
              SillySimple loads the model with {{ ownAutomatic?.toLocaleString('en') }} tokens on this computer. Pick a
              size to change it: more keeps more of a long chat in view, but takes more memory and makes long chats
              slower to read.
            </template>
            <template v-else-if="ownEngine">
              SillySimple loads the model with this size. More takes more memory, and long chats are read more slowly.
              The next reply loads the model again, which takes a moment.
            </template>
            <template v-else-if="settingsStore.generation.autoContext">{{ autoContextNote }}</template>
            <template v-else>Set it to the context length your model is loaded with.</template>
          </span>
        </span>
        <select
          class="field"
          aria-label="Context size"
          :value="settingsStore.generation.autoContext ? 'auto' : settingsStore.generation.contextSize"
          @change="saveContextSize"
        >
          <option value="auto">
            Automatic<template v-if="ownEngine && ownAutomatic"> · {{ formatTokens(ownAutomatic) }}</template>
          </option>
          <option v-for="size in contextSizes" :key="size" :value="size">
            {{ formatTokens(size) }} · {{ size.toLocaleString('en') }} tokens
          </option>
        </select>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="settingsStore.generation.memory"
          @change="settingsStore.update({ generation: { memory: ($event.target as HTMLInputElement).checked } })"
        />
        <span class="toggle-text">
          <span class="toggle-title">Remember long chats</span>
          <span class="toggle-hint">
            When a chat grows past the context size, its oldest messages are summed up for the model instead of being
            left out. Summing up takes a moment, now and then. You can read what is remembered in the Memory tab of the
            chat.
          </span>
        </span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="settingsStore.generation.keepPlace"
          @change="settingsStore.update({ generation: { keepPlace: ($event.target as HTMLInputElement).checked } })"
        />
        <span class="toggle-text">
          <span class="toggle-title">Keep the place and the clothes</span>
          <span class="toggle-hint">
            Models tend to change a scene without warning: you are talking in the kitchen and the next reply is on the
            sofa, a skirt turns into trousers. With this, the app notes where the scene is and what the character
            wears after each reply (one short question to the model), and tells the character to stay there until you
            go somewhere else, dressed the same until the story changes it. You can read and correct both in the Memory
            tab of the chat.
          </span>
        </span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="settingsStore.generation.loreByMeaning"
          @change="settingsStore.update({ generation: { loreByMeaning: ($event.target as HTMLInputElement).checked } })"
        />
        <span class="toggle-text">
          <span class="toggle-title">Bring in lorebook notes by meaning</span>
          <span class="toggle-hint">
            A lorebook note is given to the model when one of its keywords comes up in the chat. With this, it is given
            too when the chat talks about it in other words: "your granny" for a note about the grandmother. It uses the
            small model that reads moods, when replies come from this computer; elsewhere the keywords work alone.
          </span>
        </span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="settingsStore.generation.thinking"
          @change="settingsStore.update({ generation: { thinking: ($event.target as HTMLInputElement).checked } })"
        />
        <span class="toggle-text">
          <span class="toggle-title">Let the model think before replying</span>
          <span class="toggle-hint">
            For thinking models (Gemma, Qwen, DeepSeek…). Slower: the model reasons first, then writes.
          </span>
        </span>
      </label>
    </section>

    <section class="card">
      <div class="card-head">
        <label for="system-prompt" class="card-title">System prompt</label>
        <button
          type="button"
          class="reset"
          :disabled="settingsStore.generation.systemPrompt === DEFAULT_SYSTEM_PROMPT"
          @click="resetSystemPrompt"
        >
          Reset to default
        </button>
      </div>
      <textarea
        id="system-prompt"
        class="field prompt"
        rows="4"
        spellcheck="false"
        :value="settingsStore.generation.systemPrompt"
        @change="saveSystemPrompt"
      />
      <!-- v-pre: show the braces as they are, do not treat them as Vue expressions -->
      <p v-pre class="hint">Macros {{char}}, {{user}} and {{persona}} are filled in automatically.</p>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="settingsStore.generation.useCardPrompts"
          @change="
            settingsStore.update({ generation: { useCardPrompts: ($event.target as HTMLInputElement).checked } })
          "
        />
        <span class="toggle-text">
          <span class="toggle-title">Follow the instructions written into character cards</span>
          <span class="toggle-hint">
            Some cards bring their own system prompt. When this is on, it is used for that character instead of the
            one above.
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
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-size: 14px;
  font-weight: 700;
}

.select-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.select-row .toggle-text {
  flex: 1;
}
.select-row select {
  width: 190px;
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
  color: var(--text-faint);
}

.reset {
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
}

.prompt {
  background: var(--bg-sunken);
  font-family: var(--font-mono);
  font-size: 12px;
}

.hint {
  margin-top: -8px;
  font-size: 11px;
  color: var(--text-faint);
}
</style>
