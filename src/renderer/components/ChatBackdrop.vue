<script setup lang="ts">
import { PORTRAIT_SCHEME } from '@shared/ipc'
import type { Character } from '@shared/types'

// What sits behind a chat (Settings › Appearance): the picture of the character,
// blurred into a mood more than an image, or one picture of the user's own. A veil of
// the app's background colour lies over it, thinner as the setting asks for more.
//
// It only paints. What stands in front of it stays legible because the chat gives its
// messages a panel of their own while a backdrop is shown (see pages/index.vue).

const props = defineProps<{
  /** The character whose picture is used, when the setting is "the character's picture". */
  character: Character | null
}>()

const settingsStore = useSettingsStore()
const appearance = computed(() => settingsStore.appearance)

type Layer = { key: string; kind: 'character' | 'custom' | 'tint'; image?: string }

/**
 * What to paint. "One's own picture" with none chosen yet falls back on the character's;
 * a character without a picture gives a glow of the app's colour.
 */
const layer = computed<Layer | null>(() => {
  const { background, backgroundVersion } = appearance.value
  if (background === 'none') return null
  if (background === 'custom' && backgroundVersion > 0) {
    const image = `${PORTRAIT_SCHEME}://background/${backgroundVersion}`
    return { key: image, kind: 'custom', image }
  }
  const image = props.character?.portraitUrl
  return image ? { key: image, kind: 'character', image } : { key: 'tint', kind: 'tint' }
})

/** 0 to 100 on the slider is "barely there" to "three quarters of the picture". */
const veil = computed(() => {
  const strength = Math.min(100, Math.max(0, appearance.value.backgroundStrength)) / 100
  return (0.9 - 0.65 * strength).toFixed(3)
})
</script>

<template>
  <div v-if="layer" class="backdrop" aria-hidden="true">
    <Transition name="fade">
      <div
        :key="layer.key"
        class="picture"
        :class="layer.kind"
        :style="layer.image ? { backgroundImage: `url('${layer.image}')` } : undefined"
      />
    </Transition>
    <div class="veil" :style="{ opacity: veil }" />
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.picture {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 30%;
}
/* A portrait is a face in a frame: blurred, it becomes colours and light. It is drawn
   larger than the chat so the blur does not fade out at the edges. */
.picture.character {
  inset: -80px;
  filter: blur(44px) saturate(1.2) brightness(0.9);
}
/* The user's own picture is a place they want to see: only dimmed a little. */
.picture.custom {
  filter: brightness(0.82);
}
.picture.tint {
  background:
    radial-gradient(110% 80% at 88% 0%, color-mix(in oklab, var(--accent) 46%, transparent), transparent 62%),
    radial-gradient(90% 70% at 0% 100%, color-mix(in oklab, var(--accent-strong) 30%, transparent), transparent 60%);
}

.veil {
  position: absolute;
  inset: 0;
  background: var(--bg-app);
  transition: opacity 0.2s;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
