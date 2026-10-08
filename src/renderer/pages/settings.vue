<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'

// Layout of the settings: a menu on the left, the chosen section on the right.
// Each section is a file in pages/settings/ and renders inside <RouterView>.

const sections = [
  { label: 'Connection', to: '/settings/connection' },
  { label: 'Appearance', to: '/settings/appearance' },
  { label: 'Language', to: null },
  { label: 'Generation', to: '/settings/generation' },
  { label: 'Voice', to: '/settings/voice' },
  { label: 'Adapts to you', to: '/settings/adapt', beta: true },
  { label: 'Data & Privacy', to: '/settings/data' },
  { label: 'Help', to: '/settings/help' },
]
</script>

<template>
  <div class="screen">
    <aside class="menu">
      <div class="titlebar drag" />
      <RouterLink to="/" class="back"><ChevronLeft :size="14" :stroke-width="2.2" />Back to chat</RouterLink>

      <nav aria-label="Settings sections">
        <template v-for="section in sections" :key="section.label">
          <RouterLink v-if="section.to" :to="section.to" class="link">
            {{ section.label }}<span v-if="section.beta" class="soon beta">beta</span>
          </RouterLink>
          <span v-else class="link unavailable">{{ section.label }}<span class="soon">not built yet</span></span>
        </template>
      </nav>
    </aside>

    <main class="content">
      <div class="titlebar drag" />
      <div class="section">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  height: 100%;
}

.menu {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 0 10px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
}

.titlebar {
  height: var(--titlebar-height);
  flex-shrink: 0;
}

.back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 12px;
  font-size: 12px;
  font-weight: 600;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius);
  color: var(--text-muted);
  font-weight: 600;
}
a.link:hover {
  background: var(--bg-panel);
  color: var(--text);
}
/* Class added by Vue Router to the link of the current page */
.link.router-link-active {
  background: var(--bg-active);
  color: var(--text);
}
.link.unavailable {
  color: var(--text-ghost);
}
.soon {
  font-size: 10px;
  font-weight: 500;
}
.soon.beta {
  color: var(--warning-text);
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.section {
  width: 100%;
  max-width: 720px;
  padding: 0 40px 32px;
}
</style>
