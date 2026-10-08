<script setup lang="ts">
// The list of guides. Each is a film of the real app with the icon saying what to do
// (data/guides.ts). Only those whose film has been made are listed.

definePageMeta({ layout: 'doc' })

usePage({
  title: 'Guides',
  description: 'Short guides to SillySimple, each with a film of the real app: your first chat, bringing your SillyTavern characters, and more.',
  path: '/guides/',
})
</script>

<template>
  <div class="guides">
    <MascotGuide
      heading="h1"
      title="Guides"
      text="One thing at a time, shown in the real app. I say what to do at each step, and you can stop the film whenever you like."
    />

    <ul class="list">
      <li v-for="guide in guides" :key="guide.slug">
        <GuideCard :guide="guide" />
      </li>
    </ul>

    <p class="elsewhere">Looking for a quick answer instead? <NuxtLink to="/help/">The Help page</NuxtLink> has the questions people ask.</p>
  </div>
</template>

<style scoped>
.guides {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}
.list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
}
.elsewhere {
  color: var(--panel-soft);
}
@media (max-width: 720px) {
  .list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
