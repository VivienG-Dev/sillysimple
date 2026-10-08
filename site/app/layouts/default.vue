<script setup lang="ts">
// The layout of the home page: the bar, the page from edge to edge, the foot.
// Each part of the page brings its own background and width.
</script>

<template>
  <div class="site">
    <SiteNav />
    <main id="content">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
