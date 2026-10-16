import type { Character, ChatMember, ChatMessage, ChatOutcome, ChatSummary, GenerateRequest, Rewrite, RewriteKind, SceneDirection, TurnMode } from '@shared/types'

// The conversation on screen. The main process owns the saved copy (SQLite):
// this store loads a chat from it, and mirrors what changes while the app is open.

interface Streaming {
  requestId: string
  /**
   * The id of the message being written: a new one, or the last reply when the
   * model is writing another version of it. The list shows the text in that place.
   */
  messageId: string
  chatId: string
  /** The character who is writing. */
  characterId: string
  text: string
  /** The model is reasoning and has not written anything yet. */
  thinking: boolean
  /** Old messages are being summed up before the reply is written (long memory). */
  remembering: boolean
  /** The stage direction the reply is written under, if any. */
  direction?: SceneDirection
  /** The reply is the one on screen written again, the way the user asked. */
  rewrite?: RewriteKind
}

export const useChatStore = defineStore('chat', () => {
  const charactersStore = useCharactersStore()

  /** The chats of the character on screen, most recent first. */
  const chats = ref<ChatSummary[]>([])
  const activeChatId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const streaming = ref<Streaming | null>(null)
  const error = ref<{ chatId: string; message: string } | null>(null)

  // What the user is writing and has not sent, chat by chat: it waits for them while they
  // look at another character or at the settings. Kept in memory only, for as long as the
  // app is open: text that was never sent is not written to disk.
  const drafts = ref<Record<string, string>>({})
  const draft = computed<string>({
    get: () => (activeChatId.value ? (drafts.value[activeChatId.value] ?? '') : ''),
    set: (text) => {
      const chatId = activeChatId.value
      if (!chatId) return
      if (text) drafts.value[chatId] = text
      else delete drafts.value[chatId]
    },
  })

  /** Several characters are replying one after the other: busy until the last one is done. */
  const turnRunning = ref(false)
  const isBusy = computed(() => streaming.value !== null || turnRunning.value)

  /** The reply being written, if it belongs to the chat on screen. */
  const streamingReply = computed(() =>
    streaming.value?.chatId === activeChatId.value
      ? {
          id: streaming.value.messageId,
          characterId: streaming.value.characterId,
          text: streaming.value.text,
          thinking: streaming.value.thinking,
          remembering: streaming.value.remembering,
          direction: streaming.value.direction,
          rewrite: streaming.value.rewrite,
        }
      : null,
  )

  // --- The characters of the chat ------------------------------------------------
  // A chat belongs to one character and can have others added to it (a "scene").

  const activeChat = computed(() => chats.value.find((chat) => chat.id === activeChatId.value) ?? null)

  /** Everyone in the chat on screen, in speaking order: the chat's own character first. */
  const members = computed<{ character: Character; quiet: boolean }[]>(() =>
    (activeChat.value?.members ?? []).flatMap((member) => {
      const character = charactersStore.characters.find((item) => item.id === member.characterId)
      return character ? [{ character, quiet: member.quiet }] : [] // A card that is gone is skipped.
    }),
  )
  const isScene = computed(() => members.value.length > 1)
  const turnMode = computed<TurnMode>(() => activeChat.value?.turnMode ?? 'round')

  /** The character who spoke last and is still in the chat; the chat's own character otherwise. */
  function lastSpeakerId(chat: ChatSummary): string {
    const present = new Set(members.value.map((member) => member.character.id))
    const last = messages.value.findLast((message) => message.role === 'assistant' && present.has(message.characterId ?? ''))
    return last?.characterId ?? chat.characterId
  }

  /**
   * In a chat with several characters, the one to show beside the conversation: whoever
   * is writing now, or whoever spoke last, unless the user asked to look at someone else.
   * Null in a chat with one character, and while another character's chat is still loading.
   */
  const lookingAt = ref<string | null>(null)
  const onStage = computed<Character | null>(() => {
    const chat = activeChat.value
    if (!chat || !isScene.value || chat.characterId !== charactersStore.activeId) return null
    const cast = members.value.map((member) => member.character)
    const following = streamingReply.value?.characterId ?? lastSpeakerId(chat)
    return cast.find((item) => item.id === lookingAt.value) ?? cast.find((item) => item.id === following) ?? null
  })

  /** The character after the one shown, in the order of the chat: the one a "show next" would bring. */
  const nextOnStage = computed<Character | null>(() => {
    const cast = members.value.map((member) => member.character)
    const index = cast.findIndex((item) => item.id === onStage.value?.id)
    return index === -1 ? null : cast[(index + 1) % cast.length]!
  })

  /** Shows the next character of the chat, until someone starts speaking. */
  function showNext(): void {
    lookingAt.value = nextOnStage.value?.id ?? null
  }

  /** Who answers a message of the user: everyone in turn, or the character who spoke last. */
  function whoAnswers(chat: ChatSummary): string[] {
    if (!isScene.value) return [chat.characterId]
    const inTurn = members.value.filter((member) => !member.quiet).map((member) => member.character.id)
    return turnMode.value === 'round' && inTurn.length > 0 ? inTurn : [lastSpeakerId(chat)]
  }

  async function saveScene(membersToSave: ChatMember[], mode: TurnMode): Promise<void> {
    const chat = activeChat.value
    if (!chat || isBusy.value) return
    const saved = await window.api.chats.setScene(chat.id, toPlain({ members: membersToSave, turnMode: mode }))
    chats.value = chats.value.map((item) => (item.id === saved.id ? saved : item))
  }

  /** Adds a character to the chat on screen. */
  async function addMember(characterId: string): Promise<void> {
    const chat = activeChat.value
    if (chat) await saveScene([...chat.members, { characterId, quiet: false }], chat.turnMode)
  }

  /** Takes a character out of the chat. What they said stays. */
  async function removeMember(characterId: string): Promise<void> {
    const chat = activeChat.value
    if (chat) await saveScene(chat.members.filter((member) => member.characterId !== characterId), chat.turnMode)
  }

  /** In the background, a character only speaks when asked to. */
  async function setQuiet(characterId: string, quiet: boolean): Promise<void> {
    const chat = activeChat.value
    if (!chat) return
    await saveScene(chat.members.map((member) => (member.characterId === characterId ? { ...member, quiet } : member)), chat.turnMode)
  }

  // --- Long memory -----------------------------------------------------------------
  // What the chat remembers of its oldest messages. The main process writes it when
  // the chat grows long; the user can read it, change it, or have it written again.

  const memory = computed(() => activeChat.value?.memory ?? null)

  /** Replaces the memory by what the user wrote. Null starts it over. */
  async function saveMemory(summary: string | null): Promise<void> {
    const chat = activeChat.value
    if (!chat || isBusy.value) return
    const saved = await window.api.chats.setMemory(chat.id, summary)
    chats.value = chats.value.map((item) => (item.id === saved.id ? saved : item))
  }

  // --- Adapts to you (beta) ----------------------------------------------------------
  // With those options on, the main process has the model read the latest messages now
  // and then, in the background, and tells this store what it noted.

  /** The note on where the story of the chat on screen is heading. Empty: none. */
  const story = computed(() => activeChat.value?.story ?? '')

  /** Replaces that note by what the user wrote. Empty removes it. */
  async function saveStory(note: string): Promise<void> {
    const chat = activeChat.value
    if (!chat) return
    const saved = await window.api.chats.setStory(chat.id, note)
    chats.value = chats.value.map((item) => (item.id === saved.id ? saved : item))
  }

  // --- Where the scene is, what the characters wear -----------------------------------
  // Noted by the main process after each reply, told to the character so that things
  // stay as they are (src/core/prompt/place.ts), and open to the user.

  /** Where the scene of the chat on screen is. Empty: not known. */
  const place = computed(() => activeChat.value?.place ?? '')
  /** What each character of that chat is wearing: character id -> clothes. */
  const outfits = computed(() => activeChat.value?.outfits ?? {})

  /** Replaces the place by what the user wrote. Empty: not known, the next reply says. */
  async function savePlace(typed: string): Promise<void> {
    const chat = activeChat.value
    if (!chat) return
    const saved = await window.api.chats.setPlace(chat.id, typed)
    chats.value = chats.value.map((item) => (item.id === saved.id ? saved : item))
  }

  /** The same for what a character wears. */
  async function saveOutfit(characterId: string, typed: string): Promise<void> {
    const chat = activeChat.value
    if (!chat) return
    const saved = await window.api.chats.setOutfit(chat.id, characterId, typed)
    chats.value = chats.value.map((item) => (item.id === saved.id ? saved : item))
  }

  window.api.chat.onPlace((event) => {
    chats.value = chats.value.map((item) => {
      if (item.id !== event.chatId) return item
      const { place: _place, outfits: _outfits, ...rest } = item
      return {
        ...rest,
        ...(event.place && { place: event.place }),
        ...(Object.keys(event.outfits).length > 0 && { outfits: event.outfits }),
      }
    })
  })

  /** The tags just added to the user's tastes: shown for a moment, so nothing is learned behind their back. */
  const noticed = ref<{ likes: string[]; dislikes: string[] } | null>(null)
  let noticedTimer: ReturnType<typeof setTimeout> | undefined
  function dismissNoticed(): void {
    clearTimeout(noticedTimer)
    noticed.value = null
  }

  window.api.chat.onNotice((event) => {
    if (event.story !== undefined) {
      chats.value = chats.value.map((item) => (item.id === event.chatId ? { ...item, story: event.story } : item))
    }
    if (event.added.likes.length + event.added.dislikes.length === 0) return
    void useSettingsStore().load() // The tags are settings: read them as they now are.
    clearTimeout(noticedTimer)
    noticed.value = event.added
    noticedTimer = setTimeout(dismissNoticed, 15000)
  })

  async function setTurnMode(mode: TurnMode): Promise<void> {
    const chat = activeChat.value
    if (chat) await saveScene(chat.members, mode)
  }
  const activeError = computed(() => (error.value?.chatId === activeChatId.value ? error.value.message : null))

  /** The last message is a reply (not the greeting): another version of it can be written. */
  const canRegenerate = computed(
    () => !isBusy.value && messages.value.length > 1 && messages.value.at(-1)?.role === 'assistant',
  )
  /** The last message is a reply that ran into the length limit: the model can write the rest of it. */
  const canContinue = computed(() => !isBusy.value && messages.value.at(-1)?.role === 'assistant' && messages.value.at(-1)?.cut === true)
  /** The last message is the user's own, with no reply yet: one can be generated. */
  const canRetry = computed(() => !isBusy.value && messages.value.at(-1)?.role === 'user')
  /** A chat where the user has not written yet is already a new chat. */
  const canStartNew = computed(() => !isBusy.value && messages.value.some((message) => message.role === 'user'))

  window.api.chat.onEvent((event) => {
    if (streaming.value?.requestId !== event.requestId) return
    if (event.type === 'memory') {
      streaming.value.remembering = true
    } else if (event.type === 'thinking') {
      // While old messages are summed up, the model may think too: that label stays.
      streaming.value.thinking = !streaming.value.remembering
    } else {
      streaming.value.thinking = false
      streaming.value.remembering = false
      streaming.value.text += event.delta
    }
  })

  // --- Opening chats -----------------------------------------------------------

  // Loading is asynchronous: if the user switches again before a load ends,
  // only the latest one may update the screen.
  let latestLoad = 0

  // Selecting a character opens their most recent chat, or starts their first one.
  watch(() => charactersStore.activeId, openCharacter, { immediate: true })

  async function openCharacter(characterId: string | null): Promise<void> {
    const thisLoad = ++latestLoad
    if (!characterId) {
      show([], null, [])
      return
    }

    let list = await window.api.chats.list(characterId)
    let opened: ChatMessage[]
    if (list.length === 0) {
      const created = await window.api.chats.create(characterId)
      list = [created.chat]
      opened = created.messages
    } else {
      opened = await window.api.chats.open(list[0]!.id)
    }

    if (thisLoad === latestLoad) show(list, list[0]!.id, opened)
  }

  // The greetings of the character on screen were changed in the editor: a chat nothing
  // was said in yet has been given the new ones (see `refreshGreeting`), so it is read again.
  watch(
    () => JSON.stringify([charactersStore.active?.id, charactersStore.active?.firstMessage, charactersStore.active?.alternateGreetings]),
    (now, before) => {
      const sameCharacter = JSON.parse(now)[0] === JSON.parse(before)[0]
      const untouched = !messages.value.some((message) => message.role === 'user') && messages.value.length <= 1
      if (sameCharacter && untouched && !isBusy.value) void reload()
    },
  )

  /** Reads the chats of the character on screen again, after they changed outside this store. */
  async function reload(): Promise<void> {
    error.value = null
    await openCharacter(charactersStore.activeId)
  }

  async function openChat(chatId: string): Promise<void> {
    const thisLoad = ++latestLoad
    const opened = await window.api.chats.open(chatId)
    if (thisLoad === latestLoad) show(chats.value, chatId, opened)
  }

  async function startNew(): Promise<void> {
    const characterId = charactersStore.activeId
    if (!characterId || !canStartNew.value) return

    const thisLoad = ++latestLoad
    const created = await window.api.chats.create(characterId)
    if (thisLoad === latestLoad) show([created.chat, ...chats.value], created.chat.id, created.messages)
  }

  /** Deletes the chat on screen, then shows the next most recent one (or a fresh one). */
  async function deleteChat(): Promise<void> {
    const chatId = activeChatId.value
    if (!chatId || isBusy.value) return

    await window.api.chats.delete(chatId)
    delete drafts.value[chatId]
    if (error.value?.chatId === chatId) error.value = null
    await openCharacter(charactersStore.activeId)
  }

  function show(list: ChatSummary[], chatId: string | null, opened: ChatMessage[]): void {
    chats.value = list
    activeChatId.value = chatId
    messages.value = opened
    lookingAt.value = null
  }

  // --- Changing messages -------------------------------------------------------

  async function editMessage(messageId: string, content: string): Promise<void> {
    const text = content.trim()
    if (!text || isBusy.value) return
    replace(await window.api.messages.edit(messageId, text))
  }

  /** Deletes a message and every message after it: the chat goes back to just before it. */
  async function deleteMessage(messageId: string): Promise<void> {
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index === -1 || isBusy.value) return
    await window.api.messages.delete(messageId)
    messages.value = messages.value.slice(0, index)
    if (error.value?.chatId === activeChatId.value) error.value = null
    await refreshChatList()
  }

  /** Shows another version of a reply that has several. */
  async function selectSwipe(messageId: string, index: number): Promise<void> {
    if (isBusy.value) return
    replace(await window.api.messages.selectSwipe(messageId, index))
  }

  /** Puts the saved state of a message in the list: in its place if it is there, at the end if it is new. */
  function replace(saved: ChatMessage): void {
    const index = messages.value.findIndex((message) => message.id === saved.id)
    if (index === -1) messages.value.push(saved)
    else messages.value[index] = saved
  }

  /** Message counts and order of the chat picker, read again from the database. */
  async function refreshChatList(): Promise<void> {
    const characterId = charactersStore.activeId
    if (!characterId) return
    const list = await window.api.chats.list(characterId)
    if (charactersStore.activeId === characterId) chats.value = list
  }

  // --- Generating replies ------------------------------------------------------

  async function send(text: string): Promise<void> {
    const content = text.trim()
    const chat = activeChat.value
    if (!content || !chat || isBusy.value) return

    // Shown at once under the persona's name; the main process saves it the same way.
    const userMessage = { ...createMessage('user', content), author: useSettingsStore().persona.name }
    messages.value.push(userMessage)
    await takeTurns(chat.id, whoAnswers(chat), { userMessage: { id: userMessage.id, content } })
  }

  /**
   * "More…": the chat goes on without the user. Whoever would have answered a message
   * of theirs speaks now: the character again, or each character in turn.
   */
  async function goOn(): Promise<void> {
    const chat = activeChat.value
    if (chat && !isBusy.value) await takeTurns(chat.id, whoAnswers(chat), {})
  }

  /**
   * Has the next reply follow a stage direction: something happens, the scene moves,
   * time passes. `text`: what the user wrote in the message box, sent first when there is some.
   * When several characters answer, the first one follows the direction and the others react.
   */
  async function direct(direction: SceneDirection, text = ''): Promise<void> {
    const chat = activeChat.value
    if (!chat || isBusy.value) return

    const content = text.trim()
    if (!content) return takeTurns(chat.id, whoAnswers(chat), { direction })

    const userMessage = { ...createMessage('user', content), author: useSettingsStore().persona.name }
    messages.value.push(userMessage)
    await takeTurns(chat.id, whoAnswers(chat), { direction, userMessage: { id: userMessage.id, content } })
  }

  /** Makes one character of the chat speak now, whoever spoke last. */
  async function speak(characterId: string): Promise<void> {
    const chat = activeChat.value
    if (chat && !isBusy.value) await takeTurns(chat.id, [characterId], {})
  }

  /** Writes another version of the last reply, by the same character. The earlier versions are kept (swipes). */
  async function regenerate(): Promise<void> {
    const chatId = activeChatId.value
    if (canRegenerate.value && chatId) await generate(chatId, { newSwipe: true })
  }

  /**
   * Writes the last reply again the way the user asks (shorter, longer, more feeling…):
   * the model starts from the version on screen. It becomes a new version (swipe), so the
   * one it came from stays a click away.
   */
  async function rewrite(how: Rewrite): Promise<void> {
    const chatId = activeChatId.value
    if (canRegenerate.value && chatId) await generate(chatId, { newSwipe: true, rewrite: toPlain(how) })
  }

  /** Has the model write the rest of the last reply, which was cut short, in the same message. */
  async function continueReply(): Promise<void> {
    const chatId = activeChatId.value
    if (canContinue.value && chatId) await generate(chatId, { continueReply: true })
  }

  /** Generates what is missing after the user's last message. */
  async function retry(): Promise<void> {
    const chat = activeChat.value
    if (canRetry.value && chat) await takeTurns(chat.id, whoAnswers(chat), {})
  }

  let stopRequested = false

  function stop(): void {
    stopRequested = true // Also ends a round of replies between two characters.
    if (streaming.value) window.api.chat.cancel(streaming.value.requestId)
  }

  /**
   * Has each of `speakers` reply, one after the other. `first` goes with the first
   * request only (the user's new message, a stage direction). The round ends early if a
   * reply fails or is stopped.
   */
  async function takeTurns(
    chatId: string,
    speakers: string[],
    first: Pick<GenerateRequest, 'userMessage' | 'direction'>,
  ): Promise<void> {
    turnRunning.value = true
    stopRequested = false
    try {
      for (const [index, speakerId] of speakers.entries()) {
        const status = await generate(chatId, { speakerId, ...(index === 0 ? first : {}) })
        if (status !== 'done' || stopRequested) break
      }
    } finally {
      turnRunning.value = false
    }
  }

  async function generate(
    chatId: string,
    options: Pick<GenerateRequest, 'userMessage' | 'newSwipe' | 'continueReply' | 'speakerId' | 'direction' | 'rewrite'>,
  ): Promise<ChatOutcome['status']> {
    const characterId = charactersStore.activeId
    const requestId = crypto.randomUUID()
    const replyId = crypto.randomUUID()
    // A new version is written in the place of the last reply, by the character who
    // wrote it, and so is the rest of a reply that was cut short; a new reply gets a new place.
    const redone = options.newSwipe || options.continueReply ? messages.value.at(-1)! : null
    const messageId = redone?.id ?? replyId
    const speakerId = redone?.characterId ?? options.speakerId ?? characterId ?? ''
    // The rest of a reply is written after what is already there.
    const written = options.continueReply ? redone!.content : ''

    error.value = null
    lookingAt.value = null // The panel goes back to following whoever speaks.
    // Another version of a reply follows the direction the reply was written under.
    const direction = options.newSwipe ? redone?.direction : options.direction
    streaming.value = { requestId, messageId, chatId, characterId: speakerId, text: written, thinking: false, remembering: false, direction, rewrite: options.rewrite?.kind }

    const outcome = await window.api.chat.start({ requestId, chatId, replyId, ...options })
    streaming.value = null

    // The main process has saved the reply. Show it too, if that chat is still on screen.
    if (outcome.message && activeChatId.value === chatId) replace(outcome.message)
    // Read aloud, when the user asked for replies to be. Not the rest of a reply that was
    // cut short: its beginning was already heard.
    if (outcome.status === 'done' && outcome.message && activeChatId.value === chatId && !options.continueReply) {
      useVoiceStore().replyWritten(outcome.message)
    }

    if (characterId) charactersStore.markActive(characterId)
    await refreshChatList()
    void useConnectionStore().refreshContext()

    if (outcome.status === 'error') {
      error.value = { chatId, message: outcome.error ?? 'Something went wrong.' }
      // Refresh the status dot in the sidebar: the server may have gone away.
      void useConnectionStore().check()
    }
    return outcome.status
  }

  return {
    chats,
    activeChatId,
    messages,
    isBusy,
    draft,
    streamingReply,
    activeError,
    canRegenerate,
    rewrite,
    canContinue,
    canRetry,
    canStartNew,
    members,
    isScene,
    onStage,
    nextOnStage,
    showNext,
    turnMode,
    memory,
    saveMemory,
    story,
    saveStory,
    place,
    savePlace,
    outfits,
    saveOutfit,
    noticed,
    dismissNoticed,
    addMember,
    removeMember,
    setQuiet,
    setTurnMode,
    openChat,
    reload,
    startNew,
    deleteChat,
    editMessage,
    deleteMessage,
    selectSwipe,
    send,
    goOn,
    direct,
    speak,
    regenerate,
    continueReply,
    retry,
    stop,
  }
})

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: Date.now() }
}
