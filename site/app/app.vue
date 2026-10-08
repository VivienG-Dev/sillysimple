<script setup lang="ts">
// Every page goes through its layout (layouts/): the bar at the top, the page, the foot.
// What a page says about itself to browsers and search engines is set by the page, with
// usePage (composables/usePage.ts).
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
