<script setup lang="ts">
import { Download } from '@lucide/vue'

// The first screen: what the app is, its icon, and a film of the app (utils/films.ts says which).
// The icon is the one large orange thing on the page.

const config = useAppConfig()

type Platform = 'mac' | 'windows' | 'linux'
const NAMES: Record<Platform, string> = { mac: 'Mac', windows: 'Windows', linux: 'Linux' }

/** Is there at least one installer to download? Until then the page does not offer one. */
const isOut = computed(() => Object.values(config.downloads).some(Boolean))

/** The visitor's own system, known once the page is in their browser. */
const platform = ref<Platform | null>(null)
onMounted(() => {
  const agent = navigator.userAgent
  platform.value = /Mac/i.test(agent) ? 'mac' : /Win/i.test(agent) ? 'windows' : /Linux|X11/i.test(agent) ? 'linux' : null
})

/** Straight to the visitor's installer when it exists, to the list of them otherwise. */
const download = computed(() => {
  const mine = platform.value ? config.downloads[platform.value] : ''
  return mine ? { href: mine, label: `Download for ${NAMES[platform.value!]}` } : { href: '#download', label: 'Download SillySimple' }
})

// The icon's face is glad when the pointer, or the keyboard, comes to the main button.
const glad = ref(false)
</script>

<template>
  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap top">
      <div class="words">
        <h1 id="hero-title">Chat with AI characters on your own computer.</h1>
        <p class="lead">
          {{ config.repo ? 'Free and open source' : 'Free' }}, with no account, no terminal and nothing to set up. Made for a Mac with
          an Apple chip, or a PC with a graphics card.
        </p>
        <div class="actions">
          <a
            v-if="isOut"
            class="btn btn-main"
            :href="download.href"
            @pointerenter="glad = true"
            @pointerleave="glad = false"
            @focus="glad = true"
            @blur="glad = false"
          >
            <Download :size="19" :stroke-width="2.4" aria-hidden="true" />{{ download.label }}
          </a>
          <a
            class="btn"
            :class="isOut ? 'btn-cream' : 'btn-main'"
            href="#stories"
            @pointerenter="glad = !isOut"
            @pointerleave="glad = false"
            @focus="glad = !isOut"
            @blur="glad = false"
          >
            See the stories
          </a>
        </div>
        <p v-if="platform === 'mac' && config.downloads.mac && config.downloads.macIntel" class="soon">
          The button is for a Mac with an Apple chip. With an Intel chip:
          <a :href="config.downloads.macIntel">this one</a>.
        </p>
        <p v-if="!isOut" class="soon">Not out yet. The first version is being prepared for Mac, Windows and Linux.</p>
      </div>
      <div class="face">
        <AppMascot :size="null" :mood="glad ? 'happy' : 'idle'" />
      </div>
    </div>

    <div class="wrap">
      <AppFilm v-if="topFilm" :film="topFilm" />
    </div>
  </section>
</template>

<style scoped>
.hero {
  padding-block: clamp(24px, 3.5vw, 48px) var(--band);
  background: linear-gradient(to bottom, var(--page-0), var(--page-1));
}

.top {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.5fr);
  align-items: center;
  gap: clamp(20px, 4vw, 56px);
  margin-bottom: clamp(32px, 4.5vw, 64px);
}
.words {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-5);
}
/* Sized to sit on two lines beside the icon. */
h1 {
  font-size: clamp(2.5rem, 1.1rem + 4.2vw, 4.25rem);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.soon {
  font-weight: 400;
}
.soon a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* The icon, large. It comes in once, with a small bounce. */
.face {
  justify-self: center;
  width: min(100%, 340px);
  aspect-ratio: 1;
  filter: drop-shadow(0 26px 30px rgb(var(--shade) / 0.28));
  animation: arrive 0.62s cubic-bezier(0.3, 1.5, 0.5, 1) 0.1s both;
}
.face :deep(.mascot) {
  width: 100%;
  height: 100%;
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: scale(0.72) rotate(-8deg);
  }
}

@media (max-width: 820px) {
  .top {
    grid-template-columns: 1fr;
  }
  /* On a phone the icon comes first, smaller: it is who is speaking. */
  .face {
    order: -1;
    justify-self: start;
    width: 132px;
    margin-left: -8px;
  }
}
</style>
