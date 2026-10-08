import type { LorebookEntry } from '@shared/types'

/** An empty lorebook note, as the editor adds one and as "Describe your character" fills them in. */
export function newLoreEntry(): LorebookEntry {
  return {
    name: '',
    keys: [],
    secondaryKeys: [],
    selective: false,
    constant: false,
    enabled: true,
    caseSensitive: false,
    content: '',
    insertionOrder: 100,
    position: 'before_char',
    source: null,
  }
}
