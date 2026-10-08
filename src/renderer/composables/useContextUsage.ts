import { buildMessages } from '@core/prompt/buildMessages'
import { effectiveContextSize, fitToContext, replyTokens } from '@core/prompt/context'

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
      }),
      { contextSize, replyTokens: reserved },
    )

    return {
      /** Tokens taken once the reply is written: what is sent, plus the room kept for the reply. */
      occupiedTokens: fit.usedTokens + reserved,
      contextSize,
      /** Oldest messages the model no longer sees. */
      droppedCount: fit.droppedCount,
    }
  })
}
