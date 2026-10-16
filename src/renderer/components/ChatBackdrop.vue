<script setup lang="ts">
import { ambianceOf } from '@core/mood/ambiance'
import type { Mood } from '@core/mood/detectMood'
import { PORTRAIT_SCHEME } from '@shared/ipc'
import type { Character } from '@shared/types'

// What sits behind a chat (Settings › Appearance): the picture of the character,
// blurred into a mood more than an image, or one picture of the user's own. A veil of
// the app's background colour lies over it, thinner as the setting asks for more.
//
// It only paints. What stands in front of it stays legible because the chat gives its
// messages a panel of their own while a backdrop is shown (see pages/index.vue).
//
// Over it, the light of the scene (Settings › Appearance, "ambiance"): three blurred
// patches of colour that drift slowly and turn towards the mood of the character's last
// reply (src/core/mood/ambiance.ts). They are soft radial gradients, not blurred boxes, so
// the graphics card only moves them: nothing is blurred again while they drift, and the
// model running next to the app is not slowed down.

const props = defineProps<{
  /** The character whose picture is used, when the setting is "the character's picture". */
  character: Character | null
  /** The mood of the character's last reply, for the light of the scene. */
  mood?: Mood | null
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

/** The light of the scene: the colours of the mood, or the app's own (which follow the character) when none is known. */
const ambiance = computed(() => {
  if (!appearance.value.ambiance) return null
  const colours = ambianceOf(props.mood)
  return colours
    ? { '--a1': colours[0], '--a2': colours[1], '--a3': colours[2] }
    : { '--a1': 'var(--accent)', '--a2': 'var(--accent-strong)', '--a3': 'var(--accent-soft)' }
})
/**
 * How present the light is. At first it was a fifth of this and could not be seen at all
 * over a chat already tinted by the character (Vivien, 16 October: "je vois pas de
 * changement"): it has to be plainly there, the messages keep their own panels anyway.
 */
const ambianceStrength = computed(() => {
  if (!layer.value) return '0.5'
  const strength = Math.min(100, Math.max(0, appearance.value.backgroundStrength)) / 100
  return (0.4 + 0.25 * strength).toFixed(3)
})

/** 0 to 100 on the slider is "barely there" to "three quarters of the picture". */
const veil = computed(() => {
  const strength = Math.min(100, Math.max(0, appearance.value.backgroundStrength)) / 100
  return (0.9 - 0.65 * strength).toFixed(3)
})
</script>

<template>
  <div v-if="layer || ambiance" class="backdrop" aria-hidden="true">
    <template v-if="layer">
      <Transition name="fade">
        <div
          :key="layer.key"
          class="picture"
          :class="layer.kind"
          :style="layer.image ? { backgroundImage: `url('${layer.image}')` } : undefined"
        />
      </Transition>
      <div class="veil" :style="{ opacity: veil }" />
    </template>
    <div v-if="ambiance" class="ambiance" :style="{ ...ambiance, '--ambiance-opacity': ambianceStrength }">
      <span class="patch one" />
      <span class="patch two" />
      <span class="patch three" />
    </div>
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
/* The light of the scene. The colours fade from one mood to the next (registered as
   colours below, so the browser can blend them); the patches drift on their own, slowly. */
.ambiance {
  position: absolute;
  inset: 0;
  transition:
    --a1 3s ease,
    --a2 3s ease,
    --a3 3s ease;
}
.patch {
  position: absolute;
  border-radius: 50%;
  opacity: var(--ambiance-opacity);
  will-change: transform;
  animation: drift 52s ease-in-out infinite alternate;
}
/* Light at the heart, fading out softly to nothing at the edge of the circle. */
.patch.one {
  width: 62vmax;
  height: 62vmax;
  top: -22vmax;
  left: -16vmax;
  background: radial-gradient(closest-side, var(--a1), color-mix(in oklab, var(--a1) 35%, transparent) 55%, transparent);
}
.patch.two {
  width: 66vmax;
  height: 66vmax;
  bottom: -26vmax;
  right: -14vmax;
  background: radial-gradient(closest-side, var(--a2), color-mix(in oklab, var(--a2) 35%, transparent) 55%, transparent);
  animation-duration: 64s;
  animation-delay: -20s;
}
.patch.three {
  width: 44vmax;
  height: 44vmax;
  top: 22%;
  left: 34%;
  background: radial-gradient(closest-side, var(--a3), color-mix(in oklab, var(--a3) 35%, transparent) 55%, transparent);
  animation-duration: 44s;
  animation-delay: -32s;
  animation-direction: alternate-reverse;
}
@keyframes drift {
  0% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(9vmax, 6vmax) scale(1.12);
  }
  100% {
    transform: translate(-6vmax, 10vmax) scale(0.94);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
  .patch {
    animation: none;
  }
}
</style>

<style>
/* Declared as colours so that a change of mood fades instead of jumping. */
@property --a1 {
  syntax: '<color>';
  inherits: true;
  initial-value: transparent;
}
@property --a2 {
  syntax: '<color>';
  inherits: true;
  initial-value: transparent;
}
@property --a3 {
  syntax: '<color>';
  inherits: true;
  initial-value: transparent;
}
</style>
