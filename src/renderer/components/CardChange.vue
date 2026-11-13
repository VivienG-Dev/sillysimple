<script setup lang="ts">
import { Square, Undo2, Wand2 } from '@lucide/vue'
import { describeChange, MAX_CHANGE_LENGTH, readChange, saidNothing, type CardChange } from '@core/cards/changeCard'
import type { ChangedCard } from '@shared/types'

// "Change it", at the top of an existing character's editor: the user says what should be
// different (a woman instead of a man, another century, shyer…) and the model rewrites
// the parts of the card that change touches, nothing else (see src/core/cards/changeCard.ts).
// The parts arrive in the editor's fields as they are written; nothing is saved until
// the user saves, and the whole change can be undone.

const props = defineProps<{
  /** The card as it is in the editor right now. */
  card: ChangedCard
}>()

const emit = defineEmits<{
  /** What the model has rewritten so far. Called once with nothing when the change starts. */
  changed: [change: CardChange, finished: boolean]
  /** Put back what the change replaced. */
  undo: []
}>()

/** True while the model writes: the editor's fields must be left alone meanwhile. */
const busy = defineModel<boolean>('busy', { default: false })

const settingsStore = useSettingsStore()
const model = computed(() => settingsStore.connection.model || 'the model')

const wish = ref('')
const examples = ['Change their gender', 'Set the story in the present day', 'Make them shyer', 'Give them a new name']

type Note = { kind: 'writing' | 'done' | 'problem'; text: string; undo?: boolean }
const note = ref<Note | null>(null)

let requestId: string | null = null
let alive = true
onBeforeUnmount(() => {
  alive = false
  stop()
})

/** "the description, the first message and 2 lorebook notes" */
function listed(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

async function change(): Promise<void> {
  const text = wish.value.trim()
  if (busy.value || !text) return

  const id = crypto.randomUUID()
  requestId = id
  busy.value = true
  note.value = { kind: 'writing', text: `Waiting for ${model.value}…` }
  emit('changed', { fields: {}, greetings: new Map(), lore: [], last: null }, false) // The editor remembers what is there now.

  let received = ''
  const stopListening = window.api.chat.onEvent((event) => {
    if (event.requestId !== id || !alive) return
    if (event.type === 'thinking') {
      note.value = { kind: 'writing', text: 'Thinking…' }
      return
    }
    if (event.type !== 'text') return
    received += event.delta
    const now = readChange(received, { partial: true })
    note.value = { kind: 'writing', text: now.last ? `Changing ${now.last.toLowerCase()}…` : 'Reading the card…' }
    emit('changed', now, false)
  })

  try {
    const outcome = await window.api.characters.change({ requestId: id, card: toPlain(props.card), change: text })
    if (!alive) return

    // A part cut off in the middle (stopped, or out of room) is left as it was.
    const finished = readChange(outcome.text, { drop: outcome.status !== 'done' || outcome.cut === true })
    emit('changed', finished, true)
    const parts = describeChange(finished)

    if (outcome.status === 'error') {
      note.value = { kind: 'problem', text: outcome.error ?? 'Something went wrong.', undo: parts.length > 0 }
    } else if (parts.length === 0) {
      note.value =
        outcome.status === 'stopped'
          ? null
          : saidNothing(outcome.text)
            ? { kind: 'done', text: `${model.value} found nothing to change for that. Try saying it another way.` }
            : { kind: 'problem', text: `${model.value} did not change the card. Try again, or with other words.` }
    } else {
      const how =
        outcome.status === 'stopped'
          ? ' (stopped: the rest is as it was)'
          : outcome.cut
            ? ' (the model ran out of room: what comes after is as it was; ask again for the rest)'
            : ''
      const what = listed(parts)
      note.value = { kind: 'done', text: `Changed ${what}${how}. Read it through, then save.`, undo: true }
      wish.value = ''
    }
  } catch (error) {
    if (alive) note.value = { kind: 'problem', text: error instanceof Error ? error.message : String(error) }
  } finally {
    stopListening()
    requestId = null
    if (alive) busy.value = false
  }
}

function stop(): void {
  if (requestId) window.api.chat.cancel(requestId)
}

function undo(): void {
  emit('undo')
  note.value = null
}

defineExpose({ stop })
</script>

<template>
  <section class="change" :class="{ busy }" aria-label="Change this character">
    <div class="row">
      <Wand2 class="wand" :size="14" :stroke-width="2" />
      <input
        v-model="wish"
        class="field"
        type="text"
        :maxlength="MAX_CHANGE_LENGTH"
        aria-label="What should change"
        :placeholder="`What should change? ${model} rewrites only what it touches`"
        :disabled="busy"
        @keydown.enter.prevent="change"
      />
      <button v-if="busy" type="button" class="btn btn-small" @click="stop">
        <Square :size="11" :stroke-width="2.4" />Stop
      </button>
      <button v-else type="button" class="btn btn-small btn-primary" :disabled="!wish.trim()" @click="change">Change it</button>
    </div>

    <p v-if="note" class="note" :class="note.kind" :role="note.kind === 'problem' ? 'alert' : 'status'">
      <span v-if="note.kind === 'writing'" class="pulse" />
      <span>{{ note.text }}</span>
      <button v-if="note.undo" type="button" class="link" @click="undo"><Undo2 :size="12" :stroke-width="2.2" />Undo</button>
    </p>
    <div v-else-if="!wish.trim()" class="examples">
      <span class="hint">For example:</span>
      <button v-for="example in examples" :key="example" type="button" class="example" @click="wish = example">{{ example }}</button>
    </div>
  </section>
</template>

<style scoped>
.change {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
  transition: border-color 0.3s;
}
.change.busy {
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wand {
  flex-shrink: 0;
  color: var(--accent-soft);
}
.row .field {
  flex: 1;
  height: 30px;
  font-size: 12.5px;
  background: var(--bg-panel);
}
.row .btn {
  flex-shrink: 0;
  gap: 5px;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.hint {
  font-size: 12px;
  color: var(--text-faint);
}
.example {
  padding: 3px 9px;
  font-size: 11.5px;
  color: var(--text-muted);
  background: var(--bg-button);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
}
.example:hover {
  color: var(--text);
  border-color: var(--border-hover);
}

.note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-muted);
}
.note.done {
  color: var(--success-text);
}
.note.problem {
  color: var(--danger-text);
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}
.link:hover {
  text-decoration: underline;
}
.pulse {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent-soft);
  animation: pulse 1.1s ease-in-out infinite;
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
  .pulse {
    animation: none;
  }
  .change {
    transition: none;
  }
}
</style>
