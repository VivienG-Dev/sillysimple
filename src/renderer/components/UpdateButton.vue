<script setup lang="ts">
import { ArrowDownToLine, RotateCw, TriangleAlert } from '@lucide/vue'

// A new version of the app, at the foot of the sidebar: shown only when there is one.
// One click downloads it, the next restarts into it. Nothing happens without a click.

const updates = useUpdatesStore()
const status = computed(() => updates.status)

const shown = computed(() => {
  const now = status.value
  return now.state === 'available' || now.state === 'downloading' || now.state === 'ready' || (now.state === 'error' && now.version !== null)
})

function act(): void {
  const now = status.value
  if (now.state === 'available' || now.state === 'error') updates.download()
  else if (now.state === 'ready') updates.install()
}
</script>

<template>
  <button
    v-if="shown"
    type="button"
    class="update"
    :class="status.state"
    :disabled="status.state === 'downloading'"
    :title="status.state === 'error' ? status.message : undefined"
    @click="act"
  >
    <span
      v-if="status.state === 'downloading'"
      class="fill"
      :style="{ width: `${status.percent}%` }"
      aria-hidden="true"
    />
    <template v-if="status.state === 'available'">
      <ArrowDownToLine :size="14" :stroke-width="2.2" />
      <span class="text">Update to {{ status.version }}</span>
    </template>
    <template v-else-if="status.state === 'downloading'">
      <ArrowDownToLine :size="14" :stroke-width="2.2" />
      <span class="text">Downloading {{ status.version }} · {{ status.percent }}%</span>
    </template>
    <template v-else-if="status.state === 'ready'">
      <RotateCw :size="14" :stroke-width="2.2" />
      <span class="text">Restart to update</span>
    </template>
    <template v-else>
      <TriangleAlert :size="14" :stroke-width="2.2" />
      <span class="text">Update failed · Try again</span>
    </template>
  </button>
</template>

<style scoped>
.update {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.update:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
}
.update:disabled {
  cursor: default;
}
.update.ready {
  background: var(--accent);
  color: #fff;
}
.update.ready:hover {
  background: var(--accent-hover);
}
.update.error {
  border-color: var(--danger-border);
  background: transparent;
  color: var(--danger-text);
}
/* How far the download is: the button fills from the left. */
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  transition: width 0.3s;
}
.text,
.update :deep(svg) {
  position: relative;
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
