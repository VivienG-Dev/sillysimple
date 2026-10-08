import type { Character } from '@shared/types'

// Opens the character editor from anywhere:
//
//   const editor = useCharacterEditor()
//   editor.open(character)   // edit this character
//   editor.open(null)        // write a new one
//
// The editor itself is <CharacterEditor />, mounted once in App.vue.

/** What the editor is working on. `character: null` means a new character. */
const editing = ref<{ character: Character | null } | null>(null)

export function useCharacterEditor() {
  function open(character: Character | null): void {
    editing.value = { character }
  }

  function close(): void {
    editing.value = null
  }

  return { editing, open, close }
}
