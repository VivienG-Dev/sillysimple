<script setup lang="ts">
import { Check, Crown, Dices, Feather, Flame, KeyRound, Moon, PartyPopper, Sparkles, Square } from '@lucide/vue'
import type { Component } from 'vue'
import { CARD_MOODS, MAX_MOOD_LEVEL, MAX_MOODS } from '@core/cards/moods'
import { readWrittenCard, type CardSection, type WrittenCard } from '@core/cards/writeCard'
import type { CardMood, MoodPick } from '@shared/types'

// "Describe your character": the user writes a sentence, picks a mood or two if they
// like, and the model the app is connected to writes the whole card. With no sentence
// at all, the model invents the character ("Surprise me"). This component asks, listens to the text as it
// arrives and hands what it reads to the editor, which shows it in its fields.
// Nothing is saved here: the user still reads, changes and creates the character.

const props = defineProps<{
  /**
   * Called before writing over fields the user filled in by hand. Resolves to false
   * when they would rather keep them.
   */
  mayReplace: () => Promise<boolean>
}>()

const emit = defineEmits<{
  /** What has been read so far. `finished`: the model is done (or was stopped). */
  written: [card: WrittenCard, finished: boolean]
}>()

/** True while the model writes: the editor's fields must be left alone meanwhile. */
const busy = defineModel<boolean>('busy', { default: false })

const settingsStore = useSettingsStore()
const model = computed(() => settingsStore.connection.model || 'the model')

const idea = ref('')

// "Use my tastes": offered once the app has learned something about how the user plays
// (Settings › Adapts to you). The character is then written with those tags in mind.
// The choice is remembered: someone who wants a character out of their habits unticks it.
const tastes = computed(() => {
  const { learnTastes, likes, dislikes } = settingsStore.adapt
  return learnTastes ? [...likes.map((tag) => `enjoys ${tag}`), ...dislikes.map((tag) => `does not enjoy ${tag}`)] : []
})
const useTastes = computed(() => tastes.value.length > 0 && settingsStore.adapt.inCards)
function setUseTastes(event: Event): void {
  void settingsStore.update({ adapt: { inCards: (event.target as HTMLInputElement).checked } })
}
// Moods: a tone, an attitude or a kind of story, asked for with a click instead of words.
// Pressing a pill again makes the mood stronger, up to three times; one more press lets
// go of it. A few moods at most: once they are on, the other pills wait for one to be let go.
const MOODS: Record<CardMood, { label: string; icon: Component; color: string; strengths: [string, string, string] }> = {
  soft: { label: 'Soft', icon: Feather, color: '#8fc7e8', strengths: ['A kind, easygoing tone', 'Gentle and warm', 'Pure comfort, nothing bad happens'] },
  funny: { label: 'Funny', icon: PartyPopper, color: '#f2c45a', strengths: ['A light tone, a few smiles', 'A comic premise, wit and mishaps', 'Outright comedy, nothing is serious'] },
  dark: { label: 'Dark', icon: Moon, color: '#a99bd6', strengths: ['Some shadow in the background', 'A heavy atmosphere and real stakes', 'Grim and oppressive'] },
  mysterious: { label: 'Mysterious', icon: KeyRound, color: '#6fcfb4', strengths: ['One secret behind the character', 'Secrets and things left unsaid', 'A riddle from end to end'] },
  sassy: { label: 'Sassy', icon: Crown, color: '#f09a5c', strengths: ['Teases now and then', 'Attitude: teases and answers back', 'Sharp-tongued, impossible to impress'] },
  spicy: { label: 'Spicy', icon: Flame, color: '#f0707e', strengths: ['Light flirting, only suggested', 'A flirtatious, sensual story', 'Openly erotic, for adults'] },
}
const moods = ref<MoodPick[]>([])
/** As many moods as can go together are on: no other can be added. */
const full = computed(() => moods.value.length >= MAX_MOODS)
const levelOf = (mood: CardMood): 0 | 1 | 2 | 3 => moods.value.find((pick) => pick.mood === mood)?.level ?? 0

function pressMood(mood: CardMood): void {
  const level = levelOf(mood)
  if (level === 0) moods.value = full.value ? moods.value : [...moods.value, { mood, level: 1 as const }]
  else if (level >= MAX_MOOD_LEVEL) moods.value = moods.value.filter((pick) => pick.mood !== mood)
  else moods.value = moods.value.map((pick) => (pick.mood === mood ? { mood, level: (level + 1) as 2 | 3 } : pick))
}

/** What a pill says when pointed at: what it asks for now, and what the next press does. */
function moodTitle(mood: CardMood): string {
  const level = levelOf(mood)
  const { strengths } = MOODS[mood]
  const adult = mood === 'spicy' ? ' The character is written as an adult.' : ''
  if (level === 0 && full.value) return `${MAX_MOODS} moods at most: turn one off to pick this one.`
  if (level === 0) return `${strengths[1]}. Press once for a touch of it, again for more.${adult}`
  const next = level < MAX_MOOD_LEVEL ? 'Press again for more.' : 'Press again to turn it off.'
  return `${strengths[level - 1]}. ${next}${adult}`
}

const examples = [
  'A grumpy lighthouse keeper who talks to the sea',
  'The AI of a space station that is hiding something',
  'A rival apprentice at a school of magic',
]

// While the model writes, the panel shows it plainly: a light runs around it, in the
// colors of the moods that were picked, and a row of steps fills in as the parts of the
// card arrive, with the count of words written so far. Before the first word, when a
// local model can stay silent for a long moment, the light alone says it is at work.
const STEPS: { label: string; sections: CardSection[] }[] = [
  { label: 'Name', sections: ['NAME', 'TAGLINE'] },
  { label: 'Description', sections: ['DESCRIPTION'] },
  { label: 'Personality', sections: ['PERSONALITY', 'SCENARIO'] },
  { label: 'Dialogue', sections: ['EXAMPLE DIALOGUE', 'TAGS'] },
  { label: 'Lorebook', sections: ['LORE'] },
  { label: 'Greetings', sections: ['FIRST MESSAGE', 'SECOND GREETING', 'THIRD GREETING', 'FOURTH GREETING', 'FIFTH GREETING'] },
]
/** The step being written, or -1 before the first word. */
const step = ref(-1)
const words = ref(0)
/** True for a moment after a card was written to the end: the panel says so with a flash. */
const justDone = ref(false)
let doneTimer = 0

/** The colors of the light: those of the moods picked, or the app's own. */
const glow = computed(() => {
  const colors = moods.value.map((pick) => MOODS[pick.mood].color)
  const [a = 'var(--accent-soft)', b = colors[0] ?? 'var(--accent-strong)', c = colors[0] ?? 'var(--accent)'] = colors
  return { '--glow-a': a, '--glow-b': b, '--glow-c': c }
})

type Note = { kind: 'writing' | 'done' | 'problem'; text: string }
const note = ref<Note | null>(null)
/** A character was written at least once: the button offers to do it again. */
const wroteOnce = ref(false)

const SECTION_LABELS: Record<CardSection, string> = {
  NAME: 'the name',
  TAGLINE: 'the tagline',
  DESCRIPTION: 'the description',
  PERSONALITY: 'the personality',
  SCENARIO: 'the scenario',
  'EXAMPLE DIALOGUE': 'an example dialogue',
  TAGS: 'the tags',
  LORE: 'the lorebook notes',
  'FIRST MESSAGE': 'the first message',
  'SECOND GREETING': 'another greeting',
  'THIRD GREETING': 'a third greeting',
  'FOURTH GREETING': 'a fourth greeting',
  'FIFTH GREETING': 'a fifth greeting',
}

let requestId: string | null = null
let alive = true
onBeforeUnmount(() => {
  alive = false
  window.clearTimeout(doneTimer)
  stop()
})

/** Without an idea, the model invents the character: the button says so. */
const surprise = computed(() => !idea.value.trim())

async function write(): Promise<void> {
  const text = idea.value.trim()
  if (busy.value) return
  if (!(await props.mayReplace())) return

  const id = crypto.randomUUID()
  requestId = id
  busy.value = true
  step.value = -1
  words.value = 0
  justDone.value = false
  note.value = { kind: 'writing', text: `Waiting for ${model.value}…` }
  emit('written', { last: null }, false) // Start from empty fields.

  // The text arrives in small pieces, on the same channel as chat replies.
  let received = ''
  const stopListening = window.api.chat.onEvent((event) => {
    if (event.requestId !== id || !alive) return
    if (event.type === 'thinking') {
      note.value = { kind: 'writing', text: 'Thinking…' }
      return
    }
    if (event.type !== 'text') return
    received += event.delta
    const card = readWrittenCard(received, { partial: true })
    if (card.last) {
      note.value = { kind: 'writing', text: `Writing ${SECTION_LABELS[card.last]}…` }
      step.value = Math.max(step.value, STEPS.findIndex((item) => item.sections.includes(card.last!)))
    }
    // Headings are not words of the card.
    words.value = received.replace(/^\s*#+.*$/gm, ' ').split(/\s+/).filter(Boolean).length
    emit('written', card, false)
  })

  try {
    const outcome = await window.api.characters.write({ requestId: id, idea: text, useTastes: useTastes.value, moods: moods.value.map((pick) => ({ ...pick })) })
    if (!alive) return

    const card = readWrittenCard(outcome.text)
    emit('written', card, true)
    wroteOnce.value ||= card.last !== null

    if (outcome.status === 'error') {
      note.value = { kind: 'problem', text: outcome.error ?? 'Something went wrong.' }
    } else if (card.last === null) {
      note.value =
        outcome.status === 'stopped'
          ? null
          : { kind: 'problem', text: `${model.value} did not write a character. Try again${text ? ', or with other words' : ''}.` }
    } else if (outcome.status === 'stopped') {
      note.value = { kind: 'done', text: 'Stopped. What was written is kept: finish it by hand, or write again.' }
    } else if (outcome.cut) {
      note.value = { kind: 'done', text: 'The model ran out of room before the end. Fill in what is missing, or write again.' }
    } else {
      const notes = card.lore?.length ?? 0
      const lore = notes > 0 ? ` The Lorebook tab holds ${notes} ${notes === 1 ? 'note' : 'notes'} on their life, which they recall when the chat comes to it.` : ''
      note.value = { kind: 'done', text: `Done. Read it through, change what you like, then create the character.${lore}` }
      justDone.value = true
      window.clearTimeout(doneTimer)
      doneTimer = window.setTimeout(() => (justDone.value = false), 1400)
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

function useExample(example: string): void {
  idea.value = example
}

defineExpose({ stop })
</script>

<template>
  <section class="assistant" :class="{ busy, 'just-done': justDone }" :style="glow" aria-label="Write the character from an idea">
    <div class="intro">
      <Sparkles class="spark" :size="14" :stroke-width="2" />
      <span class="title">Describe your character</span>
      <span class="hint">and {{ model }} writes the rest. You can change everything afterwards.</span>
    </div>

    <div class="row">
      <textarea
        v-model="idea"
        class="field"
        rows="2"
        maxlength="2000"
        aria-label="Describe your character"
        placeholder="A sarcastic librarian in a steampunk city who secretly sells forbidden books"
        :disabled="busy"
        autofocus
        @keydown.enter.exact.prevent="idea.trim() && write()"
      />
      <button v-if="busy" type="button" class="btn" @click="stop">
        <Square :size="12" :stroke-width="2.4" />Stop
      </button>
      <button v-else type="button" class="btn btn-primary" @click="write">
        <template v-if="surprise"><Dices :size="14" :stroke-width="2" />Surprise me</template>
        <template v-else>{{ wroteOnce ? 'Write again' : 'Write it for me' }}</template>
      </button>
    </div>

    <div class="moods" role="group" aria-label="Mood">
      <span class="hint">Mood:</span>
      <button
        v-for="mood in CARD_MOODS"
        :key="mood"
        type="button"
        class="mood"
        :class="[mood, levelOf(mood) > 0 && `on level-${levelOf(mood)}`]"
        :style="{ '--mood': MOODS[mood].color }"
        :aria-pressed="levelOf(mood) > 0"
        :aria-label="levelOf(mood) > 0 ? `${MOODS[mood].label}, strength ${levelOf(mood)} of ${MAX_MOOD_LEVEL}` : MOODS[mood].label"
        :title="moodTitle(mood)"
        :disabled="busy || (full && levelOf(mood) === 0)"
        @click="pressMood(mood)"
      >
        <component :is="MOODS[mood].icon" :size="13" :stroke-width="2" />{{ MOODS[mood].label }}
        <!-- How strong: one dot per press. Shown once the pill is on, which is also what tells it can be pressed again. -->
        <span v-if="levelOf(mood) > 0" class="strength" aria-hidden="true">
          <i v-for="step in MAX_MOOD_LEVEL" :key="step" :class="{ lit: step <= levelOf(mood) }" />
        </span>
      </button>
    </div>

    <label v-if="tastes.length > 0" class="tastes" :title="`What is noted about how you play: ${tastes.join(', ')}.`">
      <input type="checkbox" aria-label="Use my tastes" :checked="useTastes" :disabled="busy" @change="setUseTastes" />
      <span>Use my tastes</span>
      <span class="hint">
        {{ useTastes ? 'the character is written with what you enjoy in mind; your idea still comes first' : 'written from your idea alone' }}
      </span>
    </label>

    <div v-if="busy" class="progress">
      <ol class="steps" aria-hidden="true">
        <li v-for="(item, index) in STEPS" :key="item.label" :class="{ done: index < step, current: index === step }">
          <span class="step-mark"><Check v-if="index < step" :size="10" :stroke-width="3" /></span>
          <span class="step-label">{{ item.label }}</span>
        </li>
      </ol>
      <p class="progress-line">
        <span class="writing" role="status">{{ note?.text }}</span>
        <span v-if="words > 0" class="words">{{ words }} {{ words === 1 ? 'word' : 'words' }}</span>
      </p>
    </div>
    <p v-else-if="note" class="note" :class="note.kind" :role="note.kind === 'problem' ? 'alert' : 'status'">
      {{ note.text }}
    </p>
    <div v-else-if="!idea.trim()" class="examples">
      <span class="hint">For example:</span>
      <button v-for="example in examples" :key="example" type="button" class="example" @click="useExample(example)">
        {{ example }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.assistant {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
  transition:
    border-color 0.3s,
    box-shadow 0.3s;
}

/* --- While the model writes ------------------------------------------------------
   A light runs around the panel, in the colors of the moods that were picked. */
@property --turn {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
.assistant.busy {
  border-color: color-mix(in srgb, var(--glow-b) 35%, var(--border-field));
  box-shadow: 0 0 22px -6px color-mix(in srgb, var(--glow-b) 55%, transparent);
  animation: breathe 2.6s ease-in-out infinite;
}
.assistant.busy::before {
  content: '';
  position: absolute;
  inset: -1px;
  padding: 1.5px;
  border-radius: inherit;
  background: conic-gradient(
    from var(--turn),
    transparent 0deg,
    transparent 170deg,
    var(--glow-c) 235deg,
    var(--glow-b) 295deg,
    var(--glow-a) 352deg,
    transparent 360deg
  );
  /* Only the edge is kept: the middle of the panel is cut out. */
  mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
  pointer-events: none;
  animation: turn 2.2s linear infinite;
}
@keyframes turn {
  to {
    --turn: 360deg;
  }
}
@keyframes breathe {
  50% {
    box-shadow: 0 0 30px -4px color-mix(in srgb, var(--glow-b) 70%, transparent);
  }
}
.busy .spark {
  color: var(--glow-a);
  animation: twinkle 1.3s ease-in-out infinite;
}
@keyframes twinkle {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
  50% {
    transform: scale(1.35) rotate(22deg);
    opacity: 0.65;
  }
}
/* Written to the end: one flash, in the color of things that went well. */
.assistant.just-done {
  animation: done-flash 1.3s ease-out;
}
@keyframes done-flash {
  0% {
    border-color: var(--success);
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--success) 60%, transparent),
      0 0 26px -4px var(--success);
  }
  100% {
    box-shadow:
      0 0 0 10px transparent,
      0 0 26px -4px transparent;
  }
}

/* The parts of the card, lighting up one after the other. */
.progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}
.steps {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}
.steps li {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-faint);
  transition: color 0.25s;
}
/* The line that links a step to the one before it. */
.steps li + li::before {
  content: '';
  position: absolute;
  top: 8px;
  right: calc(50% + 12px);
  width: calc(100% - 24px);
  height: 2px;
  border-radius: 1px;
  background: var(--border-field);
  transition: background 0.3s;
}
.steps li.done + li::before {
  background: color-mix(in srgb, var(--glow-b) 70%, transparent);
}
.step-mark {
  position: relative;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--border-hover);
  border-radius: 50%;
  background: var(--bg-sunken);
  color: var(--bg-sunken);
  transition:
    background 0.25s,
    border-color 0.25s;
}
.steps .done {
  color: var(--text-muted);
}
.done .step-mark {
  background: var(--glow-b);
  border-color: transparent;
  animation: step-pop 0.34s cubic-bezier(0.3, 1.8, 0.5, 1);
}
.steps .current {
  color: var(--text);
}
.current .step-mark {
  border-color: var(--glow-a);
  background: color-mix(in srgb, var(--glow-a) 22%, var(--bg-sunken));
}
/* The step being written sends out rings, like the pills when they are pressed. */
.current .step-mark::after {
  content: '';
  position: absolute;
  inset: -2px;
  border: 1.5px solid var(--glow-a);
  border-radius: 50%;
  animation: step-ring 1.2s ease-out infinite;
}
@keyframes step-pop {
  from {
    transform: scale(0.5);
  }
}
@keyframes step-ring {
  from {
    opacity: 0.8;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(2.1);
  }
}
/* Before the first word: no step is lit yet, the row itself shimmers. */
.steps:not(:has(.current, .done)) .step-mark {
  animation: wait 1.5s ease-in-out infinite;
}
.steps li:nth-child(2) .step-mark {
  animation-delay: 0.12s;
}
.steps li:nth-child(3) .step-mark {
  animation-delay: 0.24s;
}
.steps li:nth-child(4) .step-mark {
  animation-delay: 0.36s;
}
.steps li:nth-child(5) .step-mark {
  animation-delay: 0.48s;
}
.steps li:nth-child(6) .step-mark {
  animation-delay: 0.6s;
}
@keyframes wait {
  0%,
  100% {
    border-color: var(--border-hover);
    transform: scale(1);
  }
  40% {
    border-color: var(--glow-a);
    transform: scale(1.18);
  }
}
.progress-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  font-size: 12.5px;
}
.writing {
  font-weight: 600;
  /* Light passing through the words. */
  background: linear-gradient(100deg, var(--text-muted) 30%, var(--glow-a) 50%, var(--text-muted) 70%) 0 0 / 220% 100%;
  background-clip: text;
  color: transparent;
  animation: shine 1.8s linear infinite;
}
@keyframes shine {
  from {
    background-position: 110% 0;
  }
  to {
    background-position: -110% 0;
  }
}
.words {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}
@media (prefers-reduced-motion: reduce) {
  .assistant.busy,
  .assistant.busy::before,
  .assistant.just-done,
  .busy .spark,
  .step-mark,
  .step-mark::after,
  .writing {
    animation: none !important;
  }
  /* Without the running light, the whole edge takes its color. */
  .assistant.busy::before {
    background: var(--glow-b);
    opacity: 0.6;
  }
  .writing {
    color: var(--text-muted);
    background: none;
  }
}

.intro {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--accent-soft);
}
.intro svg {
  flex-shrink: 0;
  align-self: center;
}
.title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}
.hint {
  font-size: 12px;
  color: var(--text-faint);
}

.row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.row textarea {
  flex: 1;
  min-height: 0;
  resize: none;
  background: var(--bg-panel);
}
.row .btn {
  height: auto;
  gap: 6px;
  flex-shrink: 0;
}

/* Moods: pills that pop like a bubble when pressed. Each has its own color once on, deeper with each press. */
.moods {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.mood {
  --mood: var(--accent-soft);
  --level: 1;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 11px 0 9px;
  background: var(--bg-button);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s,
    transform 0.1s;
}
.mood:hover:not(:disabled, .on) {
  border-color: var(--border-hover);
  color: var(--text);
}
.mood.on:hover:not(:disabled) {
  border-color: var(--mood);
}
.mood:active:not(:disabled) {
  transform: scale(0.93);
}
.mood.on {
  background: color-mix(in srgb, var(--mood) calc(8% + var(--level) * 7%), var(--bg-button));
  border-color: color-mix(in srgb, var(--mood) calc(30% + var(--level) * 22%), transparent);
  color: var(--mood);
}
/* Each press pops, a little harder each time. One animation per strength: changing its
   name is what makes it play again on the same pill. */
.mood.level-1 {
  --level: 1;
  animation: mood-pop-1 0.32s cubic-bezier(0.3, 1.7, 0.5, 1);
}
.mood.level-2 {
  --level: 2;
  animation: mood-pop-2 0.36s cubic-bezier(0.3, 1.9, 0.5, 1);
}
.mood.level-3 {
  --level: 3;
  animation: mood-pop-3 0.42s cubic-bezier(0.3, 2.2, 0.5, 1);
}
/* The bubble: a ring that leaves the pill and fades. */
.mood.on::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1.5px solid var(--mood);
  border-radius: inherit;
  opacity: 0;
  pointer-events: none;
}
.mood.level-1::after {
  animation: mood-ring-1 0.45s ease-out;
}
.mood.level-2::after {
  animation: mood-ring-2 0.55s ease-out;
}
.mood.level-3::after {
  animation: mood-ring-3 0.65s ease-out;
}
@keyframes mood-pop-1 {
  from {
    transform: scale(0.9);
  }
}
@keyframes mood-pop-2 {
  from {
    transform: scale(0.84);
  }
}
@keyframes mood-pop-3 {
  from {
    transform: scale(0.76);
  }
}
@keyframes mood-ring-1 {
  from {
    opacity: 0.6;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.2, 1.5);
  }
}
@keyframes mood-ring-2 {
  from {
    opacity: 0.75;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.32, 1.9);
  }
}
@keyframes mood-ring-3 {
  from {
    opacity: 0.9;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.46, 2.4);
  }
}

.strength {
  display: inline-flex;
  gap: 2px;
  margin-left: 1px;
}
.strength i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mood) 28%, transparent);
}
.strength i.lit {
  background: var(--mood);
}
@media (prefers-reduced-motion: reduce) {
  .mood,
  .mood.on,
  .mood.on::after {
    animation: none !important;
    transition: none;
  }
}

.tastes {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}
.tastes input {
  width: 14px;
  height: 14px;
  margin: 0;
  flex-shrink: 0;
  align-self: center;
  accent-color: var(--accent);
}
.tastes .hint {
  font-weight: 400;
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
.examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.example {
  height: 24px;
  padding: 0 10px;
  background: var(--bg-button);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-pill);
  font-size: 11.5px;
  color: var(--text-muted);
}
.example:hover {
  border-color: var(--border-hover);
  color: var(--text);
}
</style>
