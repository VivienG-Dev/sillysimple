import type { Character } from '@shared/types'

// Opens the character editor from anywhere:
//
//   const editor = useCharacterEditor()
//   editor.open(character)   // edit this character
//   editor.open(null)        // write a new one
//   editor.openInStory(sophie)  // write a new one who belongs to Sophie's story
//
// The editor itself is <CharacterEditor />, mounted once in App.vue.

/**
 * What the editor is working on. `character: null` means a new character; `inStory`, a
 * character whose story the new one belongs to (the model reads their card first).
 */
const editing = ref<{ character: Character | null; inStory?: Character } | null>(null)

export function useCharacterEditor() {
  function open(character: Character | null): void {
    editing.value = { character }
  }

  function openInStory(source: Character): void {
    editing.value = { character: null, inStory: source }
  }

  function close(): void {
    editing.value = null
  }

  return { editing, open, openInStory, close }
}
