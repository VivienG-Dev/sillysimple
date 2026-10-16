<script setup lang="ts">
import { Check, ChevronLeft, ChevronRight, Copy, CornerDownRight, LoaderCircle, Pencil, RefreshCw, Trash2, Volume2 } from '@lucide/vue'
import { motion } from 'motion-v'
import type { ChatMessage, ChatRole, SceneDirection } from '@shared/types'
import { lineAt, WAITING_STEP } from '@core/mood/waiting'

// One message. Used both for saved messages and for the reply being written (`streaming`).
// It only shows things and reports what the user asks for; the page decides what happens.

const props = defineProps<{
  role: ChatRole
  author: string
  /** Address of the character's picture, if their card has one. */
  portrait?: string
  content: string
  streaming?: boolean
  /** The model is reasoning before it writes. */
  thinking?: boolean
  /** Old messages are being summed up before the reply is written. */
  remembering?: boolean
  /** What to say while the reply has not started: "Lyra hesitates…", then plainer lines. */
  waiting?: readonly string[]
  /** The stage direction this reply was written under ("Something happens", …). */
  direction?: SceneDirection
  /** e.g. "llama3.1:8b · 3.1 s" */
  caption?: string
  /** The versions of this reply, when it has several. */
  swipes?: ChatMessage['swipes']
  /** The versions of this message can be browsed (the last reply, or the greeting of a new chat). */
  canSwipe?: boolean
  /** Another version can be written by the model. Not for greetings: those come from the card. */
  canRegenerate?: boolean
  /** The reply was cut short by the length limit and the model can write the rest of it. */
  canContinue?: boolean
  canDelete?: boolean
  /** A reply is being generated: nothing can be changed meanwhile. */
  busy?: boolean
  /**
   * This message can be read aloud, and where that stands: not asked for, the sound is
   * on its way, or it is being heard. Left out: no speaker button (no voice is set up).
   */
  voice?: 'idle' | 'loading' | 'playing'
  /** Why this message could not be read aloud, when it was asked for. */
  voiceProblem?: string
}>()

const emit = defineEmits<{
  /** Write another version of this reply. */
  regenerate: []
  /** Write the rest of this reply, which was cut short. */
  continue: []
  /** Show the version at this index. */
  swipe: [index: number]
  edit: [content: string]
  delete: []
  /** Read this message aloud, or stop reading it. */
  speak: []
}>()

const settingsStore = useSettingsStore()
const html = computed(() => formatMessage(props.content, { media: settingsStore.appearance.webMedia }))

/**
 * A picture or a sound from the web that could not be had (the site refuses it, or it is
 * gone): a short note in its place, rather than an empty space or a player stuck at 0:00.
 * Error events do not bubble, so this listens while they go down (capture).
 */
function onMediaError(event: Event): void {
  const element = event.target
  if (!(element instanceof HTMLImageElement || element instanceof HTMLMediaElement)) return
  if (!element.classList.contains('media-picture') && !element.classList.contains('media-sound') && !element.classList.contains('media-video')) return
  const note = document.createElement('span')
  note.className = 'media-missing'
  note.textContent = element instanceof HTMLImageElement ? 'Picture unavailable' : 'Sound unavailable'
  element.replaceWith(note)
}
const directed = computed(() => directionChoice(props.direction))

// --- Before the first word ---------------------------------------------------------
// One line at a time, the next one every few seconds, for as long as the model is silent.

const waitStep = ref(0)
let waitTimer: ReturnType<typeof setInterval> | undefined
const waitingNow = computed(() => !!props.streaming && !props.content && !props.thinking && !props.remembering)
watch(
  waitingNow,
  (now) => {
    clearInterval(waitTimer)
    waitStep.value = 0
    if (now) waitTimer = setInterval(() => waitStep.value++, WAITING_STEP)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(waitTimer))

const waitLabel = computed(() => {
  if (props.remembering) return 'Remembering earlier messages…'
  if (props.thinking) return `${props.author || 'The model'} is thinking…`
  return lineAt(props.waiting ?? [], waitStep.value) || 'Writing…'
})

// --- Copy ----------------------------------------------------------------------

const copied = ref(false)
async function copy(): Promise<void> {
  await navigator.clipboard.writeText(props.content)
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}

// --- Edit ----------------------------------------------------------------------

const editing = ref(false)
const draft = ref('')
const editor = ref<HTMLTextAreaElement | null>(null)

async function startEditing(): Promise<void> {
  draft.value = props.content
  editing.value = true
  await nextTick()
  editor.value?.focus()
}

function saveEdit(): void {
  const text = draft.value.trim()
  if (!text) return
  if (text !== props.content) emit('edit', text)
  editing.value = false
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    editing.value = false
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    saveEdit()
  }
}

// --- Swipes ----------------------------------------------------------------------

const swipeIndex = computed(() => props.swipes?.index ?? 0)
const swipeCount = computed(() => props.swipes?.count ?? 1)
const onLastSwipe = computed(() => swipeIndex.value === swipeCount.value - 1)

/** Past the last version, the arrow writes a new one, as in SillyTavern. */
function nextSwipe(): void {
  if (!onLastSwipe.value) emit('swipe', swipeIndex.value + 1)
  else if (props.canRegenerate) emit('regenerate')
}
</script>

<template>
  <motion.article
    class="message"
    :class="role"
    :initial="{ opacity: 0, y: 8 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.22, ease: 'easeOut' }"
  >
    <CharacterAvatar :name="author" :src="portrait" :size="40" :persona="role === 'user'" />

    <div class="body">
      <div class="head">
        <span class="who">
          <span class="author">{{ author }}</span>
          <span v-if="directed" class="directed" :title="`You asked for this: ${directed.hint.toLowerCase()}`">
            <component :is="directed.icon" :size="11" :stroke-width="2.2" />{{ directed.tag }}
          </span>
        </span>
        <span v-if="!streaming && !editing" class="actions" :class="{ speaking: voice && voice !== 'idle' }">
          <button
            v-if="voice"
            type="button"
            class="speak"
            :class="voice"
            :aria-label="voice === 'idle' ? 'Read aloud' : 'Stop reading'"
            :title="voice === 'idle' ? 'Read aloud' : voice === 'loading' ? 'Getting the voice… Click to stop' : 'Stop reading'"
            :aria-pressed="voice !== 'idle'"
            @click="emit('speak')"
          >
            <LoaderCircle v-if="voice === 'loading'" class="spin" :size="14" />
            <!-- While it is heard: three bars that move like a sound level. -->
            <span v-else-if="voice === 'playing'" class="bars" aria-hidden="true"><i /><i /><i /></span>
            <Volume2 v-else :size="14" />
          </button>
          <button type="button" :aria-label="copied ? 'Copied' : 'Copy message'" title="Copy" @click="copy">
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
          <button type="button" aria-label="Edit message" title="Edit" :disabled="busy" @click="startEditing">
            <Pencil :size="14" />
          </button>
          <button
            v-if="canRegenerate"
            type="button"
            aria-label="Write another version"
            title="Write another version"
            :disabled="busy"
            @click="emit('regenerate')"
          >
            <RefreshCw :size="14" />
          </button>
          <button
            v-if="canDelete"
            type="button"
            aria-label="Delete message"
            title="Delete"
            :disabled="busy"
            @click="emit('delete')"
          >
            <Trash2 :size="14" />
          </button>
        </span>
      </div>

      <form v-if="editing" class="editor" @submit.prevent="saveEdit">
        <textarea ref="editor" v-model="draft" aria-label="Edit message" @keydown="onEditorKeydown" />
        <div class="editor-actions">
          <span class="editor-hint">{{ shortcutKey() }} + Enter to save · Esc to cancel</span>
          <button type="button" class="btn btn-small" @click="editing = false">Cancel</button>
          <button type="submit" class="btn btn-small btn-primary" :disabled="!draft.trim()">Save</button>
        </div>
      </form>

      <template v-else>
        <!-- formatMessage() escapes the text before adding its own tags -->
        <div v-if="content" class="prose" :class="{ streaming }" @error.capture="onMediaError" v-html="html" />
        <div v-else class="typing" role="status" :aria-label="waitLabel">
          <span class="dot" /><span class="dot" /><span class="dot" />
          <Transition name="line" mode="out-in">
            <span :key="waitLabel" class="typing-label">{{ waitLabel }}</span>
          </Transition>
        </div>

        <div v-if="(canSwipe && !streaming) || (canContinue && !streaming) || caption" class="foot">
          <!-- Versions of the last reply: ‹ 2 / 3 › -->
          <div v-if="canSwipe && !streaming" class="swipes">
            <button
              type="button"
              aria-label="Previous version"
              title="Previous version"
              :disabled="busy || swipeIndex === 0"
              @click="emit('swipe', swipeIndex - 1)"
            >
              <ChevronLeft :size="14" :stroke-width="2.2" />
            </button>
            <span class="swipe-count">{{ swipeIndex + 1 }} / {{ swipeCount }}</span>
            <button
              type="button"
              :aria-label="onLastSwipe && canRegenerate ? 'Write another version' : 'Next version'"
              :title="onLastSwipe && canRegenerate ? 'Write another version' : 'Next version'"
              :disabled="busy || (onLastSwipe && !canRegenerate)"
              @click="nextSwipe"
            >
              <ChevronRight :size="14" :stroke-width="2.2" />
            </button>
          </div>
          <!-- The reply ran into the length limit: it stops in the middle of something. -->
          <button
            v-if="canContinue && !streaming"
            type="button"
            class="continue"
            title="This reply reached the length limit before it ended. Write the rest of it."
            :disabled="busy"
            @click="emit('continue')"
          >
            <CornerDownRight :size="13" :stroke-width="2.2" />Continue
          </button>
          <span v-if="caption" class="caption">{{ caption }}</span>
        </div>
        <p v-if="voiceProblem" class="voice-problem" role="alert">{{ voiceProblem }}</p>
      </template>
    </div>
  </motion.article>
</template>

<style scoped>
.message {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-lg);
  /* Set by the chat when a picture sits behind it; nothing otherwise. */
  background: var(--message-bg, transparent);
}
.message.user {
  background: var(--message-user-bg, var(--bg-card));
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}
.who {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.author {
  font-weight: 700;
  color: var(--accent-soft);
}
/* The stage direction the reply was written under. */
.directed {
  height: 18px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-pill);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-faint);
  white-space: nowrap;
}
.message.user .author {
  color: #a9cbee;
}

.actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
}
.message:hover .actions,
.actions:focus-within {
  opacity: 1;
}
.actions button {
  width: 28px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.actions button:hover:not(:disabled) {
  background: var(--bg-button);
  color: var(--text);
}

/* While a message is read aloud, its speaker button stays in sight: it is also how to stop. */
.actions.speaking {
  opacity: 1;
}
.message:not(:hover) .actions.speaking:not(:focus-within) button:not(.speak) {
  visibility: hidden;
}
.actions .speak.loading,
.actions .speak.playing {
  background: var(--bg-button);
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
.bars {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 12px;
}
.bars i {
  width: 2.5px;
  height: 100%;
  border-radius: 1px;
  background: currentColor;
  transform-origin: center;
  animation: level 0.9s ease-in-out infinite;
}
.bars i:nth-child(2) {
  animation-delay: -0.3s;
}
.bars i:nth-child(3) {
  animation-delay: -0.6s;
}
@keyframes level {
  0%,
  100% {
    transform: scaleY(0.35);
  }
  50% {
    transform: scaleY(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin,
  .bars i {
    animation: none;
  }
  .bars i:nth-child(2) {
    transform: scaleY(0.6);
  }
}
.voice-problem {
  margin-top: 4px;
  font-size: 12px;
  color: var(--danger-text);
}

.prose,
.editor textarea {
  font-family: var(--font-prose);
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-prose);
}
.prose {
  user-select: text;
  cursor: text;
  overflow-wrap: anywhere;
}
.prose :deep(p + p) {
  margin-top: 0.7em;
}
.prose :deep(em) {
  color: var(--text-action);
}
/* Pictures and sounds a card puts in its messages (see formatMessage) */
.prose :deep(.media-picture),
.prose :deep(.media-video) {
  display: block;
  max-width: 100%;
  max-height: 420px;
  margin: 4px 0;
  border-radius: var(--radius-md, 10px);
}
.prose :deep(.media-missing) {
  display: inline-block;
  padding: 3px 9px;
  font-family: var(--font-ui, inherit);
  font-size: 12px;
  color: var(--text-faint);
  border: 1px dashed var(--border-field);
  border-radius: var(--radius-md, 10px);
}
.prose :deep(.media-sound) {
  display: block;
  width: 100%;
  max-width: 420px;
  margin: 4px 0;
}
/* A caret at the end of the text while the reply is being written */
.prose.streaming :deep(p:last-child)::after {
  content: '';
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--accent-strong);
  border-radius: 1px;
  animation: blink 1s steps(2) infinite;
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.editor textarea {
  /* The box grows with its text, no script needed. */
  field-sizing: content;
  min-height: 3lh;
  max-height: 50vh;
  padding: 10px 12px;
  resize: none;
  background: var(--bg-sunken);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-md);
  user-select: text;
}
.editor textarea:focus {
  outline: none;
  border-color: var(--accent-strong);
}
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor-hint {
  flex: 1;
  font-size: 11px;
  color: var(--text-ghost);
}

.typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
}
.typing-label {
  margin-left: 6px;
  font-size: 12px;
  font-style: italic;
  color: var(--text-faint);
}
/* The next line comes up softly where the last one was. */
.line-enter-active,
.line-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}
.line-enter-from {
  opacity: 0;
  transform: translateY(3px);
}
.line-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
.typing .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
  animation: pulse 1.2s ease-in-out infinite;
}
.typing .dot:nth-child(2) {
  animation-delay: 0.15s;
}
.typing .dot:nth-child(3) {
  animation-delay: 0.3s;
}

.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
}

.swipes {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  background: var(--bg-button);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
}
.swipes button {
  width: 26px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-pill);
  color: var(--accent-soft);
}
.swipes button:hover:not(:disabled) {
  background: var(--bg-selected);
}
.swipe-count {
  min-width: 34px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-soft);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.continue {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  background: var(--bg-button);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-soft);
}
.continue:hover:not(:disabled) {
  background: var(--bg-selected);
}

.caption {
  font-size: 11px;
  color: var(--text-ghost);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .typing .dot,
  .prose.streaming :deep(p:last-child)::after {
    animation: none;
  }
  .line-enter-active,
  .line-leave-active {
    transition: none;
  }
}
</style>
