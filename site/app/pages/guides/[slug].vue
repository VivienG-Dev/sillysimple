<script setup lang="ts">
import { ArrowLeft, ArrowRight, Play } from '@lucide/vue'

// One guide: its film with the icon talking over it, then the same steps written out, for
// whoever would rather read. Every guide of utils/guides.ts gets its page when the site is built.

definePageMeta({ layout: 'doc' })

const route = useRoute()
const index = guides.findIndex((item) => item.slug === route.params.slug)
if (index < 0) throw createError({ statusCode: 404, statusMessage: 'No such guide', fatal: true })
const guide = guides[index]!
const next = guides[index + 1] ?? null

usePage({ title: guide.title, description: guide.summary, path: `/guides/${guide.slug}/` })

useStructuredData({
  '@type': 'HowTo',
  name: guide.title,
  description: guide.summary,
  step: guide.steps.map((step, position) => ({ '@type': 'HowToStep', position: position + 1, name: step.title, text: step.says })),
})

const stage = ref<{ show(index: number): void } | null>(null)
const stageBox = ref<HTMLElement | null>(null)

/** Goes to a step in the film, and brings the film back in sight. */
function show(step: number): void {
  stage.value?.show(step)
  stageBox.value?.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <article class="guide">
    <header class="head">
      <NuxtLink class="back" to="/guides/"><ArrowLeft :size="16" :stroke-width="2.4" aria-hidden="true" />All guides</NuxtLink>
      <h1>{{ guide.title }}</h1>
      <p class="lead">{{ guide.summary }}</p>
    </header>

    <div ref="stageBox" class="stage-box">
      <GuideStage ref="stage" :guide="guide" />
    </div>

    <section class="written" aria-labelledby="written-title">
      <h2 id="written-title">Step by step</h2>
      <ol>
        <li v-for="(step, position) in guide.steps" :key="step.title">
          <span class="number" aria-hidden="true">{{ position + 1 }}</span>
          <div class="text">
            <h3>{{ step.title }}</h3>
            <p>{{ step.says }}</p>
            <button type="button" class="see" @click="show(position)">
              <Play :size="14" :stroke-width="2.6" aria-hidden="true" />Show it in the film
            </button>
          </div>
        </li>
      </ol>
    </section>

    <footer class="after">
      <NuxtLink v-if="next" class="btn btn-cream" :to="`/guides/${next.slug}/`">
        Next: {{ next.title }}<ArrowRight :size="18" :stroke-width="2.4" aria-hidden="true" />
      </NuxtLink>
      <NuxtLink class="plain" to="/help/">Something is not as shown? See Help</NuxtLink>
    </footer>
  </article>
</template>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-block: 8px;
  color: var(--panel-soft);
  font-weight: 700;
  text-decoration: none;
}
.back:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* Under the bar at the top when a step sends back to it. */
.stage-box {
  scroll-margin-top: var(--space-4);
}

.written {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.written h2 {
  font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.25rem);
}
ol {
  display: flex;
  flex-direction: column;
}
li {
  display: flex;
  gap: var(--space-4);
  padding-block: var(--space-5);
  border-top: 1px solid var(--frame-line);
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
  align-items: flex-start;
  gap: var(--space-2);
  padding-top: 5px;
}
h3 {
  font-size: 1.375rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.text p {
  max-width: 40em;
  color: var(--panel-soft);
}
.see {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin-top: var(--space-1);
  padding: 0 18px;
  background: transparent;
  border: 1px solid var(--field-line);
  border-radius: var(--radius-pill);
  font-weight: 700;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.see:hover {
  background: var(--text);
  border-color: var(--text);
  color: var(--text-inverse);
}

.after {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4) var(--space-6);
}
.plain {
  color: var(--panel-soft);
  font-weight: 700;
}
</style>
