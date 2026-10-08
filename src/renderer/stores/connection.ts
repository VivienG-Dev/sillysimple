import type { ConnectionSettings, ConnectionStatus, ModelInfo } from '@shared/types'

// Whether the model server answers right now, and which models it offers.

export const useConnectionStore = defineStore('connection', () => {
  const state = ref<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const models = ref<ModelInfo[]>([])
  const error = ref('')
  /** The context length the server reports for the model in use. Null when it does not say. */
  const detectedContext = ref<number | null>(null)

  /** Tests the saved connection, or the given one (used while the user is still choosing). */
  async function check(connection?: ConnectionSettings): Promise<ConnectionStatus> {
    const target = connection ?? useSettingsStore().connection
    state.value = 'checking'

    const status = await window.api.connection.test(toPlain(target))
    if (status.ok) {
      state.value = 'ok'
      models.value = status.models
      error.value = ''
    } else {
      state.value = 'error'
      models.value = []
      error.value = status.error
    }
    // Only for the saved connection: a draft being tried in the settings is not the model in use.
    if (!connection) await refreshContext()
    return status
  }

  /**
   * Asks the server again how large a context the model runs with. Called after each
   * reply too: a local server only knows once the model is loaded, and the user can
   * reload it with other settings at any time.
   */
  async function refreshContext(): Promise<void> {
    detectedContext.value = await window.api.connection.contextLength().catch(() => null)
  }

  return { state, models, error, detectedContext, check, refreshContext }
})
