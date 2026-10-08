import type { Character, CharacterDraft, ImportResult, VoiceChoice, VoiceService } from '@shared/types'

// The characters come from the card files in the app's characters folder,
// read by the main process. This store keeps the list for the UI.

export const useCharactersStore = defineStore('characters', () => {
  const characters = ref<Character[]>([])
  const activeId = ref<string | null>(null)

  /** Most recently talked to first, then alphabetical. */
  const ordered = computed(() =>
    [...characters.value].sort(
      (a, b) => (b.lastChatAt ?? 0) - (a.lastChatAt ?? 0) || a.name.localeCompare(b.name),
    ),
  )

  /** The character on screen, or null when the library is empty. */
  const active = computed(() => characters.value.find((character) => character.id === activeId.value) ?? null)

  async function load(): Promise<void> {
    characters.value = await window.api.characters.list()
    if (!active.value) activeId.value = ordered.value[0]?.id ?? null
  }

  function select(id: string): void {
    activeId.value = id
  }

  /** Imports card files the user dropped or picked. */
  async function importFiles(files: File[]): Promise<ImportResult> {
    const paths = files.map((file) => window.api.characters.pathForFile(file)).filter(Boolean)
    const result = await window.api.characters.import(paths)
    if (result.imported.length > 0) await load()
    return result
  }

  /** Writes a new card file. `portrait` is a PNG picture, if the character has one. */
  async function create(draft: CharacterDraft, portrait?: Uint8Array): Promise<Character> {
    const character = await window.api.characters.create(toPlain(draft), portrait)
    await load()
    return character
  }

  /** Saves the editor's changes into the character's card file. */
  async function update(id: string, draft: CharacterDraft, portrait?: Uint8Array): Promise<Character> {
    const character = await window.api.characters.update(id, toPlain(draft), portrait)
    await load()
    return character
  }

  /** The characters marked as favourites. */
  const favorites = computed(() => characters.value.filter((character) => character.favorite))

  /**
   * Marks a character as a favourite, or removes the mark. The heart changes at once;
   * the card file is rewritten behind it, and the mark is undone if that fails.
   */
  async function toggleFavorite(id: string): Promise<void> {
    const character = characters.value.find((item) => item.id === id)
    if (!character) return
    const wanted = !character.favorite
    character.favorite = wanted
    try {
      const saved = await window.api.characters.setFavorite(id, wanted)
      // Only the mark is taken from the answer: the picture has not changed, and taking its
      // new address would make every picture of this character load again for nothing.
      character.favorite = saved.favorite === true
    } catch {
      character.favorite = !wanted
    }
  }

  /** Gives a character its own voice for a voice service, or takes it away (null). */
  async function setVoice(id: string, service: VoiceService, voice: VoiceChoice | null): Promise<void> {
    const saved = await window.api.characters.setVoice(id, service, toPlain(voice))
    const character = characters.value.find((item) => item.id === id)
    // Only the voices are taken from the answer: the picture has not changed (see toggleFavorite).
    if (character) character.voices = saved.voices
  }

  /** Deletes a character: the card file goes to the trash, the chats are removed. */
  async function remove(id: string): Promise<void> {
    await window.api.characters.delete(id)
    if (activeId.value === id) activeId.value = null
    await load()
  }

  /** Called after a message is exchanged, so the character moves to the top of the list. */
  function markActive(id: string): void {
    const character = characters.value.find((item) => item.id === id)
    if (character) character.lastChatAt = Date.now()
  }

  return {
    characters,
    ordered,
    favorites,
    activeId,
    active,
    load,
    select,
    importFiles,
    create,
    update,
    toggleFavorite,
    setVoice,
    remove,
    markActive,
  }
})
