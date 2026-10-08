<script setup lang="ts">
// Shown for an address that leads to no page. Built as 404.html, which the host of the
// site serves in that case.

const props = defineProps<{ error: { statusCode?: number } }>()
const missing = computed(() => props.error.statusCode === 404)

useSeoMeta({ title: missing.value ? 'Page not found · SillySimple' : 'Something went wrong · SillySimple', robots: 'noindex' })
</script>

<template>
  <NuxtLayout name="doc">
    <div class="lost">
      <AppMascot :size="120" mood="worried" />
      <h1>{{ missing ? 'There is no page here.' : 'Something went wrong.' }}</h1>
      <p class="lead">
        {{ missing ? 'The address may be mistyped, or the page may have moved.' : 'The page could not be shown. Trying again in a moment usually works.' }}
      </p>
      <a class="btn btn-main" href="/">Back to the home page</a>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.lost {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-5);
  padding-block: var(--space-7);
}
</style>
