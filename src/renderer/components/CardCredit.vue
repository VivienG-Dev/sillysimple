<script setup lang="ts">
import type { CardCreator } from '@shared/types'

// Who wrote a character card: "by Lyra". The name leads to the author's page in the app
// when they are a partner (see useAuthors), else to the address the card gives, if any.
// Shown wherever the character is presented, so the people who write characters (and
// the partners whose cards come with the app) are always credited.

const props = withDefaults(
  defineProps<{
    creator: CardCreator
    /** False inside something already clickable (a link cannot sit in a button): the name alone. */
    linked?: boolean
  }>(),
  { linked: true },
)

// A partner has a page in the app: "by" leads there rather than to the web.
const { partnerOf } = useAuthors()
const partner = computed(() => partnerOf(props.creator.name))
</script>

<template>
  <span class="credit">
    by
    <!-- Links open in the browser (see setWindowOpenHandler in src/main/index.ts). -->
    <RouterLink v-if="linked && partner" :to="`/authors/${partner.id}`" @click.stop>{{ creator.name }}</RouterLink>
    <a v-else-if="linked && creator.link" :href="creator.link" target="_blank" rel="noreferrer" :title="creator.link" @click.stop>{{
      creator.name
    }}</a>
    <span v-else class="who">{{ creator.name }}</span>
  </span>
</template>

<style scoped>
.credit {
  font-size: 11.5px;
  color: var(--text-faint);
  overflow-wrap: anywhere;
}
.who,
a {
  font-weight: 600;
  color: var(--text-dim);
}
a {
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: 2px;
}
a:hover {
  color: var(--text);
  text-decoration-color: currentColor;
}
</style>
