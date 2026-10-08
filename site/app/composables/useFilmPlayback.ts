// What a film of the page does (components/film/AppFilm.vue): it starts by itself once most
// of it is in sight, rests when it has nearly left the screen, and knows which of its
// parts is being shown.

/** The share of the film that has to be in sight for it to start, and under which it rests. */
const MOST = 0.6
const LITTLE = 0.2

export function useFilmPlayback(video: Ref<HTMLVideoElement | null>, steps: () => FilmStep[]) {
  const playing = ref(false)
  const time = ref(0)
  /** The visitor pressed pause: the film no longer starts again by itself. */
  let stopped = false

  /** Which part is being shown: the last one that has started. */
  const current = computed(() => steps().findLastIndex((step) => time.value >= step.at))

  function toggle(): void {
    const el = video.value
    if (!el) return
    if (el.paused) {
      stopped = false
      void el.play().catch(() => {})
    } else {
      stopped = true
      el.pause()
    }
  }

  function goTo(at: number): void {
    const el = video.value
    if (!el) return
    el.currentTime = at
    time.value = at
    stopped = false
    void el.play().catch(() => {})
  }

  let observer: IntersectionObserver | null = null
  onMounted(() => {
    const el = video.value
    // Not at all for people who asked their system for less motion: they press play.
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Starts when most of it is in sight: on many screens the page opens with only its top
    // edge showing, and a film that started then would be half over when it is reached. Once
    // started it goes on until it has nearly left the screen.
    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        // A film taller than the window can never be 60% in sight: most of the window is enough.
        const most = Math.min(MOST, (innerHeight * 0.8) / Math.max(1, el.offsetHeight))
        if (entry.intersectionRatio >= most && !stopped) void el.play().catch(() => {})
        else if (entry.intersectionRatio < LITTLE) el.pause()
      },
      { threshold: Array.from({ length: 21 }, (_, step) => step / 20) },
    )
    observer.observe(el)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return {
    playing,
    time,
    current,
    toggle,
    goTo,
    /** For the film's own events. */
    onPlay: () => (playing.value = true),
    onPause: () => (playing.value = false),
    onTime: () => (time.value = video.value?.currentTime ?? 0),
  }
}
