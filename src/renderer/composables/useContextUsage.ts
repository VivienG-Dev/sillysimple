import { buildMessages } from '@core/prompt/buildMessages'
import { effectiveContextSize, fitToContext, replyTokens, SAFETY_MARGIN } from '@core/prompt/context'

/**
 * How full the model's context is for the chat on screen, computed with the very
 * functions the main process uses when it sends the conversation.
 * Null when there is no character on screen.
 */
export function useContextUsage() {
  const charactersStore = useCharactersStore()
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()
  const connectionStore = useConnectionStore()

  return computed(() => {
    const character = charactersStore.active
    if (!character) return null

    const generation = settingsStore.generation
    const contextSize = effectiveContextSize(generation, connectionStore.detectedContext)
    const reserved = replyTokens(generation)
    const fit = fitToContext(
      buildMessages({
        character,
        persona: settingsStore.persona,
        systemPrompt: generation.systemPrompt,
        // What the long memory covers is not sent as messages, but as its summary.
        history: chatStore.messages.slice(chatStore.memory?.count ?? 0),
        memory: chatStore.memory?.summary,
        story: settingsStore.adapt.followStory ? chatStore.story : undefined,
        tastes: settingsStore.adapt.learnTastes ? settingsStore.adapt : undefined,
        // In a chat with several characters, the size is that of a reply by the chat's own.
        others: chatStore.members.slice(1).map((member) => member.character),
        useCardPrompts: generation.useCardPrompts,
        contextSize,
        // Sent with every reply too: left out, the bar would read lower than what the
        // main process counts, and the memory would seem to start before the bar is full.
        replyLength: generation.maxTokens,
        place: generation.keepPlace ? chatStore.place || null : undefined,
        outfit: generation.keepPlace ? chatStore.outfits[character.id] || null : undefined,
      }),
      { contextSize, replyTokens: reserved },
    )

    // The small margin kept free (see context.ts) counts as taken: the bar is full exactly
    // when the oldest messages stop fitting, which is when the long memory steps in.
    const margin = contextSize - Math.floor(contextSize * (1 - SAFETY_MARGIN))

    return {
      /** Tokens taken once the reply is written: what is sent, the room kept for the reply, and the safety margin. */
      // Messages left out: the context is full, whatever room the last one would leave.
      occupiedTokens: fit.droppedCount > 0 ? contextSize : fit.usedTokens + reserved + margin,
      contextSize,
      /** Oldest messages the model no longer sees. */
      droppedCount: fit.droppedCount,
    }
  })
}
