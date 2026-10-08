<script lang="ts">
// On its own (`auto`), it plays once per run of the app: coming back to the first step
// of the first launch does not play it again.
let played = false
</script>

<script setup lang="ts">
// Taken from the app (src/renderer/components/LogoIntro.vue). The only difference is the
// colour behind the entrance. On the site it never plays by itself: only when asked.
import { BLOBS, BUBBLE, BUBBLE_CENTER, CREAM, TILE_STOPS } from '~/assets/brand/shapes'

// The app icon, with its entrance (Vivien's idea, 7 October): a cream liquid flies in from
// both sides of the window, swirls into the middle, gathers into the speech bubble, the
// face comes, it winks, and "paf", the orange tile bursts out behind it. Then the icon
// travels to its place in the page, which shows up as it lands.
//
// How it is made:
//  - The liquid is a few dozen round drops that follow two spirals. A blur followed by a
//    hard cut on the transparency (the "goo" filter) melts neighbours into one mass.
//  - The mass in the middle is a shape that slides from an uneven round into the bubble.
//  - Everything is timed with the browser's own animations (element.animate), each with
//    its delay from the start: nothing is driven frame by frame, and nothing waits on a timer.
//
// A click, a key or a resize of the window ends it at once. It does not start on its own
// for people who asked their system for less motion.
//
// The first launch plays it by itself (`auto`). Settings › Help plays it when its logo is
// clicked (`play()`), so that it can be seen again after the first launch.

const props = withDefaults(defineProps<{ size?: number; auto?: boolean }>(), { size: 84, auto: false })

// --- When things happen, in milliseconds from the moment the first drop leaves ----------

/**
 * The wait before the first drop. At the first launch it leaves the window the time to
 * come on screen; asked for by a click, it starts almost at once. Either way the empty
 * stage is drawn during it, filter included, so that nothing has to be prepared once
 * things move (Vivien saw a short freeze the first time it played).
 */
const WAIT_AT_LAUNCH = 250
const WAIT_ON_DEMAND = 50
/** How long a drop flies. */
const FLIGHT = 780
/** The two streams: how many drops, the delay between two drops, where it comes in from. */
const STREAMS = [
  { count: 42, gap: 9, delay: 0, from: 168 },
  { count: 30, gap: 10, delay: 110, from: 350 },
]
const FIRST_IN = FLIGHT * 0.86
const LAST_IN = Math.max(...STREAMS.map((stream) => stream.delay + (stream.count - 1) * stream.gap)) + FLIGHT
/** The mass takes the shape of the bubble. */
const MORPH_AT = LAST_IN - 110
const MORPH_FOR = 420
const FACE_AT = MORPH_AT + MORPH_FOR * 0.72
const WINK_AT = FACE_AT + 520
const PAF_AT = WINK_AT + 400
const LAND_AT = PAF_AT + 470
const LAND_FOR = 560

/** How many turns a stream makes before it reaches the middle. */
const TURNS = 1.55
/** How many points describe the path of a drop. */
const STEPS = 56

// --- The scene: sizes and paths, worked out for the window as it is ----------------------

interface Drop {
  radius: number
  at: number
  frames: Keyframe[]
}
interface Splash {
  radius: number
  color: string
  frames: Keyframe[]
}
interface Scene {
  /** The middle of the window, where the icon forms. */
  x: number
  y: number
  /** The size the icon forms at, before it travels to its place. */
  large: number
  blur: number
  drops: Drop[]
  splashes: Splash[]
}

/** The same "random" numbers every time: the entrance is one drawing, not a lottery. */
function dice(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mix = (from: number, to: number, amount: number): number => from + (to - from) * amount

function makeScene(width: number, height: number): Scene {
  const roll = dice(7)
  const large = Math.round(Math.min(300, Math.max(170, Math.min(width, height) * 0.36)))
  // A spiral as wide as the window and flattened to its height, rounder as it closes in.
  const reach = width / 2 + 110
  const flat = Math.min(1, (height * 0.41) / reach)

  const drops: Drop[] = []
  for (const stream of STREAMS) {
    for (let index = 0; index < stream.count; index++) {
      const lag = index / (stream.count - 1)
      // A few drops fly on their own beside the stream; the others make the stream.
      const loose = index % 9 === 4
      // Thick at the head of the stream, thin in its tail, with a swell now and then.
      const swell = index % 7 === 2 ? 1.3 : 1
      const radius = loose
        ? large * mix(0.034, 0.046, roll())
        : large * mix(0.07, 0.027, lag ** 0.7) * swell * mix(0.9, 1.1, roll())
      const drift = (roll() * 2 - 1) * (loose ? 3.4 : 0.7)

      const points: { x: number; y: number; u: number }[] = []
      for (let step = 0; step < STEPS; step++) {
        const u = step / (STEPS - 1)
        const far = (1 - u) ** 1.35
        const round = mix(flat, 1, u * u * (3 - 2 * u))
        const distance = reach * far * (1 + 0.05 * drift * (1 - u))
        const angle = (stream.from * Math.PI) / 180 + TURNS * 2 * Math.PI * u ** 0.85 + 0.04 * drift * (1 - u)
        points.push({ x: distance * Math.cos(angle), y: distance * round * Math.sin(angle), u })
      }
      // A drop keeps a nearly even speed along its path: slow turns far out, fast ones close in.
      const travelled = [0]
      for (let step = 1; step < STEPS; step++) {
        const from = points[step - 1]!
        const to = points[step]!
        travelled.push(travelled[step - 1]! + Math.hypot(to.x - from.x, to.y - from.y))
      }
      const whole = travelled[STEPS - 1]!
      const moments = points.map((point, step) => mix(point.u, travelled[step]! / whole, 0.62))

      // Each drop is drawn out along its way, as long as the gap to the next one: together
      // they make one ribbon, not a string of beads. The heading is counted without ever
      // jumping back by a full turn, so that a drop never spins on itself between two points.
      let heading = 0
      const frames = points.map((point, step) => {
        const before = points[Math.max(0, step - 1)]!
        const next = points[Math.min(STEPS - 1, step + 1)]!
        const time = (moments[Math.min(STEPS - 1, step + 1)]! - moments[Math.max(0, step - 1)]!) * FLIGHT
        const speed = Math.hypot(next.x - before.x, next.y - before.y) / time
        let turn = Math.atan2(next.y - before.y, next.x - before.x)
        while (turn - heading > Math.PI) turn -= 2 * Math.PI
        while (turn - heading < -Math.PI) turn += 2 * Math.PI
        heading = turn
        const long = loose ? 1 + speed * 0.12 : Math.min(6, Math.max(1, (speed * stream.gap * 1.7) / (radius * 2)))
        // It melts into the mass over the last stretch.
        const size = point.u < 0.9 ? 1 : mix(1, 0.3, (point.u - 0.9) / 0.1)
        return {
          offset: moments[step]!,
          transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) rotate(${turn.toFixed(3)}rad) scale(${(long * size).toFixed(2)}, ${size.toFixed(2)})`,
        }
      })
      drops.push({ radius, at: stream.delay + index * stream.gap, frames })
    }
  }

  // What the "paf" throws out, in the icon's own 512 box: a dozen drops, every way.
  const colors = [CREAM, TILE_STOPS[0]![1], '#f6b15c']
  const splashes: Splash[] = []
  for (let index = 0; index < 12; index++) {
    const angle = ((index * 30 + mix(-9, 9, roll())) * Math.PI) / 180
    const far = mix(380, 560, roll())
    const at = (distance: number): string =>
      `translate(${(distance * Math.cos(angle)).toFixed(0)}px, ${(distance * Math.sin(angle)).toFixed(0)}px)`
    splashes.push({
      radius: mix(16, 34, roll()),
      color: colors[index % colors.length]!,
      frames: [
        { opacity: 0, transform: `${at(150)} scale(1)`, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)' },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, offset: 0.75 },
        { opacity: 0, transform: `${at(far)} scale(0.45)` },
      ],
    })
  }

  return { x: width / 2, y: height * 0.47, large, blur: +(large * 0.02).toFixed(2), drops, splashes }
}

// --- Playing it ---------------------------------------------------------------------------

const anchor = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const scene = shallowRef<Scene | null>(null)
const leaving = ref(false)

const running: Animation[] = []
let firstFrame = 0
/** The wait before the first drop, for the play that is going on. */
let wait = 0

/**
 * Starts one movement `at` milliseconds after the first drop leaves. With 'both', the piece
 * holds its first state until then and its last one after: use it once per piece and
 * property. A second movement on the same piece takes 'none'.
 */
function play(
  target: Element | null | undefined,
  frames: Keyframe[] | PropertyIndexedKeyframes,
  at: number,
  duration: number,
  easing = 'linear',
  fill: FillMode = 'both',
): Animation | undefined {
  if (!target) return undefined
  const animation = target.animate(frames, { delay: wait + at, duration, easing, fill })
  running.push(animation)
  return animation
}

/**
 * Where an element sits in the window once the page is at rest. Not what
 * getBoundingClientRect() says: the step of the first launch is still sliding in when
 * this is asked, and the answer must not move with it.
 */
function placeOf(element: HTMLElement): { x: number; y: number } {
  let x = 0
  let y = 0
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft
    y += node.offsetTop
  }
  for (let node = element.parentElement; node; node = node.parentElement) {
    x -= node.scrollLeft
    y -= node.scrollTop
  }
  return { x, y }
}

function build(): void {
  const root = stage.value
  const home = anchor.value
  const now = scene.value
  if (!root || !home || !now) return finish()
  const part = (name: string): Element | null => root.querySelector(`[data-part="${name}"]`)
  const parts = (name: string): Element[] => [...root.querySelectorAll(`[data-part="${name}"]`)]
  const shape = (d: string): string => `path("${d}")`

  // 1. The liquid.
  parts('drop').forEach((element, index) => {
    const drop = now.drops[index]!
    play(element, drop.frames, drop.at, FLIGHT)
  })

  // 2. The mass in the middle: it grows as the drops come in and turns with them, then
  //    unwinds into the bubble and settles with a little bounce.
  const blob = part('blob')
  const whole = MORPH_AT + MORPH_FOR - FIRST_IN
  const grown = (MORPH_AT - FIRST_IN) / whole
  const after = (share: number): number => grown + (1 - grown) * share
  play(
    blob,
    [
      { offset: 0, transform: 'rotate(-300deg) scale(0)', easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      { offset: grown, transform: 'rotate(-55deg) scale(0.96)', easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
      { offset: after(0.55), transform: 'rotate(5deg) scale(1.08)', easing: 'ease-in-out' },
      { offset: after(0.8), transform: 'rotate(-1.5deg) scale(0.98)', easing: 'ease-in-out' },
      { offset: 1, transform: 'rotate(0deg) scale(1)' },
    ],
    FIRST_IN,
    whole,
  )
  play(blob, { d: [BLOBS[0]!, BLOBS[1]!, BLOBS[2]!, BLOBS[0]!, BLOBS[1]!].map(shape) }, FIRST_IN, MORPH_AT - FIRST_IN)
  play(blob, { d: [BLOBS[1]!, BUBBLE].map(shape) }, MORPH_AT, MORPH_FOR * 0.6, 'cubic-bezier(0.3, 1.5, 0.5, 1)', 'forwards')

  // 3. The drawn bubble takes over from the liquid one, which goes.
  play(part('bubble'), { opacity: [0, 1] }, MORPH_AT + MORPH_FOR - 70, 70)
  play(part('goo'), { opacity: [1, 0] }, MORPH_AT + MORPH_FOR, 70)

  // 4. The face: one eye, the other, then the smile draws itself.
  const eyes = parts('eye')
  eyes.forEach((eye, index) => {
    play(
      eye,
      [
        { transform: 'scale(0)', easing: 'cubic-bezier(0.3, 1.8, 0.5, 1)' },
        { transform: 'scale(1)' },
      ],
      FACE_AT + index * 90,
      260,
    )
  })
  play(
    part('mouth'),
    [
      { opacity: 0, strokeDasharray: '1 1', strokeDashoffset: 1 },
      { opacity: 1, strokeDasharray: '1 1', strokeDashoffset: 1, offset: 0.01 },
      { opacity: 1, strokeDasharray: '1 1', strokeDashoffset: 0 },
    ],
    FACE_AT + 170,
    230,
    'cubic-bezier(0.3, 0, 0.3, 1)',
  )

  // 5. The wink, with a tilt of the head.
  const head = part('head')
  play(
    eyes[1],
    [
      { transform: 'scaleY(1)', easing: 'ease-in' },
      { transform: 'scaleY(0.09)', offset: 0.3 },
      { transform: 'scaleY(0.09)', offset: 0.58, easing: 'ease-out' },
      { transform: 'scaleY(1)' },
    ],
    WINK_AT,
    320,
    'linear',
    'none',
  )
  play(
    head,
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-7deg) translateY(-6px)', offset: 0.4 },
      { transform: 'rotate(0deg)' },
    ],
    WINK_AT - 20,
    360,
    'ease-in-out',
    'none',
  )

  // 6. Paf: the head ducks, the tile bursts out behind it, drops and a ring fly off.
  play(
    head,
    [
      { transform: 'scale(1)', easing: 'ease-in' },
      { transform: 'scale(0.8)', offset: 0.22, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      { transform: 'scale(1.1)', offset: 0.55, easing: 'ease-in-out' },
      { transform: 'scale(0.98)', offset: 0.8, easing: 'ease-in-out' },
      { transform: 'scale(1)' },
    ],
    PAF_AT - 90,
    520,
    'linear',
    'none',
  )
  play(
    part('tile'),
    [
      { opacity: 0, transform: 'scale(0.25) rotate(-16deg)', easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      { opacity: 1, offset: 0.12 },
      { opacity: 1, transform: 'scale(1.12) rotate(3deg)', offset: 0.5, easing: 'ease-in-out' },
      { opacity: 1, transform: 'scale(0.97) rotate(-1deg)', offset: 0.76, easing: 'ease-in-out' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' },
    ],
    PAF_AT,
    430,
  )
  play(
    part('ring'),
    [
      { opacity: 0, transform: 'scale(0.9)', strokeWidth: 34 },
      { opacity: 0.95, offset: 0.12 },
      { opacity: 0.6, strokeWidth: 16, offset: 0.55 },
      { opacity: 0, transform: 'scale(1.65)', strokeWidth: 3 },
    ],
    PAF_AT + 60,
    480,
    'cubic-bezier(0.2, 0.6, 0.4, 1)',
  )
  parts('splash').forEach((element, index) => play(element, now.splashes[index]!.frames, PAF_AT + 30, 520))

  // 7. The icon goes to its place in the page, which shows up behind it.
  const place = placeOf(home)
  const dx = place.x + props.size / 2 - now.x
  const dy = place.y + props.size / 2 - now.y
  play(part('backdrop'), { opacity: [1, 0] }, LAND_AT + 60, LAND_FOR - 60, 'ease-in-out')
  const landing = play(
    part('logo'),
    { transform: ['translate(0px, 0px) scale(1)', `translate(${dx}px, ${dy}px) scale(${props.size / now.large})`] },
    LAND_AT,
    LAND_FOR,
    'cubic-bezier(0.6, 0, 0.15, 1)',
  )
  // Stopped before its end, there is nothing more to do: finish() already ran.
  landing?.finished.then(finish, () => {})
}

/** The entrance is over, or was cut short: only the icon in the page stays. */
function finish(): void {
  cancelAnimationFrame(firstFrame)
  removeEventListener('pointerdown', skip)
  removeEventListener('keydown', skip)
  removeEventListener('resize', finish)
  for (const animation of running.splice(0)) animation.cancel()
  scene.value = null
  leaving.value = false
}

/** A click or a key: the stage fades away over the page, already in place under it. */
function skip(): void {
  if (leaving.value || !scene.value) return
  leaving.value = true
  window.setTimeout(finish, 180)
}

/** Plays the entrance from its start. Asked for again while it plays, it does nothing. */
function start(atLaunch = false): void {
  if (scene.value) return
  wait = atLaunch ? WAIT_AT_LAUNCH : WAIT_ON_DEMAND
  scene.value = makeScene(innerWidth, innerHeight)
  addEventListener('pointerdown', skip)
  addEventListener('keydown', skip)
  addEventListener('resize', finish)
  // The browser draws nothing while the window is hidden: this runs with its first picture.
  firstFrame = requestAnimationFrame(build)
}

onMounted(() => {
  if (!props.auto || played || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  played = true
  start(true)
})

defineExpose({ play: () => start() })

onBeforeUnmount(finish)
</script>

<template>
  <span
    ref="anchor"
    class="logo-intro"
    :class="{ playing: scene && !leaving }"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <!-- In the page the icon is alive: it looks around and blinks (AppMascot). -->
    <AppMascot :size="size" />

    <Teleport to="body">
      <div v-if="scene" ref="stage" class="stage" :class="{ leaving }" aria-hidden="true">
        <div class="backdrop" data-part="backdrop" />

        <svg class="filters" width="0" height="0">
          <filter id="logo-intro-goo" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" :stdDeviation="scene.blur" />
            <!-- Keeps the colour, and cuts the blurred edge back to a sharp one. -->
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
          </filter>
        </svg>

        <div class="goo" data-part="goo">
          <!-- Too small to show once blurred, but there from the first picture: the filter
               is set up while the stage is still empty, not when the first drop comes in. -->
          <span class="primer" :style="{ left: `${scene.x}px`, top: `${scene.y}px`, background: CREAM }" />
          <span
            v-for="(drop, index) in scene.drops"
            :key="index"
            class="drop"
            data-part="drop"
            :style="{
              left: `${scene.x - drop.radius}px`,
              top: `${scene.y - drop.radius}px`,
              width: `${drop.radius * 2}px`,
              height: `${drop.radius * 2}px`,
              background: CREAM,
            }"
          />
          <svg
            class="mass"
            viewBox="0 0 512 512"
            :width="scene.large"
            :height="scene.large"
            :style="{ left: `${scene.x - scene.large / 2}px`, top: `${scene.y - scene.large / 2}px` }"
          >
            <path
              data-part="blob"
              :d="BLOBS[0]"
              :fill="CREAM"
              :style="{ transformOrigin: `${BUBBLE_CENTER.x}px ${BUBBLE_CENTER.y}px` }"
            />
          </svg>
        </div>

        <div
          class="traveller"
          data-part="logo"
          :style="{ left: `${scene.x - scene.large / 2}px`, top: `${scene.y - scene.large / 2}px` }"
        >
          <AppIcon :size="scene.large">
            <template #behind>
              <circle data-part="ring" cx="256" cy="256" r="236" fill="none" :stroke="CREAM" stroke-width="22" />
              <circle
                v-for="(splash, index) in scene.splashes"
                :key="index"
                data-part="splash"
                cx="256"
                cy="256"
                :r="splash.radius"
                :fill="splash.color"
              />
            </template>
          </AppIcon>
        </div>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.logo-intro {
  display: block;
  /* The shadow the page gives the icon comes in softly once the icon has landed. */
  transition: filter 0.5s ease-out;
}
.logo-intro.playing {
  filter: none !important;
  visibility: hidden;
}

.stage {
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  /* The page under it stays usable: a click goes through, and ends the entrance. */
  pointer-events: none;
  transition: opacity 0.18s ease-out;
}
.stage.leaving {
  opacity: 0;
}
.backdrop {
  position: absolute;
  inset: 0;
  /* The site's own dark: in the app this is the app's background. */
  background: var(--intro-backdrop, #2a1912);
}
.filters {
  position: absolute;
}

.goo {
  position: absolute;
  inset: 0;
  filter: url('#logo-intro-goo');
}
.drop {
  position: absolute;
  border-radius: 50%;
  /* Each drop gets its own layer from the start, not at the moment it leaves. */
  will-change: transform;
}
.primer {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
}
.mass {
  position: absolute;
  overflow: visible;
}

.traveller {
  position: absolute;
  will-change: transform;
}
</style>
