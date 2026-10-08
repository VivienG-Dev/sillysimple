import type { EngineStatus } from '@shared/types'

// "On this computer": the Ollama replies come from (the user's own, or the app's), the
// models the app offers for this computer, and the download under way if there is one.
// The main process owns all of it (src/main/engine.ts) and says when something changes.

export const useEngineStore = defineStore('engine', () => {
  const status = ref<EngineStatus | null>(null)
  /** Why the last download did not end well. Empty when it did, or when the user stopped it. */
  const error = ref('')

  // One listener for the life of the app: progress keeps arriving whatever page is shown.
  window.api.engine.onStatus((next) => {
    status.value = next
  })

  /**
   * Reads where things stand. `wake` also starts the app's own Ollama when it is
   * installed and no other answers: that is what it takes to list the models.
   */
  async function load(wake = false): Promise<EngineStatus> {
    status.value = await window.api.engine.status(wake)
    return status.value
  }

  const job = computed(() => status.value?.job ?? null)

  /** How far the download is, from 0 to 1. Null while there is nothing to measure. */
  const progress = computed<number | null>(() => {
    const current = job.value
    if (!current || current.totalBytes <= 0) return null
    return Math.min(1, current.doneBytes / current.totalBytes)
  })

  /** Downloads a model, and the app's own Ollama first when there is none. True when the model is ready. */
  async function download(model: string): Promise<boolean> {
    error.value = ''
    const outcome = await window.api.engine.download(model)
    if (outcome.status === 'error') error.value = outcome.error
    await load()
    return outcome.status === 'done'
  }

  function cancel(): void {
    window.api.engine.cancel()
  }

  /** Removes a model from the disk. True when it is gone. */
  async function remove(model: string): Promise<boolean> {
    error.value = ''
    const outcome = await window.api.engine.remove(model)
    if (outcome.status === 'error') error.value = outcome.error
    // When it was the model in use, the main process took it out of the settings.
    await Promise.all([load(), useSettingsStore().load()])
    return outcome.status === 'done'
  }

  return { status, error, job, progress, load, download, cancel, remove }
})
