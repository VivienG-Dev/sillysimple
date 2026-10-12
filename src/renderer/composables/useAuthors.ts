import type { Author } from '@shared/types'

// The partner authors, read once: they come with the app and do not change while it runs.
const authors = ref<Author[]>([])
let loading: Promise<void> | null = null

/** The partners whose characters come with the app (see src/main/authors.ts). */
export function useAuthors() {
  loading ??= window.api.authors
    .list()
    .then((list) => {
      authors.value = list
    })
    .catch(() => {
      // Without them, "by …" still credits everyone: only the pages are missing.
      loading = null
    })

  /** The partner a card's creator is, or null: matched as the main process does, on the name made into an id. */
  function partnerOf(name: string | undefined): Author | null {
    if (!name) return null
    const id = idOf(name)
    return authors.value.find((author) => author.id === id) ?? null
  }

  return { authors: readonly(authors), partnerOf }
}

/** The same as authorId() in src/main/authors.ts. */
function idOf(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'author'
  )
}
