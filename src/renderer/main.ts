import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import '@fontsource-variable/figtree/wght.css'
import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import './assets/css/tokens.css'
import './assets/css/base.css'

import App from './App.vue'
import { useCharactersStore } from './stores/characters'
import { useSettingsStore } from './stores/settings'

// Lets the CSS place the top bar around the traffic lights (macOS) or the window buttons (Windows).
document.documentElement.dataset.platform = window.api.platform

const pinia = createPinia()

// Hash history (#/library) because the built app is opened from a file, not served by a web server.
const router = createRouter({ history: createWebHashHistory(), routes })

// First launch: everything leads to the onboarding until it is finished.
router.beforeEach((to) => {
  const settings = useSettingsStore(pinia)
  if (!settings.onboardingDone && to.path !== '/onboarding') return '/onboarding'
  return true
})

if (import.meta.hot) handleHotUpdate(router)

// A file dropped outside a drop zone must do nothing. Without this, Chromium
// tries to open the file in place of the app.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (event) => event.preventDefault())
}

async function start(): Promise<void> {
  // Settings and characters come from the main process and are needed before the first screen.
  await Promise.all([useSettingsStore(pinia).load(), useCharactersStore(pinia).load()])
  createApp(App).use(pinia).use(router).mount('#app')
}

void start()
