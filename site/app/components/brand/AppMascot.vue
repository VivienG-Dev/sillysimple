<script setup lang="ts">
import { EYES } from '~/assets/brand/shapes'

// Taken from the app (src/renderer/components/AppMascot.vue). For the site: the page is
// first drawn on a server, so what needs the screen waits until it is there; and with
// `:size="null"` it takes the size of the box it is put in.
//
// The app icon, alive (Vivien's idea, 7 October): the little face of the logo looks
// around, blinks, and shows how things are going.
//
//  - Its eyes follow the pointer loosely, and turn fully to where the user clicks.
//  - `waiting`: it keeps an eye on something (the tip of a progress bar), sways, and
//    passes the time: a hop, a look at the user, a look around, a wiggle, a whistled tune.
//  - `happy`: a hop, a wide smile, eyes half closed. `worried`: the smile turns over.
//  - `talking`: its mouth moves, for as long as words are being written beside it.
//  - `cheer()`: a jump for joy, whatever it was doing (a download passed a milestone).
//  - `perk()`: a small start and a blink: it turns to something new (the guide changes subject).
//
// It is the same drawing as AppIcon, whose pieces are moved from here: the eyes with
// `translate` and `scale`, the head with `translate` and `rotate`, the mouth by sliding
// from one curve to another. Nothing runs frame by frame: each change is one style set,
// and the browser eases it.
//
// For people who asked their system for less motion it keeps its expressions and stays still.

export type MascotMood = 'idle' | 'waiting' | 'happy' | 'worried'

const props = withDefaults(
  defineProps<{
    size?: number | null
    mood?: MascotMood
    /** What it keeps an eye on while it waits, and how far along its width (0 to 1). */
    watches?: HTMLElement | null
    watchesAt?: number
    /** Its mouth moves: it is saying something. */
    talking?: boolean
  }>(),
  { size: 56, mood: 'idle', watches: null, watchesAt: 1, talking: false },
)

// --- The mouth ---------------------------------------------------------------------
// Curves with the same number of points, so that one slides into the next. They are
// drawn in the face's own frame (it leans 15 degrees) and written here as they come out.
const MOUTHS: Record<MascotMood, string> = {
  idle: 'M266.6 309.2 C289.0 310.5 309.3 301.0 321.7 281.0', // The logo's own smile.
  waiting: 'M275.2 305.4 C289.8 306.1 304.7 299.5 313.5 286.3',
  happy: 'M255.8 306.4 C288.6 324.6 317.9 310.5 328.5 272.5',
  worried: 'M272.8 312.2 C285.5 297.4 302.1 289.9 321.1 295.1',
}
/** A small round mouth: a curve that comes back to where it left. For whistling, and for speaking. */
const ROUND_MOUTH = 'M300.1 301.8 C281.2 289.3 310.2 281.5 300.1 301.8'

// --- What it does while it waits -----------------------------------------------------
// One of these every few seconds, never the same twice in a row.
type Act = 'hop' | 'peek' | 'around' | 'wiggle' | 'whistle' | 'cheer' | 'perk'
const PASTIMES: Act[] = ['hop', 'peek', 'around', 'wiggle', 'whistle']
const ACT_LASTS_MS: Record<Act, number> = { hop: 620, peek: 1300, around: 1700, wiggle: 800, whistle: 2300, cheer: 900, perk: 420 }

/** What it is doing right now, on top of its mood. */
const act = ref<Act | null>(null)
/** Its mouth is open, between two syllables. */
const mouthOpen = ref(false)
/** The face it shows: a jump for joy is a happy face, whatever the mood. */
const face = computed<MascotMood>(() => (act.value === 'cheer' ? 'happy' : props.mood))

// --- Where it looks ------------------------------------------------------------------

/** How far the eyes go, in the icon's own 512 box. */
const EYE_REACH = { x: 12, y: 9 }
/** Following the pointer is loose; a click, or what it watches, gets its whole attention. */
const LOOSE = 0.55
/** Beyond this many pixels, it looks as far as it can. */
const FAR = 180
/** How long a click holds its attention, and how long it keeps looking at a pointer that stopped. */
const CLICK_HOLDS_MS = 1400
const POINTER_HOLDS_MS = 2600

const root = ref<HTMLElement | null>(null)
/** From -1 to 1 each way: 0 is straight ahead. */
const gaze = reactive({ x: 0, y: 0 })
/** True for people who asked their system for less motion. Known once the page is on screen. */
const still = ref(false)
/** Its size for what is sized after it. When it fills its box, a middle size is assumed. */
const drawn = computed(() => props.size ?? 120)

let attentionUntil = 0
let restTimer = 0
let blinkTimer = 0
let watchTimer = 0
let actTimer = 0
let actEnds = 0
let talkTimer = 0
let glances: number[] = []
let frame = 0

function lookAt(clientX: number, clientY: number, strength: number): void {
  const box = root.value?.getBoundingClientRect()
  if (!box || box.width === 0) return
  const dx = clientX - (box.left + box.width / 2)
  const dy = clientY - (box.top + box.height / 2)
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return rest()
  const reach = Math.min(1, distance / FAR) * strength
  gaze.x = (dx / distance) * reach
  gaze.y = (dy / distance) * reach
}

function rest(): void {
  gaze.x = 0
  gaze.y = 0
}

/** Back to what it was doing: watching its bar, or looking straight ahead. */
function settle(): void {
  if (Date.now() < attentionUntil) return
  const watched = props.mood === 'waiting' ? props.watches?.getBoundingClientRect() : undefined
  if (watched && watched.width > 0) lookAt(watched.left + watched.width * props.watchesAt, watched.top + watched.height / 2, 1)
  else rest()
}

function onPointerMove(event: PointerEvent): void {
  // While it waits, its eyes are on what it waits for: only a click takes them off it.
  if (props.mood === 'waiting' && props.watches) return
  if (Date.now() < attentionUntil || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    lookAt(event.clientX, event.clientY, LOOSE)
    clearTimeout(restTimer)
    restTimer = window.setTimeout(settle, POINTER_HOLDS_MS)
  })
}

function onPointerDown(event: PointerEvent): void {
  attentionUntil = Date.now() + CLICK_HOLDS_MS
  lookAt(event.clientX, event.clientY, 1)
  blink()
  clearTimeout(restTimer)
  restTimer = window.setTimeout(settle, CLICK_HOLDS_MS + 20)
}

// --- Moving the pieces ---------------------------------------------------------------

const eyes = (): HTMLElement[] => [...(root.value?.querySelectorAll<HTMLElement>('[data-part="eye"]') ?? [])]

/** Each eye leans (see AppIcon): "to the right on screen" is another direction in its own frame. */
function placeEyes(): void {
  eyes().forEach((eye, index) => {
    const lean = (-(EYES[index]?.rot ?? 0) * Math.PI) / 180
    const x = gaze.x * EYE_REACH.x
    const y = gaze.y * EYE_REACH.y
    eye.style.translate = `${(x * Math.cos(lean) - y * Math.sin(lean)).toFixed(2)}px ${(x * Math.sin(lean) + y * Math.cos(lean)).toFixed(2)}px`
  })
}

function setMouth(): void {
  const mouth = root.value?.querySelector<HTMLElement>('[data-part="mouth"]')
  const round = mouthOpen.value || act.value === 'whistle'
  mouth?.style.setProperty('d', `path("${round ? ROUND_MOUTH : MOUTHS[face.value]}")`)
}

// --- Passing the time ----------------------------------------------------------------

function play(next: Act): void {
  if (still.value) return
  clearTimeout(actEnds)
  for (const glance of glances.splice(0)) clearTimeout(glance)
  act.value = next
  setMouth()

  // Some of them are a matter of where it looks.
  const hold = ACT_LASTS_MS[next]
  attentionUntil = Math.max(attentionUntil, Date.now() + (next === 'peek' || next === 'around' ? hold : 0))
  if (next === 'peek') {
    rest() // Straight at the user: "still there?"
    glances.push(window.setTimeout(blink, 350))
  } else if (next === 'around') {
    gaze.x = -0.9
    gaze.y = -0.25
    glances.push(
      window.setTimeout(() => {
        gaze.x = 0.9
        gaze.y = -0.25
      }, hold * 0.45),
    )
  }

  actEnds = window.setTimeout(() => {
    act.value = null
    setMouth()
    settle()
  }, hold)
}

/** A jump for joy, whatever it was doing. */
function cheer(): void {
  play('cheer')
}

/** A small start: something new has its attention. Not in the middle of a jump for joy. */
function perk(): void {
  if (still.value || act.value === 'cheer') return
  play('perk')
  blink()
}

let lastPastime: Act | null = null

function passTheTime(): void {
  clearTimeout(actTimer)
  if (still.value || props.mood !== 'waiting') return
  actTimer = window.setTimeout(
    () => {
      if (props.mood === 'waiting' && act.value === null && Date.now() >= attentionUntil) {
        const choices = PASTIMES.filter((pastime) => pastime !== lastPastime)
        lastPastime = choices[Math.floor(Math.random() * choices.length)]!
        play(lastPastime)
      }
      passTheTime()
    },
    2000 + Math.random() * 2200,
  )
}

// --- Speaking ------------------------------------------------------------------------

function speak(): void {
  clearInterval(talkTimer)
  mouthOpen.value = false
  if (props.talking && !still.value) {
    // Open, shut, open: uneven on purpose, like syllables.
    talkTimer = window.setInterval(() => {
      mouthOpen.value = !mouthOpen.value && Math.random() > 0.15
      setMouth()
    }, 115)
  }
  setMouth()
}

function blink(): void {
  if (still.value) return
  for (const eye of eyes()) {
    // Added to whatever the mood does to the eyes, and gone once played.
    eye.animate({ scale: ['1 1', '1 0.08', '1 1'] }, { duration: 150, easing: 'ease-in-out', composite: 'accumulate' })
  }
}

function blinkNowAndThen(): void {
  blinkTimer = window.setTimeout(
    () => {
      blink()
      blinkNowAndThen()
    },
    2400 + Math.random() * 3600,
  )
}

watch(gaze, placeEyes)
watch(
  () => props.mood,
  () => {
    setMouth()
    settle()
    passTheTime()
  },
)
watch(() => props.talking, speak)
// What it watches moves (a bar fills up): its eyes go along.
watch(() => [props.watches, props.watchesAt], settle)

onMounted(() => {
  still.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  setMouth()
  placeEyes()
  settle()
  if (still.value) return
  addEventListener('pointermove', onPointerMove, { passive: true })
  addEventListener('pointerdown', onPointerDown, { passive: true })
  blinkNowAndThen()
  passTheTime()
  speak()
  // The page may scroll, or lay itself out, under what it watches.
  watchTimer = window.setInterval(settle, 700)
})

defineExpose({ cheer, perk })

onBeforeUnmount(() => {
  removeEventListener('pointermove', onPointerMove)
  removeEventListener('pointerdown', onPointerDown)
  clearTimeout(restTimer)
  clearTimeout(blinkTimer)
  clearTimeout(actTimer)
  clearTimeout(actEnds)
  for (const glance of glances) clearTimeout(glance)
  clearInterval(watchTimer)
  clearInterval(talkTimer)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <span
    ref="root"
    class="mascot"
    :class="[mood, `face-${face}`, act ? `act-${act}` : '', { still, talking }]"
    :style="{ ...(size ? { width: `${size}px`, height: `${size}px` } : {}), '--gaze-x': gaze.x, '--gaze-y': gaze.y }"
  >
    <!-- Its mood moves the whole of it; what it does on top of that moves this. -->
    <span class="body"><AppIcon :size="size" /></span>
    <!-- The tune it whistles. -->
    <template v-if="act === 'whistle'">
      <span class="note" aria-hidden="true">♪</span>
      <span class="note" aria-hidden="true">♫</span>
      <span class="note" aria-hidden="true">♪</span>
    </template>
  </span>
</template>

<style scoped>
.mascot {
  position: relative;
  flex-shrink: 0;
  display: block;
}
.body {
  display: block;
  transform-origin: 50% 85%;
}

/* The pieces follow the eyes a little: the head turns, the mouth goes along. */
.mascot :deep([data-part='head']) {
  translate: calc(var(--gaze-x) * 5px) calc(var(--gaze-y) * 4px);
  rotate: calc(var(--gaze-x) * 2.5deg);
  transition:
    translate 0.24s ease-out,
    rotate 0.24s ease-out;
}
.mascot :deep([data-part='eye']) {
  transition:
    translate 0.2s ease-out,
    scale 0.22s ease-out;
}
.mascot :deep([data-part='mouth']) {
  translate: calc(var(--gaze-x) * 6px) calc(var(--gaze-y) * 5px);
  transition:
    translate 0.24s ease-out,
    d 0.3s cubic-bezier(0.3, 1.5, 0.5, 1);
}

/* Speaking: the mouth has no time to slide. */
.talking :deep([data-part='mouth']) {
  transition:
    translate 0.24s ease-out,
    d 0.09s linear;
}

/* Happy: eyes half closed by the smile. */
.face-happy :deep([data-part='eye']) {
  scale: 1 0.5;
}

/* --- How it holds itself ---------------------------------------------------------- */

.waiting {
  animation: mascot-bob 1.7s ease-in-out infinite;
}
.happy {
  animation: mascot-hop 0.72s cubic-bezier(0.3, 0, 0.3, 1) 1;
}
.worried {
  animation: mascot-shake 0.5s ease-in-out 1;
}

@keyframes mascot-bob {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  /* Two little bounces, one leaning each way. */
  25% {
    transform: translateY(-10%) rotate(-6deg);
  }
  50% {
    transform: translateY(0) rotate(0deg);
  }
  75% {
    transform: translateY(-10%) rotate(6deg);
  }
}

/* --- What it does on top of its mood ------------------------------------------------ */

.act-hop .body {
  animation: mascot-hop 0.62s cubic-bezier(0.3, 0, 0.3, 1) 1;
}
.act-cheer .body {
  animation: mascot-cheer 0.9s cubic-bezier(0.3, 0, 0.3, 1) 1;
}
.act-wiggle .body {
  animation: mascot-wiggle 0.8s ease-in-out 1;
}
.act-whistle .body {
  animation: mascot-sway 1.15s ease-in-out 2;
}
.act-peek .body {
  animation: mascot-lean 1.3s ease-in-out 1;
}
.act-perk .body {
  animation: mascot-perk 0.42s cubic-bezier(0.3, 0, 0.3, 1) 1;
}

@keyframes mascot-cheer {
  0% {
    transform: translateY(0) scale(1, 1) rotate(0deg);
  }
  14% {
    transform: translateY(5%) scale(1.12, 0.86);
  }
  45% {
    transform: translateY(-38%) scale(0.94, 1.08) rotate(-8deg);
  }
  62% {
    transform: translateY(-32%) scale(1, 1) rotate(8deg);
  }
  84% {
    transform: translateY(3%) scale(1.08, 0.92) rotate(0deg);
  }
  100% {
    transform: translateY(0) scale(1, 1);
  }
}
/* Ducks, then straightens up a little taller than it stood. */
@keyframes mascot-perk {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  22% {
    transform: translateY(3%) scale(1.07, 0.92);
  }
  58% {
    transform: translateY(-12%) scale(0.96, 1.07) rotate(-4deg);
  }
  82% {
    transform: translateY(1%) scale(1.03, 0.97);
  }
}
@keyframes mascot-wiggle {
  0%,
  100% {
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(-13deg);
  }
  45% {
    transform: rotate(11deg);
  }
  70% {
    transform: rotate(-7deg);
  }
  88% {
    transform: rotate(4deg);
  }
}
@keyframes mascot-sway {
  0%,
  100% {
    transform: rotate(0deg) translateX(0);
  }
  50% {
    transform: rotate(9deg) translateX(4%);
  }
}
/* Leans forward to look at the user. */
@keyframes mascot-lean {
  0%,
  100% {
    transform: scale(1);
  }
  25%,
  75% {
    transform: scale(1.14) translateY(-3%);
  }
}

/* The notes of the tune: they leave from beside its mouth and drift up. */
.note {
  position: absolute;
  left: 78%;
  top: 28%;
  font-size: max(11px, calc(v-bind(drawn) * 0.34px));
  font-weight: 700;
  line-height: 1;
  color: var(--cream);
  opacity: 0;
  pointer-events: none;
  animation: mascot-note 1.5s ease-out 1 both;
}
.note:nth-of-type(2) {
  animation-delay: 0.45s;
  left: 92%;
  color: #f6b15c;
}
.note:nth-of-type(3) {
  animation-delay: 0.9s;
  left: 70%;
}
@keyframes mascot-note {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(-10deg) scale(0.6);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(70%, -150%) rotate(18deg) scale(1.1);
  }
}
@keyframes mascot-hop {
  0% {
    transform: translateY(0) scale(1, 1);
  }
  12% {
    transform: translateY(4%) scale(1.08, 0.9);
  }
  42% {
    transform: translateY(-34%) scale(0.96, 1.06);
  }
  66% {
    transform: translateY(2%) scale(1.06, 0.93);
  }
  82% {
    transform: translateY(-9%) scale(1, 1);
  }
  100% {
    transform: translateY(0) scale(1, 1);
  }
}
@keyframes mascot-shake {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-6deg);
  }
  60% {
    transform: rotate(5deg);
  }
}

.still,
.still .body,
.still :deep([data-part]) {
  animation: none;
  transition: none;
}
</style>
