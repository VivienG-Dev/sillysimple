<script setup lang="ts">
import type { EngineJob } from '@shared/types'

// A download under way, on one line: the mascot waiting, the bar it watches, where it
// is at in words, and "Stop". Used for the app's own models and for a name that was typed.

const props = defineProps<{
  job: EngineJob
  /** What is being downloaded, for whoever cannot see the bar. */
  label: string
}>()

const engineStore = useEngineStore()
const bar = ref<HTMLElement | null>(null)

// On the first launch the guide does the waiting (see useGuide.ts): no second mascot here.
const guide = inject(GUIDE, null)
watch(bar, (element) => {
  if (guide) guide.bar.value = element
})
onBeforeUnmount(() => {
  if (guide) guide.bar.value = null
})

// A quarter, half, three quarters: each one is worth a jump for joy.
const mascot = ref<{ cheer(): void } | null>(null)
watch(
  () => (props.job.step === 'model' ? Math.floor((engineStore.progress ?? 0) * 4) : 0),
  (quarter, before) => {
    if (quarter > before && quarter < 4) mascot.value?.cheer()
  },
)

const text = computed(() => {
  const { step, doneBytes, totalBytes } = props.job
  const amount = totalBytes > 0 ? ` · ${formatProgress(doneBytes, totalBytes)}` : ''
  if (step === 'engine') return `Downloading the engine${amount}`
  if (step === 'unpacking') return 'Installing the engine…'
  if (step === 'starting') return 'Getting ready…'
  if (step === 'finishing') return 'Checking the download…'
  return `Downloading the model${amount}`
})
</script>

<template>
  <div class="progress" aria-live="polite">
    <!-- It waits with the user, eyes on the tip of the bar. -->
    <AppMascot v-if="!guide" ref="mascot" :size="40" mood="waiting" :watches="bar" :watches-at="engineStore.progress ?? 0.5" />
    <div
      ref="bar"
      class="bar"
      :class="{ unknown: engineStore.progress === null }"
      role="progressbar"
      :aria-label="`Downloading ${label}`"
      :aria-valuenow="engineStore.progress === null ? undefined : Math.round(engineStore.progress * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span :style="{ width: `${(engineStore.progress ?? 0) * 100}%` }" />
    </div>
    <span class="progress-text">{{ text }}</span>
    <button type="button" class="link" @click="engineStore.cancel()">Stop</button>
  </div>
</template>

<style scoped>
.progress {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  /* Room for the mascot to bounce without landing on the line above. */
  padding-top: 14px;
}
.bar {
  flex: 1;
  min-width: 60px;
  height: 6px;
  background: var(--bg-button);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent-strong);
  border-radius: var(--radius-pill);
  transition: width 0.2s linear;
}
/* Nothing to measure yet: a piece of the bar comes and goes. */
.bar.unknown span {
  width: 30% !important;
  animation: slide 1.2s ease-in-out infinite alternate;
}
@keyframes slide {
  from {
    transform: translateX(-40%);
  }
  to {
    transform: translateX(270%);
  }
}
.progress-text {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.link {
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
}
.link:hover {
  text-decoration: underline;
}

@media (prefers-reduced-motion: reduce) {
  .bar span {
    transition: none;
  }
  .bar.unknown span {
    animation: none;
    width: 100% !important;
    opacity: 0.4;
  }
}
</style>
