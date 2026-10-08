<script setup lang="ts">
import { BUBBLE, CREAM, EYES, INK, MOUTH, TILE, TILE_STOPS } from '@/assets/brand/shapes'

// The app icon, drawn from its shapes rather than shown as a picture: sharp at any size,
// and each piece can be moved on its own (LogoIntro.vue does, at the first launch).
// The pieces are named with `data-part` so that whoever animates them can find them.

withDefaults(defineProps<{ size?: number }>(), { size: 84 })

// Two icons can be on screen at once: each needs its own name for the tile's colour.
const gradient = useId()
</script>

<template>
  <svg class="app-icon" viewBox="0 0 512 512" :width="size" :height="size" aria-hidden="true">
    <defs>
      <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
        <stop v-for="[at, color] in TILE_STOPS" :key="at" :offset="at" :stop-color="color" />
      </linearGradient>
    </defs>
    <!-- Drawn under the tile: what flies out from behind it. -->
    <slot name="behind" />
    <path data-part="tile" :d="TILE" :fill="`url(#${gradient})`" />
    <g data-part="head">
      <path data-part="bubble" :d="BUBBLE" :fill="CREAM" />
      <!-- Each eye leans: the lean is on the group, so the eye itself can blink upright. -->
      <g v-for="(eye, index) in EYES" :key="index" :transform="`rotate(${eye.rot} ${eye.cx} ${eye.cy})`">
        <ellipse data-part="eye" :cx="eye.cx" :cy="eye.cy" :rx="eye.rx" :ry="eye.ry" :fill="INK" />
      </g>
      <path
        data-part="mouth"
        :d="MOUTH.d"
        fill="none"
        :stroke="INK"
        :stroke-width="MOUTH.width"
        stroke-linecap="round"
        pathLength="1"
      />
    </g>
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  overflow: visible;
}
/* A piece grows, shrinks and turns around its own middle. */
.app-icon :deep([data-part]) {
  transform-box: fill-box;
  transform-origin: center;
}
</style>
