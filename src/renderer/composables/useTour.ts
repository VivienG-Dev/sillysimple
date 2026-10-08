// The guided tour of the chat screen, shown once after the first launch:
//
//   const tour = useTour()
//   tour.start()        // from the chat screen, when it has not been seen yet
//
// The tour itself is <AppTour />, mounted once in App.vue. It points at parts of the
// screen one after the other; what it says is in that component.

/** The step on screen (0 = the first), or null when no tour is running. */
const step = ref<number | null>(null)

export function useTour() {
  const settingsStore = useSettingsStore()

  function start(): void {
    step.value = 0
  }

  /** Ends the tour, finished or skipped: either way it is not shown again by itself. */
  async function end(): Promise<void> {
    step.value = null
    if (!settingsStore.settings.tourDone) await settingsStore.update({ tourDone: true })
  }

  return { step, start, end }
}
