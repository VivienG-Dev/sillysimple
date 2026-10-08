import type { Ref } from 'vue'

/**
 * Tells when something has come into sight, for what arrives with a small animation.
 *
 * It returns `unseen`: true while the element waits out of sight, false from the moment it
 * shows. It is false on the server and before the page is ready, so that nothing is ever
 * hidden for someone without scripts; and it stays false for people who asked their system
 * for less motion.
 */
export function useSeen(element: Ref<HTMLElement | null>, share = 0.35): Ref<boolean> {
  const unseen = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    const el = element.value
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    unseen.value = true
    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        unseen.value = false
        observer?.disconnect()
      },
      // A tall thing counts as seen once a good part of the window shows it.
      { threshold: Math.min(share, (innerHeight * 0.5) / Math.max(1, el.offsetHeight)) },
    )
    observer.observe(el)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return unseen
}
