<script setup lang="ts">
import { Menu, X } from '@lucide/vue'
import wordmark from '~/assets/brand/wordmark.png'

// The bar at the top of every page: the logo, where the site leads to, and the download.
//
// It stays at the top of the window, so that the download is always one click away. Once the
// page has moved under it, a thin line marks its lower edge.
//
// On a phone the links are behind a menu button. It is a <details>: it opens without any
// script, and the script only closes it (a link was followed, Escape, a click elsewhere).
//
// The logo leads home. On the home page, where it would lead nowhere, a click plays its
// entrance instead, as in the app's Help page.

const route = useRoute()
const intro = ref<{ play: () => void } | null>(null)

function onLogo(event: MouseEvent): void {
  if (route.path !== '/') return
  event.preventDefault()
  intro.value?.play()
}

const moved = ref(false)
function look(): void {
  moved.value = scrollY > 8
}

const menu = ref<HTMLDetailsElement | null>(null)
function closeMenu(): void {
  if (menu.value) menu.value.open = false
}
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !menu.value?.open) return
  closeMenu()
  menu.value.querySelector('summary')?.focus()
}
function onPress(event: PointerEvent): void {
  if (menu.value?.open && !menu.value.contains(event.target as Node)) closeMenu()
}
// Another page, or another part of this one: the menu has done its job.
watch(() => route.fullPath, closeMenu)

onMounted(() => {
  look()
  addEventListener('scroll', look, { passive: true })
  addEventListener('keydown', onKey)
  addEventListener('pointerdown', onPress)
})
onBeforeUnmount(() => {
  removeEventListener('scroll', look)
  removeEventListener('keydown', onKey)
  removeEventListener('pointerdown', onPress)
})
</script>

<template>
  <header class="nav" :class="{ moved }">
    <!-- Shown to someone who moves through the page with the keyboard, as its first stop. -->
    <a class="skip" href="#content">Skip to the content</a>

    <div class="wrap bar">
      <NuxtLink class="logo" to="/" :aria-label="route.path === '/' ? 'SillySimple. Play the logo’s entrance.' : 'SillySimple, home'" @click="onLogo">
        <LogoIntro ref="intro" :size="40" />
        <img :src="wordmark" alt="" width="99" height="28" draggable="false" />
      </NuxtLink>

      <nav class="links" aria-label="Main">
        <NuxtLink v-for="link in NAV_LINKS" :key="link.to" class="link" :to="link.to">{{ link.label }}</NuxtLink>
      </nav>

      <NuxtLink class="btn btn-main get" to="/#download">Download</NuxtLink>

      <details ref="menu" class="menu">
        <summary aria-label="Menu">
          <Menu class="closed" :size="22" :stroke-width="2.4" aria-hidden="true" />
          <X class="opened" :size="22" :stroke-width="2.4" aria-hidden="true" />
        </summary>
        <nav class="sheet" aria-label="Main">
          <NuxtLink v-for="link in NAV_LINKS" :key="link.to" class="sheet-link" :to="link.to" @click="closeMenu">{{ link.label }}</NuxtLink>
        </nav>
      </details>
    </div>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--page-0);
  box-shadow: 0 1px 0 transparent;
  transition: box-shadow 0.2s;
}
.nav.moved {
  box-shadow: 0 1px 0 var(--frame-line);
}

.skip {
  position: absolute;
  left: 16px;
  top: -80px;
  z-index: 1;
  padding: 10px 16px;
  background: var(--cream);
  color: var(--ink);
  border-radius: var(--radius-pill);
  font-weight: 700;
  text-decoration: none;
}
.skip:focus {
  top: 12px;
}

.bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: clamp(14px, 2.4vw, 30px);
  min-height: var(--nav);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  /* The links and the button go to the other end of the bar. */
  margin-right: auto;
  padding: 4px;
  margin-left: -4px;
  border-radius: var(--radius-lg);
  text-decoration: none;
}
.logo img {
  width: auto;
  height: 28px;
}

.links {
  display: flex;
  align-items: center;
  gap: clamp(14px, 2.4vw, 30px);
}
.link {
  font-weight: 700;
  text-decoration: none;
  /* A larger place to click than the word alone. */
  padding-block: 10px;
}
.link:hover,
/* The page one is on (a link to a part of the home page is not a page of its own). */
.link[aria-current='page']:not([href*='#']) {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}
.get {
  min-height: 44px;
  padding: 0 20px;
  font-size: 1rem;
}

/* --- On a phone: a button, and the links on a sheet under the bar ----------------------- */

.menu {
  display: none;
}
summary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  /* No triangle: the icon says it. */
  list-style: none;
  border: 1px solid var(--field-line);
  border-radius: 50%;
  cursor: pointer;
}
summary::-webkit-details-marker {
  display: none;
}
.menu[open] summary {
  background: var(--text);
  border-color: var(--text);
  color: var(--text-inverse);
}
.opened,
.menu[open] .closed {
  display: none;
}
.menu[open] .opened {
  display: block;
}

.sheet {
  position: absolute;
  top: 100%;
  /* From one edge of the window to the other, whatever the gutter. */
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--gutter) var(--space-5);
  background: var(--page-0);
  box-shadow:
    0 1px 0 var(--frame-line),
    0 30px 40px -20px rgb(var(--shade) / 0.8);
}
.sheet-link {
  display: flex;
  align-items: center;
  min-height: 56px;
  border-bottom: 1px solid var(--frame-line);
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-decoration: none;
}
.sheet-link[aria-current='page']:not([href*='#']) {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}

@media (max-width: 720px) {
  .links {
    display: none;
  }
  .menu {
    display: block;
  }
}
</style>
