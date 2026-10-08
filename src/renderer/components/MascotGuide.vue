<script setup lang="ts">
import type { MascotMood } from './AppMascot.vue'

// The mascot as a guide (Vivien's idea, 7 October: "a real welcome, with the logo that
// talks"): it stands at the top of the first launch, hovering in place, and says what
// the step is about in a speech bubble. The words are written as it speaks, and its
// mouth moves meanwhile; a click on the bubble shows them all at once.
//
// What it says follows what happens on the page (another choice is picked, a download
// ends). When it changes subject it shows: the mascot gives a start, the bubble bounces
// from its tail and slides to its new height, and the new words are written in turn.
//
// It stays where it is rather than following the pointer: next to the pointer it would
// sit on what the user is about to click.

const props = withDefaults(
  defineProps<{
    title: string
    text: string
    mood?: MascotMood
    /** What it keeps an eye on while it waits (see AppMascot). */
    watches?: HTMLElement | null
    watchesAt?: number
    /** Plays the logo's entrance when it first shows up. */
    entrance?: boolean
  }>(),
  { mood: 'idle', watches: null, watchesAt: 1, entrance: false },
)

/** How long each letter takes. Fast: it is there to be read, not watched. */
const LETTER_MS = 16

const still = matchMedia('(prefers-reduced-motion: reduce)').matches
/** How many letters of the text are written so far. */
const written = ref(0)
const speaking = computed(() => written.value < props.text.length)
let timer = 0

function say(): void {
  clearInterval(timer)
  if (still) {
    written.value = props.text.length
    return
  }
  written.value = 0
  timer = window.setInterval(() => {
    // A breath at the end of a sentence.
    const last = props.text[written.value - 1]
    if (last && '.!?:'.includes(last) && props.text[written.value] === ' ' && Math.random() < 0.8) return
    written.value = Math.min(props.text.length, written.value + 1)
    if (!speaking.value) clearInterval(timer)
  }, LETTER_MS)
}

function sayItAll(): void {
  clearInterval(timer)
  written.value = props.text.length
}

watch(() => props.text, say, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

const mascot = ref<{ cheer(): void; perk(): void } | null>(null)
defineExpose({ cheer: () => mascot.value?.cheer() })

// --- Changing subject ----------------------------------------------------------------

const bubble = ref<HTMLElement | null>(null)

// Runs before the page is drawn again: the bubble still has the size of what it said.
watch([() => props.title, () => props.text], async () => {
  const box = bubble.value
  if (!box || still) return
  const before = box.offsetHeight
  await nextTick()
  const after = box.offsetHeight
  // Its new height is the one of the whole text, not yet written: it slides there, and
  // what is under the guide follows instead of jumping.
  if (after !== before) {
    box.animate({ height: [`${before}px`, `${after}px`] }, { duration: 280, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' })
  }
  box.animate({ transform: ['scale(0.96)', 'scale(1.015)', 'scale(1)'] }, { duration: 320, easing: 'ease-out' })
  // Glad or worried, it already moves (see AppMascot): one move at a time.
  if (props.mood === 'idle' || props.mood === 'waiting') mascot.value?.perk()
})
</script>

<template>
  <div class="guide">
    <div class="hover">
      <!-- The entrance covers the page: it starts speaking once it has landed. -->
      <LogoIntro
        v-if="entrance"
        ref="mascot"
        class="figure"
        :size="76"
        auto
        :mood="mood"
        :talking="speaking"
        :watches="watches"
        :watches-at="watchesAt"
        @landed="say"
      />
      <AppMascot v-else ref="mascot" class="figure" :size="76" :mood="mood" :talking="speaking" :watches="watches" :watches-at="watchesAt" />
    </div>

    <!-- A click writes the rest at once, for who reads faster than it speaks. -->
    <div ref="bubble" class="bubble" :class="mood" @click="sayItAll">
      <!-- With a key: a new title is a new element, which comes in with its animation. -->
      <h1 :key="title" class="title-serif">{{ title }}</h1>
      <!-- The whole text is there from the start, unseen: it keeps the bubble at its final
           size and is what a screen reader reads. The letters written so far lie over it. -->
      <p class="words" aria-live="polite">
        <span class="whole">{{ text }}</span>
        <span class="so-far" aria-hidden="true">{{ text.slice(0, written) }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.guide {
  display: flex;
  align-items: center;
  gap: 22px;
  width: 100%;
}

/* It hovers in place: up and down, leaning a little. */
.hover {
  flex-shrink: 0;
  animation: guide-hover 4.2s ease-in-out infinite;
}
.figure {
  filter: drop-shadow(0 8px 16px rgb(0 0 0 / 0.35));
}
@keyframes guide-hover {
  0%,
  100% {
    transform: translateY(3px) rotate(-1.5deg);
  }
  50% {
    transform: translateY(-5px) rotate(1.5deg);
  }
}

.bubble {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px 17px;
  background: var(--bg-panel);
  border: 1.5px solid var(--border-strong);
  border-radius: 18px;
  /* It bounces from where it is said. */
  transform-origin: 0 50%;
  transition: border-color 0.2s ease-out;
}
/* The tail of the bubble, towards whoever speaks. */
.bubble::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  width: 14px;
  height: 14px;
  margin-top: -7px;
  background: inherit;
  border-left: 1.5px solid var(--border-strong);
  border-bottom: 1.5px solid var(--border-strong);
  border-bottom-left-radius: 4px;
  transform: rotate(45deg);
}
.bubble.worried,
.bubble.worried::before {
  border-color: var(--danger-border);
}

h1 {
  font-size: 22px;
  line-height: 1.2;
  animation: guide-title 0.3s ease-out 1;
}
@keyframes guide-title {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
}

.words {
  display: grid;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-soft);
}
.words > * {
  grid-area: 1 / 1;
}
.whole {
  color: transparent;
  user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  .hover,
  h1 {
    animation: none;
  }
}
</style>
