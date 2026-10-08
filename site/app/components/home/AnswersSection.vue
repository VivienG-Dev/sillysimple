<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// What people ask before they install it, answered the way the app talks: as a chat.
// The questions are the visitor's; the answers are the icon's, in its cream bubbles.
// Each turn plays when it comes into sight (AnswerTurn.vue).

const THREAD = [
  {
    question: 'Do I have to install a model first?',
    answer:
      'No. Choose “On this computer” and SillySimple downloads a model and the engine that runs it. After that it works offline.',
  },
  {
    question: 'I have never written a character.',
    answer:
      'Describe one in a sentence and the model writes the whole card: who they are, how they talk, their first message. You can change any of it.',
  },
  {
    question: 'What happens when a chat gets very long?',
    answer:
      'Older messages are summed up instead of dropped, so the character keeps the thread. You can read what it remembers, and correct it.',
  },
  {
    question: 'Can several characters be in one scene?',
    answer: 'Up to four. They answer in turn, or you click a name to make someone speak. They can talk to each other.',
  },
  {
    question: 'Will my SillyTavern characters work?',
    answer: 'Yes. Drop their PNG or JSON cards into the library. Greetings, lorebooks and favourites come with them.',
  },
]
</script>

<template>
  <section class="answers" aria-labelledby="answers-title">
    <div class="wrap layout">
      <div class="intro">
        <h2 id="answers-title">It does the setting up.</h2>
        <p class="lead">The things people ask before they try it, and the short answers.</p>
        <NuxtLink class="more" to="/help/">More questions, on the Help page<ArrowRight :size="18" :stroke-width="2.4" aria-hidden="true" /></NuxtLink>
      </div>

      <ol class="thread">
        <AnswerTurn v-for="turn in THREAD" :key="turn.question" :question="turn.question" :answer="turn.answer" />
      </ol>
    </div>
  </section>
</template>

<style scoped>
.answers {
  padding-block: var(--band);
  background: linear-gradient(to bottom, var(--page-1), var(--page-2));
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(32px, 6vw, 96px);
  align-items: start;
}
.more {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding-block: 8px;
  font-weight: 700;
  text-underline-offset: 5px;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  /* Stays in sight while the thread goes by. */
  position: sticky;
  top: calc(var(--nav) + var(--space-5));
}

.thread {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .intro {
    position: static;
  }
}
</style>
