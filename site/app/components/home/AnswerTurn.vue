<script setup lang="ts">
// One question and its answer, played as a chat when it comes into sight: the question
// lands, the icon "writes" for a moment (three dots, as in the app), then answers.
// Without motion, or without scripts, both are simply there.

defineProps<{ question: string; answer: string }>()

const turn = ref<HTMLElement | null>(null)
const unseen = useSeen(turn, 0.6)

/** The icon is still writing its answer. */
const writing = ref(false)
watch(unseen, (now, before) => {
  if (!before || now) return
  writing.value = true
  setTimeout(() => (writing.value = false), 720)
})
</script>

<template>
  <li ref="turn" class="turn" :class="{ unseen, writing }">
    <p class="question">{{ question }}</p>
    <div class="reply">
      <AppIcon class="who" :size="44" />
      <p class="bubble answer">
        <span class="said">{{ answer }}</span>
        <span class="dots" aria-hidden="true"><i /><i /><i /></span>
      </p>
    </div>
  </li>
</template>

<style scoped>
.turn {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* The visitor's side of the chat: to the right. */
.question {
  align-self: flex-end;
  max-width: 24em;
  padding: 14px 22px;
  background: var(--ask-bg);
  color: var(--ask-text);
  border-radius: var(--radius-bubble) var(--radius-bubble) 6px var(--radius-bubble);
  font-size: var(--text-lead);
  font-weight: 700;
  line-height: 1.3;
  transform-origin: 100% 100%;
  transition:
    opacity 0.25s ease-out,
    transform 0.35s cubic-bezier(0.3, 1.5, 0.5, 1);
}

.reply {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  transition: opacity 0.25s ease-out 0.25s;
}
.who {
  flex-shrink: 0;
  margin-bottom: -14px;
}
.answer {
  position: relative;
  max-width: 30em;
  padding: 20px 26px;
  /* A tighter corner where the tail leaves, towards who is speaking. */
  border-bottom-left-radius: 10px;
  font-size: var(--text-lead);
  line-height: 1.45;
  transform-origin: 0 100%;
  transition: transform 0.35s cubic-bezier(0.3, 1.5, 0.5, 1) 0.25s;
}
.answer::after {
  left: 8px;
}
.said {
  transition: opacity 0.2s ease-out;
}

/* Three dots while the icon writes, as in the app. They sit over the answer, which keeps
   its place underneath: the bubble has its final size from the start. */
.dots {
  position: absolute;
  left: 26px;
  top: 50%;
  display: flex;
  gap: 6px;
  translate: 0 -50%;
  opacity: 0;
  transition: opacity 0.15s;
}
.dots i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ink-soft);
  animation: writing 0.9s ease-in-out infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes writing {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

/* --- Before it is seen, and while the answer is being written ----------------------- */

.unseen .question {
  opacity: 0;
  transform: translateY(10px) scale(0.92);
}
.unseen .reply {
  opacity: 0;
}
.unseen .answer {
  transform: scale(0.92);
}
.unseen .said,
.writing .said {
  opacity: 0;
}
.writing .dots {
  opacity: 1;
}
</style>
