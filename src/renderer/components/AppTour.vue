<script setup lang="ts">
// The guided tour of the chat screen, driven by useTour(). It dims the screen, leaves a
// hole around the part it talks about, and puts a few words beside it.
// Nothing here knows the screen's structure beyond one CSS selector per step.

const { step, end } = useTour()
const charactersStore = useCharactersStore()
const settingsStore = useSettingsStore()

interface TourStep {
  /** What to point at. A step whose target is not on screen is skipped. */
  target: string
  /** Where the words go, seen from the target. */
  side: 'top' | 'bottom' | 'left' | 'right'
  title: string
  text: string
}

const steps = computed<TourStep[]>(() => {
  const name = charactersStore.active?.name ?? 'the character'
  const you = settingsStore.persona.name
  return [
    {
      target: '.messages .message',
      side: 'bottom',
      title: `This is ${name}`,
      text: `Every chat opens with the character's first words. You answer as ${you}: a story the two of you write together, one message at a time.`,
    },
    {
      target: '.composer',
      side: 'top',
      title: 'Write here',
      text: 'Say what you say and what you do. Put actions between asterisks, like *I sit down by the fire.* Then press Enter. Nothing to say? The buttons above the box let the character carry on, or make something happen.',
    },
    {
      target: '.messages .message',
      side: 'bottom',
      title: 'Nothing is final',
      text: 'Not happy with a reply? The arrows under the last one write another version. Point at any message to copy it, change it or delete it.',
    },
    {
      target: '.panel',
      side: 'left',
      title: 'Who is who',
      text: 'Character: who you are talking to. Persona: who you are, your name and a few words about you. Memory: what is kept of a long chat. Below, how long the replies are.',
    },
    {
      target: '.sidebar',
      side: 'right',
      title: 'Your characters',
      text: 'Switch from one to another here. In Library you can import character cards, the picture files people share online, or describe a character in a sentence and have it written for you.',
    },
    {
      target: '.add-character',
      side: 'bottom',
      title: 'More than one',
      text: 'Bring a second character into the chat. They take turns answering, and can talk to each other.',
    },
  ]
})

// Only the steps whose target is on screen, worked out when the tour starts.
const shown = ref<TourStep[]>([])
const current = computed(() => (step.value === null ? null : (shown.value[step.value] ?? null)))
const isLast = computed(() => step.value !== null && step.value === shown.value.length - 1)

const bubble = ref<HTMLElement | null>(null)
const primary = ref<HTMLButtonElement | null>(null)
const hole = ref({ top: 0, left: 0, width: 0, height: 0 })
const place = ref({ top: 0, left: 0 })

const MARGIN = 16
const GAP = 14
const PADDING = 6

/** Puts the hole around the step's target, and the words beside it, inside the window. */
function layout(): void {
  const item = current.value
  const target = item && document.querySelector<HTMLElement>(item.target)
  if (!item || !target || !bubble.value) return

  target.scrollIntoView({ block: 'nearest' })
  const rect = target.getBoundingClientRect()
  hole.value = {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  }

  const { width, height } = bubble.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2 - width / 2
  const centerY = rect.top + rect.height / 2 - height / 2
  const spot = {
    top: { top: rect.top - PADDING - GAP - height, left: centerX },
    bottom: { top: rect.bottom + PADDING + GAP, left: centerX },
    left: { top: centerY, left: rect.left - PADDING - GAP - width },
    right: { top: centerY, left: rect.right + PADDING + GAP },
  }[item.side]
  place.value = {
    top: Math.min(window.innerHeight - height - MARGIN, Math.max(MARGIN, spot.top)),
    left: Math.min(window.innerWidth - width - MARGIN, Math.max(MARGIN, spot.left)),
  }
}

// flush: 'post' = once the words of the step are rendered, so they can be measured.
watch(
  step,
  (now, before) => {
    if (now === null) return
    if (before === null || before === undefined) {
      shown.value = steps.value.filter((item) => document.querySelector(item.target))
      if (shown.value.length === 0) {
        void end() // Nothing to show on this screen.
        return
      }
    }
    void nextTick(() => {
      layout()
      primary.value?.focus()
    })
  },
  { flush: 'post' },
)

function next(): void {
  if (step.value === null) return
  if (isLast.value) void end()
  else step.value++
}

function back(): void {
  if (step.value !== null && step.value > 0) step.value--
}

function onKeydown(event: KeyboardEvent): void {
  if (step.value === null) return
  if (event.key === 'Escape') void end()
  else if (event.key === 'ArrowRight') next()
  else if (event.key === 'ArrowLeft') back()
  else return
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('resize', layout)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', layout)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="current" class="tour">
    <!-- Catches every click while the tour runs: the screen behind is only shown, not used -->
    <div class="shade" />
    <div
      class="hole"
      :style="{ top: `${hole.top}px`, left: `${hole.left}px`, width: `${hole.width}px`, height: `${hole.height}px` }"
    />

    <section
      ref="bubble"
      class="bubble"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-text"
      :style="{ top: `${place.top}px`, left: `${place.left}px` }"
    >
      <h2 id="tour-title" class="title-serif">{{ current.title }}</h2>
      <p id="tour-text">{{ current.text }}</p>
      <p v-if="isLast" class="after">You will find this tour again, and plain-word explanations, in Settings › Help.</p>

      <footer>
        <span class="count">{{ step! + 1 }} of {{ shown.length }}</span>
        <button v-if="!isLast" type="button" class="skip" @click="end()">Skip the tour</button>
        <button v-if="step! > 0" type="button" class="btn btn-small" @click="back">Back</button>
        <button ref="primary" type="button" class="btn btn-small btn-primary" @click="next">
          {{ isLast ? 'Start chatting' : 'Next' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.tour {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.shade {
  position: absolute;
  inset: 0;
}

/* The hole is a clear box with a huge shadow: the shadow is what dims everything else. */
.hole {
  position: absolute;
  border-radius: var(--radius-lg);
  box-shadow:
    0 0 0 1px var(--accent-strong),
    0 0 0 9999px rgb(11 7 4 / 0.64);
  pointer-events: none;
  transition:
    top 0.3s ease,
    left 0.3s ease,
    width 0.3s ease,
    height 0.3s ease;
}

.bubble {
  position: absolute;
  width: 330px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-panel);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-xl);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
  transition:
    top 0.3s ease,
    left 0.3s ease;
}
h2 {
  font-size: 18px;
}
p {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
}
.after {
  color: var(--text-faint);
}

footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.count {
  flex: 1;
  font-size: 12px;
  color: var(--text-ghost);
  font-variant-numeric: tabular-nums;
}
.skip {
  padding: 0 4px;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-faint);
}
.skip:hover {
  color: var(--text);
}

@media (prefers-reduced-motion: reduce) {
  .hole,
  .bubble {
    transition: none;
  }
}
</style>
