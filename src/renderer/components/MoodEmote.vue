<script setup lang="ts">
import type { Mood } from '@core/mood/detectMood'

// The mood of a reply, played over the character's picture the way manga does it: not one
// small sign in a corner, but an effect that takes the whole picture for a few seconds.
// Speed lines and a big "!" for surprise, hearts rising for tenderness, a veil of gloom
// lines for sadness, sparkles all around for joy…
//
// Each mood is a small scene: a tone laid over the picture, and pieces (symbols) placed on
// it, each with its own motion and its own moment to come in. The parent removes the whole
// thing after LIFETIME.
//
// Every symbol is drawn twice from the same shapes: once thick and dark, as an ink outline,
// then in colour on top, with a white glint. That keeps it readable on any picture.

const props = defineProps<{ mood: Mood }>()

// --- Shapes, in a 64 by 64 box ------------------------------------------------------

const INK = '#16141d'
const WHITE = '#ffffff'

interface Shape {
  /** Filled areas, or lines of an even width. */
  kind: 'fill' | 'line'
  parts: { d: string; color: string }[]
  /** Thin white strokes drawn last: the glint on a drop, on a heart. */
  glint?: string[]
}

const dot = (x: number, y: number, r: number): string => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`
/** A four-pointed sparkle around (x, y). */
const sparkle = (x: number, y: number, r: number): string =>
  `M${x} ${y - r}Q${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y}Q${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r}Q${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y}Q${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r}Z`
/** A drop hanging from (x, top), `r` wide at its round end. */
const drop = (x: number, top: number, r: number): string =>
  `M${x} ${top}C${x + r * 0.7} ${top + r * 1.1} ${x + r} ${top + r * 1.6} ${x + r} ${top + r * 2}a${r} ${r} 0 1 1 ${-r * 2} 0C${x - r} ${top + r * 1.6} ${x - r * 0.7} ${top + r * 1.1} ${x} ${top}Z`
/** The spiky burst behind a shout: points of uneven length, as if drawn by hand. */
function burst(points: number, outer: number, inner: number): string {
  const lengths = [1, 0.84, 1.06, 0.9, 0.97, 0.8, 1.04, 0.88]
  const corners: string[] = []
  for (let index = 0; index < points * 2; index++) {
    const radius = index % 2 === 0 ? outer * lengths[(index / 2) % lengths.length]! : inner
    const angle = (Math.PI * index) / points - Math.PI / 2
    corners.push(`${(32 + radius * Math.cos(angle)).toFixed(1)} ${(32 + radius * Math.sin(angle)).toFixed(1)}`)
  }
  return `M${corners.join('L')}Z`
}

const SHAPES = {
  sparkle: { kind: 'fill', parts: [{ d: sparkle(32, 32, 29), color: '#ffdd55' }], glint: ['M32 16V26'] },
  note: {
    kind: 'fill',
    // An eighth note: its head, then its stem and flag.
    parts: [
      { d: 'M12 48a10 7.5 -18 1 0 20 -6a10 7.5 -18 1 0 -20 6Z', color: WHITE },
      { d: 'M27.5 44V9C41 11 53 21 46 37C46 29 41 24 33.5 23V43Z', color: WHITE },
    ],
  },
  heart: {
    kind: 'fill',
    parts: [{ d: 'M32 56C7 38 4 18 19 11.5C26 8.5 32 13 32 20C32 13 38 8.5 45 11.5C60 18 57 38 32 56Z', color: '#ff4f86' }],
    glint: ['M15.5 24C15.5 19 18 16.5 22 16'],
  },
  blush: {
    kind: 'line',
    parts: ['M9 50L20 20', 'M22 50L33 20', 'M35 50L46 20', 'M48 50L59 20'].map((d) => ({ d, color: '#ff8fb0' })),
  },
  vein: {
    kind: 'line',
    // The swollen vein: four curved corners that do not touch.
    parts: ['M9 26Q26 26 26 9', 'M38 9Q38 26 55 26', 'M55 38Q38 38 38 55', 'M26 55Q26 38 9 38'].map((d) => ({ d, color: '#ff3d3d' })),
  },
  bang: {
    kind: 'fill',
    parts: [
      { d: burst(11, 31, 19.5), color: '#ffe23f' },
      { d: 'M26 13H38L35.3 36.5H28.7Z', color: '#ff3d3d' },
      { d: dot(32, 45.5, 4.4), color: '#ff3d3d' },
    ],
  },
  quest: { kind: 'line', parts: [{ d: 'M20 23C20 7 44 7 44 22C44 31.5 32 31 32 41.5', color: WHITE }, { d: 'M32 54V54.1', color: WHITE }] },
  drop: { kind: 'fill', parts: [{ d: drop(32, 5, 15.5), color: '#9fdcff' }], glint: ['M23.5 37.5a9 9 0 0 0 5.5 8'] },
  puff: {
    kind: 'fill',
    parts: [{ d: 'M18 46A11 11 0 0 1 17 24.5A13.5 13.5 0 0 1 42 19A12 12 0 0 1 50 42.5A9.5 9.5 0 0 1 42 46Z', color: WHITE }],
    glint: ['M20 32a6 6 0 0 1 5 -4'],
  },
  zig: { kind: 'line', parts: [{ d: 'M26 5L38 16L26 27L38 38L26 49L38 60', color: '#b3c0ff' }] },
  zed: { kind: 'fill', parts: [{ d: 'M13 12H51V21L27 43H51V52H13V43L37 21H13Z', color: WHITE }] },
  bubble: {
    kind: 'fill',
    // A thought bubble, with the three dots of someone working something out.
    parts: [
      { d: 'M14 42A12 12 0 0 1 12 20A14 14 0 0 1 35 9.5A13 13 0 0 1 55 21A11 11 0 0 1 50 42Z', color: WHITE },
      { d: dot(21, 27, 3.4), color: INK },
      { d: dot(33, 27, 3.4), color: INK },
      { d: dot(45, 27, 3.4), color: INK },
    ],
  },
  bead: { kind: 'fill', parts: [{ d: dot(32, 32, 22), color: WHITE }] },
} satisfies Record<string, Shape>

// --- Scenes -----------------------------------------------------------------------

/** How a piece moves. Each is a set of keyframes below. */
type Motion =
  | 'stamp' // Slams in, then trembles: a shout.
  | 'throb' // Slams in, then pulses: anger.
  | 'pop' // Springs in, then bobs gently.
  | 'sway' // Springs in, then tilts from side to side.
  | 'beat' // Springs in, then beats like a heart.
  | 'twinkle' // Flashes in and out, turning.
  | 'rise' // Floats up and away, again and again.
  | 'slide' // Runs slowly down: a drop of sweat.
  | 'fling' // Flies off outward: sweat thrown off.
  | 'fall' // Drops and fades: tears.
  | 'drift' // Swells and drifts aside: a sigh.
  | 'jitter' // Shakes without rest: fear.
  | 'doze' // Comes in, floats up, fades: a "z" of sleep.
  | 'steam' // Shoots up and thins out: anger, or embarrassment.

interface Piece {
  shape: keyof typeof SHAPES
  /** Where its centre is, in percent of the picture. */
  x: number
  y: number
  /** Its size, in pixels. */
  size: number
  motion: Motion
  /** When it comes in, in seconds. */
  delay?: number
  /** Tilt, in degrees. */
  tilt?: number
}

interface Scene {
  /** What is laid over the whole picture. */
  tone?: 'focus' | 'gloom' | 'chill' | 'blush' | 'glow' | 'fury' | 'dusk'
  pieces: Piece[]
}

const SCENES: Record<Mood, Scene> = {
  joy: {
    tone: 'glow',
    pieces: [
      { shape: 'sparkle', x: 76, y: 20, size: 64, motion: 'twinkle' },
      { shape: 'sparkle', x: 18, y: 26, size: 44, motion: 'twinkle', delay: 0.35 },
      { shape: 'sparkle', x: 88, y: 52, size: 34, motion: 'twinkle', delay: 0.6 },
      { shape: 'sparkle', x: 30, y: 66, size: 30, motion: 'twinkle', delay: 0.9 },
      { shape: 'sparkle', x: 56, y: 10, size: 26, motion: 'twinkle', delay: 0.2 },
      { shape: 'sparkle', x: 68, y: 74, size: 40, motion: 'twinkle', delay: 0.75 },
      { shape: 'sparkle', x: 10, y: 58, size: 22, motion: 'twinkle', delay: 1.1 },
    ],
  },
  playful: {
    pieces: [
      { shape: 'note', x: 80, y: 21, size: 76, motion: 'sway', tilt: 8 },
      { shape: 'note', x: 17, y: 32, size: 44, motion: 'sway', delay: 0.25, tilt: -14 },
      { shape: 'sparkle', x: 88, y: 48, size: 30, motion: 'twinkle', delay: 0.4 },
      { shape: 'sparkle', x: 54, y: 12, size: 22, motion: 'twinkle', delay: 0.8 },
      { shape: 'note', x: 60, y: 58, size: 34, motion: 'rise', delay: 0.5 },
    ],
  },
  love: {
    tone: 'blush',
    pieces: [
      { shape: 'heart', x: 80, y: 19, size: 80, motion: 'beat', tilt: 10 },
      { shape: 'heart', x: 14, y: 78, size: 34, motion: 'rise', delay: 0.1 },
      { shape: 'heart', x: 32, y: 84, size: 24, motion: 'rise', delay: 0.7 },
      { shape: 'heart', x: 50, y: 80, size: 40, motion: 'rise', delay: 0.35 },
      { shape: 'heart', x: 68, y: 86, size: 22, motion: 'rise', delay: 1.05 },
      { shape: 'heart', x: 86, y: 80, size: 30, motion: 'rise', delay: 0.55 },
    ],
  },
  shy: {
    tone: 'blush',
    pieces: [
      { shape: 'blush', x: 79, y: 27, size: 76, motion: 'pop' },
      { shape: 'blush', x: 18, y: 33, size: 50, motion: 'pop', delay: 0.15 },
      { shape: 'puff', x: 46, y: 12, size: 34, motion: 'steam', delay: 0.4 },
      { shape: 'puff', x: 62, y: 9, size: 26, motion: 'steam', delay: 0.75 },
    ],
  },
  anger: {
    tone: 'fury',
    pieces: [
      { shape: 'vein', x: 80, y: 19, size: 86, motion: 'throb', tilt: 8 },
      { shape: 'vein', x: 16, y: 32, size: 44, motion: 'throb', delay: 0.18, tilt: -10 },
      { shape: 'puff', x: 40, y: 10, size: 36, motion: 'steam', delay: 0.3 },
      { shape: 'puff', x: 58, y: 7, size: 28, motion: 'steam', delay: 0.6 },
    ],
  },
  surprise: {
    tone: 'focus',
    pieces: [
      { shape: 'bang', x: 79, y: 20, size: 104, motion: 'stamp', tilt: 10 },
      { shape: 'bang', x: 17, y: 30, size: 50, motion: 'stamp', delay: 0.16, tilt: -12 },
    ],
  },
  question: {
    pieces: [
      { shape: 'quest', x: 80, y: 20, size: 90, motion: 'sway', tilt: 8 },
      { shape: 'quest', x: 17, y: 28, size: 44, motion: 'pop', delay: 0.3, tilt: -14 },
      { shape: 'quest', x: 88, y: 56, size: 32, motion: 'pop', delay: 0.55, tilt: 16 },
    ],
  },
  sad: {
    tone: 'gloom',
    pieces: [
      { shape: 'drop', x: 24, y: 30, size: 40, motion: 'fall', delay: 0.5 },
      { shape: 'drop', x: 78, y: 26, size: 46, motion: 'fall', delay: 0.9 },
      { shape: 'drop', x: 88, y: 46, size: 28, motion: 'fall', delay: 1.4 },
    ],
  },
  nervous: {
    pieces: [
      { shape: 'drop', x: 81, y: 18, size: 74, motion: 'slide' },
      { shape: 'drop', x: 20, y: 22, size: 26, motion: 'fling', delay: 0.2, tilt: -40 },
      { shape: 'drop', x: 12, y: 36, size: 20, motion: 'fling', delay: 0.38, tilt: -65 },
      { shape: 'drop', x: 30, y: 12, size: 22, motion: 'fling', delay: 0.3, tilt: -15 },
    ],
  },
  sigh: {
    tone: 'dusk',
    pieces: [
      { shape: 'puff', x: 60, y: 37, size: 60, motion: 'drift' },
      { shape: 'puff', x: 56, y: 42, size: 40, motion: 'drift', delay: 0.9 },
    ],
  },
  fear: {
    tone: 'chill',
    pieces: [
      { shape: 'zig', x: 14, y: 30, size: 70, motion: 'jitter' },
      { shape: 'zig', x: 86, y: 30, size: 70, motion: 'jitter', delay: 0.05 },
      { shape: 'drop', x: 74, y: 16, size: 36, motion: 'slide', delay: 0.3 },
    ],
  },
  sleepy: {
    tone: 'dusk',
    pieces: [
      { shape: 'zed', x: 60, y: 40, size: 30, motion: 'doze', tilt: -8 },
      { shape: 'zed', x: 72, y: 27, size: 46, motion: 'doze', delay: 0.45, tilt: 6 },
      { shape: 'zed', x: 84, y: 12, size: 66, motion: 'doze', delay: 0.9, tilt: -6 },
    ],
  },
  thinking: {
    pieces: [
      { shape: 'bead', x: 60, y: 44, size: 16, motion: 'pop' },
      { shape: 'bead', x: 66, y: 35, size: 24, motion: 'pop', delay: 0.18 },
      { shape: 'bubble', x: 79, y: 18, size: 96, motion: 'pop', delay: 0.36 },
    ],
  },
}

const scene = computed(() => SCENES[props.mood])
const shapeOf = (piece: Piece): Shape => SHAPES[piece.shape]
</script>

<script lang="ts">
/** How long an effect lasts, in milliseconds: its animations are timed to end with it. */
export const LIFETIME = 4600
</script>

<template>
  <div class="effect" :class="mood" aria-hidden="true">
    <div v-if="scene.tone" class="tone" :class="scene.tone" />

    <div
      v-for="(piece, index) in scene.pieces"
      :key="index"
      class="piece"
      :style="{
        left: `${piece.x}%`,
        top: `${piece.y}%`,
        width: `${piece.size}px`,
        height: `${piece.size}px`,
        '--delay': `${piece.delay ?? 0}s`,
        '--tilt': `${piece.tilt ?? 0}deg`,
      }"
    >
      <svg viewBox="0 0 64 64" :class="[shapeOf(piece).kind, piece.motion]">
        <g class="outline">
          <path v-for="part in shapeOf(piece).parts" :key="part.d" :d="part.d" />
        </g>
        <g class="body">
          <path v-for="part in shapeOf(piece).parts" :key="part.d" :d="part.d" :style="{ '--tint': part.color }" />
        </g>
        <g class="glint">
          <path v-for="d in shapeOf(piece).glint ?? []" :key="d" :d="d" />
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.effect {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  /* The whole scene fades at the end of its life. */
  animation: leave 0.5s ease-in 4.1s forwards;
}
@keyframes leave {
  to {
    opacity: 0;
  }
}

/* --- Tones: what is laid over the whole picture --------------------------------- */

.tone {
  position: absolute;
  inset: 0;
  animation: tone-in 0.35s ease-out both;
}
@keyframes tone-in {
  from {
    opacity: 0;
  }
}

/* Speed lines racing in from the edges: the flash of a shock. */
.tone.focus {
  background: repeating-conic-gradient(
    from 0deg at 50% 36%,
    transparent 0deg 3.2deg,
    rgb(255 255 255 / 0.92) 3.2deg 4.1deg,
    transparent 4.1deg 7.5deg,
    rgb(255 255 255 / 0.6) 7.5deg 8deg
  );
  mask-image: radial-gradient(ellipse 62% 56% at 50% 36%, transparent 52%, #000 100%);
  animation: focus 1.5s ease-out both;
}
@keyframes focus {
  0% {
    opacity: 0;
    transform: scale(1.5);
  }
  14% {
    opacity: 1;
    transform: scale(1);
  }
  55% {
    opacity: 0.75;
    transform: scale(1.06);
  }
  100% {
    opacity: 0;
    transform: scale(1.14);
  }
}

/* Lines of gloom hanging over the head, and the picture turning a little blue. */
.tone.gloom,
.tone.chill {
  background: linear-gradient(rgb(34 48 120 / 0.42), rgb(34 48 120 / 0.14));
}
.tone.gloom::after,
.tone.chill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    90deg,
    transparent 0 9px,
    rgb(18 24 72 / 0.85) 9px 11.5px,
    transparent 11.5px 17px,
    rgb(18 24 72 / 0.6) 17px 18.5px
  );
  mask-image: linear-gradient(#000 0%, rgb(0 0 0 / 0.8) 14%, transparent 44%);
  animation: gloom 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) both;
}
@keyframes gloom {
  from {
    opacity: 0;
    transform: translateY(-45%);
  }
}
.tone.chill::after {
  mask-image: linear-gradient(#000 0%, rgb(0 0 0 / 0.6) 10%, transparent 30%);
}

/* A warm flush rising from below. */
.tone.blush {
  background:
    radial-gradient(ellipse 90% 60% at 50% 105%, rgb(255 92 150 / 0.6), transparent 70%),
    radial-gradient(circle at 50% 40%, rgb(255 150 190 / 0.2), transparent 70%);
  animation:
    tone-in 0.5s ease-out both,
    breathe 1.4s ease-in-out 0.5s infinite alternate;
}
/* Light pouring in. */
.tone.glow {
  background: radial-gradient(circle at 60% 26%, rgb(255 236 150 / 0.5), rgb(255 226 120 / 0.14) 45%, transparent 72%);
  animation:
    tone-in 0.4s ease-out both,
    breathe 1.2s ease-in-out 0.4s infinite alternate;
}
/* Red closing in from the edges. */
.tone.fury {
  background: radial-gradient(ellipse at 50% 40%, transparent 30%, rgb(214 28 28 / 0.62) 100%);
  animation:
    tone-in 0.25s ease-out both,
    breathe 0.5s ease-in-out 0.25s infinite alternate;
}
/* The light going down. */
.tone.dusk {
  background: linear-gradient(rgb(14 14 40 / 0.5), rgb(14 14 40 / 0.2));
  animation: tone-in 0.9s ease-out both;
}
@keyframes breathe {
  to {
    opacity: 0.6;
  }
}

/* --- Pieces ---------------------------------------------------------------------- */

.piece {
  position: absolute;
  /* (left, top) is the centre of the piece. */
  margin: 0;
  translate: -50% -50%;
  rotate: var(--tilt);
  filter: drop-shadow(0 4px 7px rgb(0 0 0 / 0.5));
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.outline path {
  stroke: #16141d;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.fill .outline path {
  fill: #16141d;
  stroke-width: 8;
}
.line .outline path {
  fill: none;
  stroke-width: 15;
}
.body path {
  stroke-linejoin: round;
  stroke-linecap: round;
}
.fill .body path {
  fill: var(--tint);
}
.line .body path {
  fill: none;
  stroke: var(--tint);
  stroke-width: 8.5;
}
.glint path {
  fill: none;
  stroke: #fff;
  stroke-width: 3.2;
  stroke-linecap: round;
  opacity: 0.9;
}

/* --- Motions ---------------------------------------------------------------------
   Each starts after the piece's own delay. The first part brings the piece in, the
   second is what it does while it stays. */

.stamp {
  animation:
    stamp 0.4s cubic-bezier(0.2, 1.4, 0.4, 1) var(--delay) both,
    tremble 0.085s linear calc(var(--delay) + 0.4s) 10 alternate;
}
@keyframes stamp {
  0% {
    opacity: 0;
    transform: scale(2.6) rotate(-14deg);
  }
  45% {
    opacity: 1;
    transform: scale(0.86, 0.94);
  }
  70% {
    transform: scale(1.1, 1.04);
  }
}
@keyframes tremble {
  from {
    transform: translate(-1.6px, 0.8px) rotate(-1.4deg);
  }
  to {
    transform: translate(1.6px, -0.8px) rotate(1.4deg);
  }
}

.throb {
  animation:
    stamp 0.36s cubic-bezier(0.2, 1.4, 0.4, 1) var(--delay) both,
    throb 0.34s ease-in-out calc(var(--delay) + 0.36s) infinite alternate;
}
@keyframes throb {
  from {
    transform: scale(0.94);
  }
  to {
    transform: scale(1.2);
  }
}

.pop,
.sway,
.beat,
.slide {
  animation: pop 0.45s cubic-bezier(0.3, 1.7, 0.5, 1) var(--delay) both;
}
@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-22deg);
  }
  60% {
    opacity: 1;
    transform: scale(1.18, 1.08);
  }
  80% {
    transform: scale(0.95, 1.03);
  }
}
.pop {
  animation:
    pop 0.45s cubic-bezier(0.3, 1.7, 0.5, 1) var(--delay) both,
    bob 1.1s ease-in-out calc(var(--delay) + 0.45s) infinite alternate;
}
@keyframes bob {
  from {
    transform: translateY(-3px);
  }
  to {
    transform: translateY(4px);
  }
}
.sway {
  animation:
    pop 0.45s cubic-bezier(0.3, 1.7, 0.5, 1) var(--delay) both,
    sway 0.9s ease-in-out calc(var(--delay) + 0.45s) infinite alternate;
}
@keyframes sway {
  from {
    transform: rotate(-13deg) translateY(-2px);
  }
  to {
    transform: rotate(13deg) translateY(3px);
  }
}
.beat {
  animation:
    pop 0.45s cubic-bezier(0.3, 1.7, 0.5, 1) var(--delay) both,
    beat 0.85s ease-in-out calc(var(--delay) + 0.45s) infinite;
}
@keyframes beat {
  12% {
    transform: scale(1.22, 1.16);
  }
  26% {
    transform: scale(0.97);
  }
  40% {
    transform: scale(1.13);
  }
  56%,
  100% {
    transform: scale(1);
  }
}
.slide {
  animation:
    pop 0.45s cubic-bezier(0.3, 1.7, 0.5, 1) var(--delay) both,
    slide 1.5s cubic-bezier(0.5, 0, 0.9, 0.6) calc(var(--delay) + 0.55s) infinite;
}
@keyframes slide {
  0% {
    transform: translateY(0) scale(1, 1);
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translateY(46px) scale(0.86, 1.14);
    opacity: 0;
  }
}

.twinkle {
  animation: twinkle 1.25s ease-in-out var(--delay) infinite both;
}
@keyframes twinkle {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-45deg);
  }
  35% {
    opacity: 1;
    transform: scale(1.1) rotate(0deg);
  }
  55% {
    transform: scale(0.82) rotate(12deg);
  }
  100% {
    opacity: 0;
    transform: scale(0) rotate(60deg);
  }
}

.rise {
  animation: rise 2.1s ease-in var(--delay) infinite both;
}
@keyframes rise {
  0% {
    opacity: 0;
    transform: translate(0, 24px) scale(0.5);
  }
  18% {
    opacity: 1;
    transform: translate(-7px, -18px) scale(1);
  }
  50% {
    transform: translate(8px, -110px) scale(1.05) rotate(8deg);
  }
  80% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(-6px, -220px) scale(0.9) rotate(-8deg);
  }
}

.fling {
  animation: fling 0.95s cubic-bezier(0.1, 0.7, 0.3, 1) var(--delay) infinite both;
}
@keyframes fling {
  0% {
    opacity: 0;
    transform: translateY(26px) scale(0.3);
  }
  25% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  70% {
    opacity: 1;
    transform: translateY(-12px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-18px) scale(0.8);
  }
}

.fall {
  animation: fall 1.35s cubic-bezier(0.55, 0, 1, 0.6) var(--delay) infinite both;
}
@keyframes fall {
  0% {
    opacity: 0;
    transform: translateY(-14px) scale(0.6);
  }
  20% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(120px) scale(0.9, 1.15);
  }
}

.drift {
  animation: drift 1.9s ease-out var(--delay) infinite both;
}
@keyframes drift {
  0% {
    opacity: 0;
    transform: translate(-10px, 0) scale(0.35);
  }
  25% {
    opacity: 0.95;
    transform: translate(10px, 3px) scale(0.9);
  }
  100% {
    opacity: 0;
    transform: translate(86px, 16px) scale(1.5);
  }
}

.jitter {
  animation:
    pop 0.3s ease-out var(--delay) both,
    jitter 0.075s linear calc(var(--delay) + 0.3s) infinite alternate;
}
@keyframes jitter {
  from {
    transform: translate(-3px, 1px);
  }
  to {
    transform: translate(3px, -1px);
  }
}

.doze {
  animation: doze 2.3s ease-in-out var(--delay) infinite both;
}
@keyframes doze {
  0% {
    opacity: 0;
    transform: translate(-8px, 10px) scale(0.3);
  }
  22% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  70% {
    opacity: 1;
    transform: translate(6px, -9px) scale(1.04) rotate(5deg);
  }
  100% {
    opacity: 0;
    transform: translate(11px, -18px) scale(1.08) rotate(9deg);
  }
}

.steam {
  animation: steam 0.95s ease-out var(--delay) infinite both;
}
@keyframes steam {
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.35);
  }
  30% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-34px) scale(1.25);
  }
}

/* Less motion asked for: the scene is shown, still, and fades. */
@media (prefers-reduced-motion: reduce) {
  .tone,
  .piece svg {
    animation: none !important;
  }
  .tone.focus {
    opacity: 0.5;
  }
}
</style>
