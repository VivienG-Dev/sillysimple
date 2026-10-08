import type { InjectionKey, Ref } from 'vue'

// The first launch has a guide: the mascot, standing at the top of the screen, saying
// what each step is about (components/MascotGuide.vue). When it is there, it is the one
// that waits for a download, its eyes on the bar: the bar then comes without a mascot of
// its own, and tells the guide where it is.

export interface Guide {
  /** The progress bar on screen, while a download runs. */
  bar: Ref<HTMLElement | null>
}

export const GUIDE: InjectionKey<Guide> = Symbol('guide')
