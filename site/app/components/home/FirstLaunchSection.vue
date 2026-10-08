<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// The first launch, as it is in the app: three questions, in the app's own words.
// It is a real sequence, so it is numbered.
//
// Beside them, a picture of the third question. Once the top of the page has a film of
// its own (utils/films.ts), the film of the first launch comes here instead: the three
// questions then stand in a row above it.

const STEPS = [
  {
    question: 'What should characters call you?',
    detail: 'Your name, or the name of the role you play. You can change it anytime.',
  },
  {
    question: 'Where should replies come from?',
    detail: 'You can change all this later in Settings.',
    choices: [
      { name: 'On this computer', what: 'Private and offline. SillySimple runs the model itself: nothing else to install.' },
      { name: 'Another server', what: 'LM Studio, KoboldCpp, llama.cpp or any OpenAI-compatible address.' },
      { name: 'Online service', what: 'Claude, OpenAI, Mistral or OpenRouter, with your own API key.' },
    ],
  },
  {
    question: 'Which story do you want to start with?',
    detail: 'These stories come with the app. The others wait for you in the library, where you can also import cards or write your own.',
  },
]
</script>

<template>
  <section id="first-launch" class="launch" aria-labelledby="launch-title">
    <div class="wrap layout" :class="{ filmed: launchFilm }">
      <div class="words">
        <h2 id="launch-title">Three questions, then you are in.</h2>
        <ol class="steps">
          <li v-for="(step, index) in STEPS" :key="step.question" class="step">
            <span class="number" aria-hidden="true">{{ index + 1 }}</span>
            <div class="text">
              <h3>{{ step.question }}</h3>
              <p>{{ step.detail }}</p>
              <dl v-if="step.choices" class="choices">
                <div v-for="choice in step.choices" :key="choice.name">
                  <dt>{{ choice.name }}</dt>
                  <dd>{{ choice.what }}</dd>
                </div>
              </dl>
            </div>
          </li>
        </ol>
        <NuxtLink class="more" to="/guides/first-chat/">The same, step by step, in the guide<ArrowRight :size="18" :stroke-width="2.4" aria-hidden="true" /></NuxtLink>
      </div>

      <AppFilm v-if="launchFilm" :film="launchFilm" />
      <figure v-else class="shot">
        <img
          src="/shots/pick-a-story-900.webp"
          srcset="/shots/pick-a-story-900.webp 900w, /shots/pick-a-story.webp 1160w"
          sizes="(max-width: 900px) 100vw, 560px"
          width="1160"
          height="1030"
          loading="lazy"
          alt="The third question in the app. The icon asks “Which story do you want to start with?”, above the eight stories to choose from."
        />
      </figure>
    </div>
  </section>
</template>

<style scoped>
.launch {
  padding-block: var(--band);
  background: linear-gradient(to bottom, var(--page-3), var(--page-4));
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(32px, 6vw, 88px);
  align-items: center;
}
.words {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
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

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.step {
  display: flex;
  gap: var(--space-4);
}
.number {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cream);
  color: var(--ink);
  border-radius: 50%;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.text {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: 5px;
}
h3 {
  font-size: 1.375rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-3) 0 0;
  padding-left: var(--space-4);
  border-left: 2px solid var(--cream);
}
dt {
  font-weight: 800;
}
dd {
  margin: 0;
}

/* The app's own screen, tilted a little: a card laid on the table. */
.shot {
  border-radius: var(--radius-xl);
  overflow: hidden;
  rotate: 1.5deg;
  box-shadow:
    0 0 0 1px var(--frame-line),
    0 40px 60px -26px rgb(var(--shade) / 0.75);
}
.shot img {
  width: 100%;
  height: auto;
}

/* With the film: the title, the three questions side by side, then the film at full width. */
.layout.filmed {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-7);
}
.filmed .steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-6);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .filmed .steps {
    grid-template-columns: 1fr;
  }
  .shot {
    rotate: none;
  }
}
</style>
