import type { Mood } from '@core/mood/detectMood'

// The mood read for the last reply of each character, chat by chat, for as long as the
// app runs. The character panel reads it (with the words, and the embedding model where
// it is on) to show it on the picture; the waiting row uses it to say how the character
// is before the next reply ("Lyra hesitates…", see src/core/mood/waiting.ts).

export const useMoodsStore = defineStore('moods', () => {
  /** `chatId:characterId` → the mood of that character's last reply, null when none was read. */
  const last = ref<Record<string, { messageId: string; mood: Mood | null }>>({})

  function note(chatId: string, characterId: string, messageId: string, mood: Mood | null): void {
    last.value[`${chatId}:${characterId}`] = { messageId, mood }
  }

  /** The mood read for that very message, if it was read. */
  function of(chatId: string, characterId: string, messageId: string): Mood | null | undefined {
    const seen = last.value[`${chatId}:${characterId}`]
    return seen?.messageId === messageId ? seen.mood : undefined
  }

  return { note, of }
})
