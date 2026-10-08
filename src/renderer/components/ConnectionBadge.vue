<script setup lang="ts">
import { sameOllamaModel } from '@core/providers/ollama'
import { cloudProvider, isLocalAddress } from '@shared/providers'

// The small status line at the bottom of the sidebar: a dot and the current model.
const connectionStore = useConnectionStore()
const settingsStore = useSettingsStore()
const engineStore = useEngineStore()

const local = computed(() => settingsStore.connection.kind === 'ollama')

const serverName = computed(() => {
  const connection = settingsStore.connection
  // On this computer: the user's own Ollama when it is open, the app's own otherwise.
  if (connection.kind === 'ollama') return engineStore.status?.state === 'yours' ? 'Your Ollama' : `This ${deviceName()}`
  if (connection.kind === 'cloud') return cloudProvider(connection.provider)?.name ?? 'Online service'
  return isLocalAddress(connection.baseUrl) ? 'Local server' : 'Server'
})

/** One of the app's own models goes by its size and exact model ("Large (26B A4B)"), any other by what its server calls it. */
const modelName = computed(() => {
  const model = settingsStore.connection.model
  if (!model) return 'no model selected'
  const offer = local.value ? engineStore.status?.offers.find((item) => sameOllamaModel(item.id, model)) : undefined
  // There is little room here: "Large (26B A4B)", without the family.
  return offer ? `${offer.name.split(' · ').at(-1)} (${offer.variant})` : model
})

/** A download goes on whatever page is shown: it is said here, where it is always in view. */
const downloading = computed(() => {
  if (!engineStore.job) return ''
  const progress = engineStore.progress
  return progress === null ? 'Downloading…' : `Downloading · ${Math.round(progress * 100)}%`
})

const label = computed(() => {
  if (downloading.value) return downloading.value
  if (connectionStore.state === 'checking' || connectionStore.state === 'idle') return 'Checking…'
  if (connectionStore.state === 'error') return local.value ? `${serverName.value} · not ready` : `${serverName.value} · not reachable`
  return `${serverName.value} · ${modelName.value}`
})

// The engine says when it changes hands (the user opened or closed their Ollama):
// the connection is looked at again, which also starts the app's own if it is needed.
watch(
  () => engineStore.status?.state,
  (state, before) => {
    if (before !== undefined && state !== before && local.value && connectionStore.state !== 'checking') void connectionStore.check()
  },
)

onMounted(async () => {
  await connectionStore.check()
  if (local.value) await engineStore.load()
})
</script>

<template>
  <RouterLink to="/settings/connection" class="badge" :title="connectionStore.error || 'Connection settings'">
    <span class="dot" :class="downloading ? 'busy' : connectionStore.state" />
    <span class="label">{{ label }}</span>
  </RouterLink>
</template>

<style scoped>
.badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  min-width: 0;
}
.badge:hover {
  color: var(--text);
}

.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-ghost);
}
.dot.ok {
  background: var(--success);
}
.dot.error {
  background: var(--danger-text);
}
.dot.busy {
  background: var(--accent-strong);
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
