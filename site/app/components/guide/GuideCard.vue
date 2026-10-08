<script setup lang="ts">
// A guide in the list of guides: the first picture of its film, what it is about, how long.

defineProps<{ guide: ReadyGuide }>()
</script>

<template>
  <NuxtLink class="card" :to="`/guides/${guide.slug}/`">
    <span class="picture">
      <img :src="`/film/${guide.film.name}-poster.webp`" alt="" width="1680" height="1052" loading="lazy" />
    </span>
    <span class="about">
      <span class="title">{{ guide.title }}</span>
      <span class="summary">{{ guide.summary }}</span>
      <span class="length">{{ guide.steps.length }} steps · {{ filmLasts(guide.film) }}</span>
    </span>
  </NuxtLink>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--panel-bg);
  color: var(--panel-text);
  border-radius: var(--radius-bubble);
  text-decoration: none;
  transition: translate 0.2s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.card:hover {
  translate: 0 -4px;
}
.picture {
  display: block;
  border-bottom: 1px solid var(--frame-line);
}
.picture img {
  width: 100%;
  height: auto;
}
.about {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: clamp(20px, 2.6vw, 28px);
}
.title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.summary {
  color: var(--panel-soft);
}
.length {
  margin-top: var(--space-2);
  color: var(--panel-soft);
  font-size: var(--text-small);
  font-weight: 700;
}
</style>
