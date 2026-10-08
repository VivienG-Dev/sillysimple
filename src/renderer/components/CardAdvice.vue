<script setup lang="ts">
import { ChevronDown, Lightbulb, Square, Undo2 } from '@lucide/vue'
import { fixSections, reviewCard, type CardTip } from '@core/cards/reviewCard'
import { readWrittenCard, type CardSection, type WrittenCard } from '@core/cards/writeCard'
import type { ReviewedCard } from '@shared/types'

// Advice on a character that exists already, shown at the top of its editor: what would
// make the card better, in plain words, and for most of it a button that has the model
// write the missing part (see src/core/cards/reviewCard.ts).
//
// The advice follows what is in the editor, so it changes as the user types. A fix is
// written into the editor's fields like anything typed there: nothing is saved until
// the user saves, and the last fix can be undone.

const props = defineProps<{
  /** The card as it is in the editor right now. */
  card: ReviewedCard
}>()

const emit = defineEmits<{
  /**
   * What the model has written so far for a fix. `sections`: the parts of the card it
   * was asked for. Called once with nothing written when the fix starts.
   */
  written: [card: WrittenCard, finished: boolean, sections: CardSection[]]
  /** Put back what the last fix replaced. */
  undo: []
}>()

/** True while the model writes: the editor's fields must be left alone meanwhile. */
const busy = defineModel<boolean>('busy', { default: false })

const settingsStore = useSettingsStore()
const model = computed(() => settingsStore.connection.model || 'the model')

const tips = computed(() => reviewCard(props.card))
const important = computed(() => tips.value.filter((tip) => tip.level === 'important').length)
const name = computed(() => props.card.name.trim() || 'this character')

const headline = computed(() => {
  const count = tips.value.length
  if (important.value > 0) {
    return important.value === 1 ? `One thing would make ${name.value} work better` : `${important.value} things would make ${name.value} work better`
  }
  return count === 1 ? `One idea to make ${name.value} better` : `${count} ideas to make ${name.value} better`
})

// Open by itself when something matters; ideas wait until they are asked for.
const open = ref(important.value > 0)

type Note = { kind: 'writing' | 'done' | 'problem'; text: string; undo?: boolean }
const note = ref<Note | null>(null)

const WRITTEN: Record<string, string> = {
  DESCRIPTION: 'The description is new',
  'EXAMPLE DIALOGUE': 'The example dialogue is written',
  'FIRST MESSAGE': 'The opening message is new',
  'SECOND GREETING': 'There is a second opening message',
  LORE: 'The lorebook has its first notes',
}

/** Whether the model wrote the part it was asked for. */
function wrote(card: WrittenCard, section: CardSection): boolean {
  if (section === 'DESCRIPTION') return Boolean(card.description)
  if (section === 'EXAMPLE DIALOGUE') return Boolean(card.exampleMessages)
  if (section === 'FIRST MESSAGE') return Boolean(card.firstMessage)
  if (section === 'SECOND GREETING') return Boolean(card.otherGreetings?.length)
  if (section === 'LORE') return Boolean(card.lore?.length)
  return false
}

let requestId: string | null = null
let alive = true
onBeforeUnmount(() => {
  alive = false
  stop()
})

async function fix(tip: CardTip): Promise<void> {
  const sections = fixSections(tip.id)
  if (busy.value || sections.length === 0) return

  const id = crypto.randomUUID()
  requestId = id
  busy.value = true
  note.value = { kind: 'writing', text: `Waiting for ${model.value}…` }
  emit('written', { last: null }, false, sections) // The editor remembers what is there now.

  let received = ''
  const stopListening = window.api.chat.onEvent((event) => {
    if (event.requestId !== id || !alive) return
    if (event.type === 'thinking') {
      note.value = { kind: 'writing', text: 'Thinking…' }
      return
    }
    if (event.type !== 'text') return
    received += event.delta
    note.value = { kind: 'writing', text: 'Writing…' }
    emit('written', readWrittenCard(received, { partial: true }), false, sections)
  })

  try {
    const outcome = await window.api.characters.improve({ requestId: id, card: toPlain(props.card), tip: tip.id })
    if (!alive) return

    const card = readWrittenCard(outcome.text)
    const done = sections.filter((section) => wrote(card, section))
    emit('written', card, true, sections)

    if (outcome.status === 'error') {
      note.value = { kind: 'problem', text: outcome.error ?? 'Something went wrong.', undo: done.length > 0 }
    } else if (done.length === 0) {
      note.value =
        outcome.status === 'stopped' ? null : { kind: 'problem', text: `${model.value} did not write what was asked. Try again.` }
    } else {
      const what = WRITTEN[done[0]!] ?? 'It is written'
      const how = outcome.status === 'stopped' ? ', as far as it got' : outcome.cut ? ', but the model ran out of room before the end' : ''
      note.value = { kind: 'done', text: `${what}${how}. Read it, change what you like, then save.`, undo: true }
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
  <section v-if="tips.length > 0 || note" class="advice" aria-label="Advice on this character">
    <button v-if="tips.length > 0" type="button" class="summary" :aria-expanded="open" @click="open = !open">
      <Lightbulb :size="14" :stroke-width="2" />
      <span class="headline">{{ headline }}</span>
      <ChevronDown class="chevron" :class="{ open }" :size="14" :stroke-width="2.2" />
    </button>

    <ul v-if="open && tips.length > 0" class="tips">
      <li v-for="tip in tips" :key="tip.id" class="tip" :class="tip.level" :data-tip="tip.id">
        <span class="tip-text">
          <span class="tip-title">{{ tip.title }}</span>
          <span class="tip-detail">{{ tip.detail }}</span>
        </span>
        <button v-if="tip.fixLabel" type="button" class="btn btn-small" :disabled="busy" @click="fix(tip)">
          {{ tip.fixLabel }}
        </button>
      </li>
    </ul>

    <p v-if="note" class="note" :class="note.kind" :role="note.kind === 'problem' ? 'alert' : 'status'">
      <span v-if="note.kind === 'writing'" class="pulse" />
      <span>{{ note.text }}</span>
      <button v-if="note.kind === 'writing'" type="button" class="link" @click="stop">
        <Square :size="10" :stroke-width="2.6" />Stop
      </button>
      <button v-else-if="note.undo" type="button" class="link" @click="undo"><Undo2 :size="12" :stroke-width="2.2" />Undo</button>
    </p>
  </section>
</template>

<style scoped>
.advice {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
}

.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-soft);
  text-align: left;
}
.headline {
  flex: 1;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
}
.chevron {
  color: var(--text-faint);
  transition: transform 0.15s;
}
.chevron.open {
  transform: rotate(180deg);
}

.tips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 150px;
  overflow-y: auto;
}
.tip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 0 7px 10px;
  border-left: 2px solid var(--border-strong);
}
.tip.important {
  border-left-color: var(--warning-text);
}
.tip-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tip-title {
  font-size: 12.5px;
  font-weight: 600;
}
.tip-detail {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-faint);
}
.tip .btn {
  flex-shrink: 0;
}

.note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
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
}
</style>
