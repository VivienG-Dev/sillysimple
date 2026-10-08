<script setup lang="ts">
import type { MascotMood } from './AppMascot.vue'

// The icon as a guide, as at the app's first launch (src/renderer/components/MascotGuide.vue):
// it hovers in place and says what a page or a step is about, in a speech bubble. The
// words are written as it speaks, and its mouth moves meanwhile; a click on the bubble
// shows them all at once. When what it says changes, it gives a start and speaks again.
//
// For the site: the bubble is cream, like everything the icon says on these pages; the
// title can be the page's own (`heading`); and the whole text is in the page as it is
// built, for search engines and for whoever has no scripts or asked for less motion.

const props = withDefaults(
  defineProps<{
    title: string
    text: string
    mood?: MascotMood
    /** What the title is in the page: its main title, a title of a part, or just words. */
    heading?: 'h1' | 'h2' | 'p'
    /** The size of the icon, in pixels. */
    size?: number
    /**
     * Everything it will say in this place, one text after the other: the bubble takes the
     * height of the longest, so that what is under it does not move when it changes subject.
     */
    room?: string[]
  }>(),
  { mood: 'idle', heading: 'p', size: 84, room: () => [] },
)

/** How long each letter takes. Fast: it is there to be read, not watched. */
const LETTER_MS = 16

/** How many letters are written so far. Null: all of them, nothing is being written. */
const written = ref<number | null>(null)
const speaking = computed(() => written.value !== null && written.value < props.text.length)
/** The script has taken over: until then the words wait unseen (see base.css). */
const ready = ref(false)
let timer = 0
let still = true

function say(): void {
  clearInterval(timer)
  if (still) {
    written.value = null
    return
  }
  written.value = 0
  timer = window.setInterval(() => {
    const done = written.value ?? props.text.length
    // A breath at the end of a sentence.
    const last = props.text[done - 1]
    if (last && '.!?:'.includes(last) && props.text[done] === ' ' && Math.random() < 0.8) return
    written.value = Math.min(props.text.length, done + 1)
    if (!speaking.value) clearInterval(timer)
  }, LETTER_MS)
}

function sayItAll(): void {
  clearInterval(timer)
  written.value = props.text.length
}

const mascot = ref<{ cheer(): void; perk(): void } | null>(null)
const bubble = ref<HTMLElement | null>(null)

onMounted(() => {
  still = matchMedia('(prefers-reduced-motion: reduce)').matches
  say()
  ready.value = true
})
onBeforeUnmount(() => clearInterval(timer))

// A new subject: the bubble bounces from its tail, the icon gives a start, and it speaks.
watch([() => props.title, () => props.text], () => {
  say()
  if (still) return
  bubble.value?.animate({ transform: ['scale(0.97)', 'scale(1.012)', 'scale(1)'] }, { duration: 320, easing: 'ease-out' })
  if (props.mood === 'idle' || props.mood === 'waiting') mascot.value?.perk()
})
</script>

<template>
  <div class="mascot-guide" :class="{ ready }">
    <div class="hover">
      <AppMascot ref="mascot" :size="size" :mood="mood" :talking="speaking" />
    </div>

    <!-- A click writes the rest at once, for who reads faster than it speaks. -->
    <div ref="bubble" class="said" @click="sayItAll">
      <component :is="heading" :key="title" class="title">{{ title }}</component>
      <!-- The whole text is always there: it keeps the bubble at its final size and is what a
           screen reader reads. While it speaks, the letters written so far lie over it. -->
      <p class="words">
        <span class="whole" :class="{ unseen: written !== null && speaking }">{{ text }}</span>
        <span v-if="speaking" class="so-far" aria-hidden="true">{{ text.slice(0, written ?? 0) }}</span>
        <span v-for="other in room" :key="other" class="room" aria-hidden="true">{{ other }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.mascot-guide {
  display: flex;
  align-items: center;
  gap: clamp(16px, 2.4vw, 28px);
}

/* It hovers in place: up and down, leaning a little. */
.hover {
  flex-shrink: 0;
  animation: guide-hover 4.2s ease-in-out infinite;
  filter: drop-shadow(0 10px 18px rgb(var(--shade) / 0.5));
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

/* What it says: cream, with a tail towards it. */
.said {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: clamp(16px, 2.2vw, 24px) clamp(20px, 2.6vw, 30px);
  background: var(--cream);
  color: var(--ink);
  border-radius: var(--radius-bubble);
  /* It bounces from where it is said. */
  transform-origin: 0 50%;
}
.said::before {
  content: '';
  position: absolute;
  left: -9px;
  top: 50%;
  width: 22px;
  height: 22px;
  margin-top: -11px;
  background: inherit;
  border-bottom-left-radius: 6px;
  transform: rotate(45deg);
}

.title {
  position: relative;
  font-size: clamp(1.375rem, 1.1rem + 1.2vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  text-wrap: balance;
  animation: guide-title 0.3s ease-out 1;
}
@keyframes guide-title {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
}

.words {
  position: relative;
  display: grid;
  max-width: 44em;
  font-size: var(--text-lead);
  line-height: 1.45;
}
/* One over the other, in the same place. */
.words > * {
  grid-area: 1 / 1;
}
.whole.unseen,
.room {
  visibility: hidden;
}
@media (max-width: 560px) {
  .mascot-guide {
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
  }
  /* The tail goes up, to the icon above. */
  .said::before {
    left: 30px;
    top: 0;
    margin-top: -9px;
  }
  .said {
    transform-origin: 30px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hover {
    animation: none;
  }
}
</style>
