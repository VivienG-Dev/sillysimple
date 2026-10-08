<script setup lang="ts">
import type { HelpGroup } from '~/data/help'

// One subject of the Help page: its title, and its questions with their answers, all in
// sight (nothing to unfold: a page that is searched with the browser has to show its text).
// Each question has its own address, to send to someone.

const props = defineProps<{ group: HelpGroup }>()

// Where the code is, when it is public: some answers end with a link to it.
const config = useAppConfig()
const questions = computed(() => props.group.questions.filter((item) => !item.needsCode || config.repo))
</script>

<template>
  <section :id="group.id" class="group" :aria-labelledby="`${group.id}-title`">
    <h2 :id="`${group.id}-title`">{{ group.title }}</h2>
    <article v-for="item in questions" :id="item.id" :key="item.id" class="question">
      <h3>
        <a :href="`#${item.id}`">{{ item.question }}</a>
      </h3>
      <p v-for="paragraph in item.answer" :key="paragraph">{{ paragraph }}</p>
      <template v-if="item.code">
        <p v-if="config.repo"><a :href="config.repo + (item.code.path ?? '')">{{ item.code.link }}</a></p>
        <p v-else-if="item.code.until">{{ item.code.until }}</p>
      </template>
    </article>
  </section>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
}
h2 {
  font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.25rem);
  margin-bottom: var(--space-3);
}

.question {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-block: var(--space-5);
  border-top: 1px solid var(--frame-line);
}
h3 {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
h3 a {
  text-decoration: none;
}
h3 a:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.question p {
  max-width: 40em;
  color: var(--panel-soft);
}
/* The question one was sent to stands out for a moment. */
.question:target h3 {
  text-decoration: underline;
  text-decoration-color: var(--orange);
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
}
</style>
