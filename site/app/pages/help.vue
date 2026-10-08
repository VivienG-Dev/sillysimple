<script setup lang="ts">
import { HELP, WORDS } from '~/data/help'

// The Help page: what people ask before and after installing, by subject, then the app's
// few special words in plain language. The questions are in data/help.ts.

definePageMeta({ layout: 'doc' })

usePage({
  title: 'Help',
  description:
    'Answers about SillySimple: what it needs, which model you get, where your chats are kept, what leaves your computer, and what to do when a story goes wrong.',
  path: '/help/',
})

// The same questions and answers, in the form search engines read.
const config = useAppConfig()
useStructuredData({
  '@type': 'FAQPage',
  mainEntity: HELP.flatMap((group) => group.questions)
    .filter((item) => !item.needsCode || config.repo)
    .map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer.join(' ') },
    })),
})
</script>

<template>
  <div class="help">
    <MascotGuide heading="h1" title="Help" text="Here is what people ask before and after installing. None of it needs a terminal, and if a word is new to you, the list at the bottom says what it means." />

    <div class="layout">
      <!-- Where each subject is. It stays in sight on a wide screen. -->
      <nav class="subjects" aria-label="Subjects">
        <a v-for="group in HELP" :key="group.id" :href="`#${group.id}`">{{ group.title }}</a>
        <a href="#words">In plain words</a>
        <NuxtLink class="elsewhere" to="/guides/">The guides, step by step</NuxtLink>
      </nav>

      <div class="groups">
        <HelpGroup v-for="group in HELP" :key="group.id" :group="group" />

        <section id="words" class="words" aria-labelledby="words-title">
          <h2 id="words-title">In plain words</h2>
          <dl>
            <div v-for="item in WORDS" :key="item.word">
              <dt>{{ item.word }}</dt>
              <dd>{{ item.meaning }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: clamp(32px, 6vw, 88px);
  align-items: start;
}

.subjects {
  position: sticky;
  top: calc(var(--nav) + var(--space-5));
  display: flex;
  flex-direction: column;
}
.subjects a {
  padding-block: 9px;
  font-weight: 700;
  text-decoration: none;
}
.subjects a:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.subjects .elsewhere {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--frame-line);
  color: var(--panel-soft);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.words h2 {
  font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.25rem);
  margin-bottom: var(--space-3);
}
.words dl {
  margin: 0;
}
.words dl > div {
  display: grid;
  grid-template-columns: 11em minmax(0, 1fr);
  gap: var(--space-2) var(--space-5);
  padding-block: var(--space-4);
  border-top: 1px solid var(--frame-line);
}
dt {
  font-weight: 800;
}
dd {
  margin: 0;
  max-width: 40em;
  color: var(--panel-soft);
}

@media (max-width: 820px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  /* The subjects become a line of links above the questions. */
  .subjects {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0 var(--space-5);
  }
  .subjects .elsewhere {
    margin-top: 0;
    padding-top: 9px;
    border-top: 0;
  }
  .words dl > div {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
