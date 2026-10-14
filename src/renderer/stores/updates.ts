import type { UpdateStatus } from '@shared/types'

// The app's own updates. The main process looks and downloads (src/main/updates.ts) and
// says when something changes; this only shows it and passes on what the user clicks.

export const useUpdatesStore = defineStore('updates', () => {
  const status = ref<UpdateStatus>({ state: 'unavailable' })

  // One listener for the life of the app: a download goes on whatever page is shown.
  window.api.updates.onStatus((next) => {
    status.value = next
  })
  void window.api.updates.status().then((now) => {
    status.value = now
  })

  /** Looks now, whatever Settings › Data & Privacy says: the user asked. */
  async function check(): Promise<void> {
    status.value = await window.api.updates.check()
  }
  function download(): void {
    window.api.updates.download()
  }
  /** Quits, installs and opens the new version. */
  function install(): void {
    window.api.updates.install()
  }

  /** The version on its way or waiting, when there is one: what the button in the sidebar is about. */
  const version = computed(() => {
    const now = status.value
    return 'version' in now ? now.version : null
  })

  return { status, version, check, download, install }
})
