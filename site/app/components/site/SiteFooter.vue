<script setup lang="ts">
import { siGithub } from 'simple-icons'
import wordmark from '~/assets/brand/wordmark.png'

// The foot of every page: where the site leads to, what SillySimple is not, and its licence.
//
// GitHub's mark stands at the end of the links. It comes from the simple-icons package, not
// drawn here. Until the code is public (`repo` in app.config.ts) it leads nowhere and says
// so; with the address it is the link to the code.

const config = useAppConfig()
</script>

<template>
  <footer class="footer">
    <div class="wrap bar">
      <NuxtLink class="home" to="/" aria-label="SillySimple, home">
        <img :src="wordmark" alt="" width="99" height="28" loading="lazy" />
      </NuxtLink>
      <nav class="links" aria-label="Site">
        <NuxtLink v-for="link in FOOT_LINKS" :key="link.to" :to="link.to">{{ link.label }}</NuxtLink>
        <a v-if="config.repo" class="code" :href="config.repo">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path :d="siGithub.path" /></svg>Source code
        </a>
        <span v-else class="code soon" title="The code will be on GitHub">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path :d="siGithub.path" /></svg>
          <span class="sr-only">The code will be on GitHub.</span>
        </span>
      </nav>
      <p>
        SillySimple is an independent project. It reads SillyTavern character cards, and is not affiliated with SillyTavern.
        <template v-if="config.repo">It is free software, under the GPL-3.0 licence.</template>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding-block: var(--space-6) var(--space-7);
  background: var(--page-6);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4) var(--space-7);
  font-size: var(--text-small);
}
.home img {
  width: auto;
  height: 28px;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--space-5);
  /* The sentence goes to the other end, or under on a narrow screen. */
  margin-right: auto;
}
.links a {
  /* Tall enough for a finger. */
  padding-block: 8px;
  font-weight: 700;
  text-decoration: none;
}
.code {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  /* As tall as the links beside it. */
  min-height: 40px;
}
.code svg {
  fill: currentColor;
}
/* Not a link yet: quieter than the links, so that nobody tries to press it. */
.code.soon {
  opacity: 0.55;
}
.links a:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.bar p {
  max-width: 36em;
}
</style>
