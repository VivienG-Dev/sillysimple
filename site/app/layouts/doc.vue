<script setup lang="ts">
// The layout of the pages that are read (help, guides): the same bar and foot, and the
// page in one column on a single background, with room above and under it.
</script>

<template>
  <div class="site">
    <SiteNav />
    <main id="content" class="doc">
      <div class="wrap">
        <slot />
      </div>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.doc {
  /* Tall enough for a short page to push the foot to the bottom of the window. */
  min-height: calc(100vh - var(--nav));
  padding-block: clamp(32px, 5vw, 64px) var(--space-9);
  background: linear-gradient(to bottom, var(--page-0), var(--page-3));
}
</style>
