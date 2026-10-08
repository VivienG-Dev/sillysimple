import type { Ref, WatchSource } from 'vue'

/**
 * Keeps a scrollable list pinned to its bottom while new content arrives,
 * unless the user has scrolled up to read something older.
 */
export function useStickToBottom(element: Ref<HTMLElement | null>, content: WatchSource): void {
  const NEAR_BOTTOM_PX = 80
  let pinned = true

  function onScroll(): void {
    const el = element.value
    if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  function scrollToBottom(): void {
    const el = element.value
    if (el) el.scrollTop = el.scrollHeight
  }

  onMounted(() => {
    element.value?.addEventListener('scroll', onScroll, { passive: true })
    scrollToBottom()
  })
  onBeforeUnmount(() => element.value?.removeEventListener('scroll', onScroll))

  watch(content, () => {
    if (pinned) void nextTick(scrollToBottom)
  })
}
