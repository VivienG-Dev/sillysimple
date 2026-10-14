<script setup lang="ts">
import { Download } from '@lucide/vue'

// Where the app is downloaded. An installer whose address is not in app.config.ts yet is
// shown as not out, with no button: the page never offers a download that leads nowhere.

const config = useAppConfig()

// The Mac has two installers: the button is for an Apple chip, which nearly every Mac sold
// since 2021 has, and the Intel one is a small link under it. A browser cannot tell the two
// Macs apart reliably, so the visitor picks.
const PLATFORMS = [
  { key: 'mac', name: 'Mac', file: 'For an Apple chip (M1 or later)' },
  { key: 'windows', name: 'Windows', file: 'An installer' },
  { key: 'linux', name: 'Linux', file: 'An AppImage' },
] as const

const isOut = computed(() => Object.values(config.downloads).some(Boolean))

// The icon hops once, the first time the visitor gets here.
const section = ref<HTMLElement | null>(null)
const unseen = useSeen(section, 0.5)
const glad = ref(false)
watch(unseen, (now, before) => {
  if (!before || now) return
  glad.value = true
  setTimeout(() => (glad.value = false), 1200)
})
</script>

<template>
  <section id="download" ref="section" class="download" aria-labelledby="download-title">
    <div class="wrap layout">
      <AppMascot class="icon" :size="132" :mood="glad ? 'happy' : 'idle'" />
      <h2 id="download-title">{{ isOut ? 'Get SillySimple.' : 'SillySimple is not out yet.' }}</h2>
      <p class="lead">
        {{
          isOut
            ? 'It is free. Open it, answer three questions, and you are in a story.'
            : 'The first version is being prepared for Mac, Windows and Linux, and it will be free. This page will carry it as soon as it is ready.'
        }}
      </p>

      <ul class="platforms">
        <li v-for="platform in PLATFORMS" :key="platform.key">
          <a v-if="config.downloads[platform.key]" class="btn btn-cream" :href="config.downloads[platform.key]">
            <Download :size="19" :stroke-width="2.4" aria-hidden="true" />Download for {{ platform.name }}
          </a>
          <span v-else class="pending">{{ platform.name }}</span>
          <span class="file">{{ config.downloads[platform.key] ? platform.file : 'Not out yet' }}</span>
          <a v-if="platform.key === 'mac' && config.downloads.macIntel" class="file other" :href="config.downloads.macIntel">
            Mac with an Intel chip? Get this one
          </a>
          <!-- The installer is not signed: say so before Windows does, in its own words. -->
          <NuxtLink v-if="platform.key === 'windows' && config.downloads.windows" class="file other" to="/help/#windows-warning">
            Windows warns once: More info › Run anyway
          </NuxtLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.download {
  padding-block: var(--band) calc(var(--band) * 0.8);
  background: linear-gradient(to bottom, var(--page-5), var(--page-6));
}

.layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  text-align: center;
}
.icon {
  filter: drop-shadow(0 18px 22px rgb(var(--shade) / 0.5));
  margin-bottom: var(--space-3);
}

.platforms {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-5) var(--space-6);
  margin-top: var(--space-5);
}
.platforms li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
/* A platform whose installer is not there yet: its name in an outline, no button. */
.pending {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 0 26px;
  border: 2px dashed var(--cream);
  border-radius: var(--radius-pill);
  font-weight: 700;
}
.file {
  font-size: var(--text-small);
}
/* The Intel Mac's installer: a plain link, under the line saying what the button is for. */
.other {
  margin-top: calc(var(--space-2) * -1);
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  opacity: 0.85;
}
.other:hover {
  opacity: 1;
}
</style>
