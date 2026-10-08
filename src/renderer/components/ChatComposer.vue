<script setup lang="ts">
import { ArrowUp, ChevronsRight, MessageSquareText, Square } from '@lucide/vue'
import type { SceneDirection } from '@shared/types'

// The message box. Enter sends, Shift + Enter adds a line.
// While a reply is being written, the send button becomes a stop button.
//
// Above it, a row of buttons to move the story along without writing: "More…" has the
// character go on by itself, the others give the next reply a stage direction
// (see src/core/prompt/direction.ts). In the box, beside the send button, "OOC" writes
// "(OOC: )", the habit of roleplay for a word to the model outside the story ("write longer
// replies"), and leaves the cursor after the colon. The app does nothing else with it: the
// line is sent as it is, and models know the habit.

const props = defineProps<{
  personaName: string
  busy: boolean
  /** How full the model's context is. See useContextUsage(). */
  context?: { occupiedTokens: number; contextSize: number; droppedCount: number } | null
  /** What "More…" does here, for its tooltip: "Elara carries on without waiting for you". */
  moreHint: string
}>()
const emit = defineEmits<{
  send: [text: string]
  stop: []
  /** The chat goes on without the user. */
  more: []
  /** The next reply follows a stage direction. `text`: what is in the box, to send first. */
  direct: [direction: SceneDirection, text: string]
}>()

/**
 * What is being written. It belongs to the chat, not to this box: the page keeps it, so
 * that it is still there after a look at another character or at the settings.
 */
const text = defineModel<string>('draft', { default: '' })
const textarea = ref<HTMLTextAreaElement | null>(null)

function submit(): void {
  if (props.busy || !text.value.trim()) return
  emit('send', text.value)
  text.value = ''
}

/** A direction goes with what the user wrote, when they wrote something: "I open the door" and something happens. */
function direct(direction: SceneDirection): void {
  if (props.busy) return
  emit('direct', direction, text.value)
  text.value = ''
  textarea.value?.focus()
}

function more(): void {
  if (props.busy || text.value.trim()) return
  emit('more')
  textarea.value?.focus()
}

const hasDraft = computed(() => text.value.trim() !== '')

const OOC_OPEN = '(OOC: '
const OOC_CLOSE = ')'

/**
 * Writes "(OOC: )" where the cursor is (or in place of what is selected), with a space
 * before it when it follows a word, and leaves the cursor before the closing bracket.
 * It goes through the browser's own typing, so Ctrl/⌘ + Z takes it back like anything typed.
 */
function outOfCharacter(): void {
  const el = textarea.value
  if (!el) return
  el.focus()
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const before = el.value.slice(0, start)
  const piece = (before && !/\s$/.test(before) ? ' ' : '') + OOC_OPEN + OOC_CLOSE
  el.setSelectionRange(start, end)
  if (!document.execCommand('insertText', false, piece)) {
    // Without the browser's typing: the same, by hand (Ctrl/⌘ + Z will not take it back).
    text.value = before + piece + el.value.slice(end)
  }
  const caret = start + piece.length - OOC_CLOSE.length
  void nextTick(() => el.setSelectionRange(caret, caret))
}

function onKeydown(event: KeyboardEvent): void {
  // isComposing: do not send while an IME (Japanese, Chinese…) is confirming a word.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

// Grow with the text, up to a limit set in CSS.
async function fitHeight(): Promise<void> {
  await nextTick()
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(text, fitHeight)

onMounted(() => {
  const el = textarea.value
  if (!el) return
  el.focus()
  // A message left unfinished here earlier: carry on at its end.
  if (text.value) {
    void fitHeight()
    el.setSelectionRange(text.value.length, text.value.length)
  }
})

const contextPercent = computed(() =>
  props.context ? Math.min(100, (props.context.occupiedTokens / props.context.contextSize) * 100) : 0,
)
</script>

<template>
  <footer class="composer">
    <div class="directions" role="group" aria-label="Move the story along">
      <button
        type="button"
        class="direction more"
        :title="hasDraft ? 'Send your message first, or empty the box' : moreHint"
        :disabled="busy || hasDraft"
        @click="more"
      >
        <ChevronsRight :size="13" :stroke-width="2.2" />More…
      </button>
      <span class="divider" />
      <button
        v-for="choice in SCENE_DIRECTIONS"
        :key="choice.id"
        type="button"
        class="direction"
        :data-direction="choice.id"
        :title="hasDraft ? `Send your message, and: ${choice.hint.toLowerCase()}` : choice.hint"
        :disabled="busy"
        @click="direct(choice.id)"
      >
        <component :is="choice.icon" :size="12" :stroke-width="2.2" />{{ choice.label }}
      </button>
    </div>
    <div class="box">
      <textarea
        ref="textarea"
        v-model="text"
        rows="2"
        aria-label="Message"
        :placeholder="`Write as ${personaName}… use *asterisks* for actions`"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="ooc"
        aria-label="Out of character: write (OOC: ) in the box"
        title="A word to the AI, outside the story: writes (OOC: ) in the box"
        @click="outOfCharacter"
      >
        <MessageSquareText :size="13" :stroke-width="2.2" />OOC
      </button>
      <button v-if="busy" type="button" class="send stop" aria-label="Stop writing" title="Stop" @click="emit('stop')">
        <Square :size="14" fill="currentColor" />
      </button>
      <button v-else type="button" class="send" aria-label="Send" title="Send" :disabled="!text.trim()" @click="submit">
        <ArrowUp :size="16" :stroke-width="2.2" />
      </button>
    </div>
    <div class="hint">
      <span>Enter to send · Shift + Enter for a new line</span>
      <RouterLink
        v-if="context"
        to="/settings/generation"
        class="context"
        :class="{ full: context.droppedCount > 0 }"
        title="How much of the model's memory this chat fills. Click to change the context size."
      >
        <span v-if="context.droppedCount > 0">
          {{ context.droppedCount }} oldest {{ context.droppedCount === 1 ? 'message' : 'messages' }} left out ·
        </span>
        Context {{ formatTokens(Math.min(context.occupiedTokens, context.contextSize)) }} /
        {{ formatTokens(context.contextSize) }}
        <span class="meter"><span class="meter-fill" :style="{ width: `${contextPercent}%` }" /></span>
      </RouterLink>
    </div>
  </footer>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 28px 16px;
  /* Set by the chat when a picture sits behind it, so the small print stays legible. */
  background: var(--composer-bg, none);
}

.directions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.direction {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  background: var(--message-bg, transparent);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-pill);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.direction:hover:not(:disabled) {
  background: var(--bg-button);
  border-color: var(--border-hover);
  color: var(--text);
}
.direction:disabled {
  opacity: 0.45;
}
.direction.more {
  color: var(--accent-soft);
}

.divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--border-field);
}

.box {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  background: var(--bg-button);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-xl);
}
.box:focus-within {
  border-color: var(--accent-strong);
}

textarea {
  flex: 1;
  max-height: 200px;
  padding: 0;
  resize: none;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: var(--font-prose);
  font-size: 15px;
  line-height: 1.5;
  user-select: text;
}
textarea::placeholder {
  color: var(--text-faint);
}

/* In the box, beside the send button: it writes in the box, it does not move the story. */
.ooc {
  flex-shrink: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.ooc:hover {
  background: var(--bg-button);
  border-color: var(--border-hover);
  color: var(--text);
}

.send {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
}
.send:hover:not(:disabled) {
  background: var(--accent-hover);
}
.send.stop {
  background: var(--bg-selected);
}

.hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--text-ghost);
}

.context {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-ghost);
  white-space: nowrap;
}
.context:hover {
  color: var(--text-muted);
}
.context.full {
  color: var(--warning-text);
}
.meter {
  width: 60px;
  height: 4px;
  display: flex;
  background: var(--border-field);
  border-radius: 4px;
  overflow: hidden;
}
.meter-fill {
  background: var(--accent-strong);
  border-radius: 4px;
}
.context.full .meter-fill {
  background: var(--warning-text);
}
</style>
