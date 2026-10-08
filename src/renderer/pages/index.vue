<script setup lang="ts">
import { Plus, Sparkles, Trash2, UserPlus, X } from '@lucide/vue'
import { applyMacros } from '@core/prompt/macros'
import { MAX_CHAT_MEMBERS, type Character, type ChatMessage as Message, type ChatSummary } from '@shared/types'

// The chat screen: character list, conversation, character details.

const charactersStore = useCharactersStore()
const chatStore = useChatStore()
const voiceStore = useVoiceStore()
const settingsStore = useSettingsStore()
const { confirm } = useConfirm()
const contextUsage = useContextUsage()
const characterEditor = useCharacterEditor()

// The first time the chat screen is seen, a short tour shows what is where. It waits
// for the screen to settle: the first message slides in, the colours fade.
const tour = useTour()
const router = useRouter()
onMounted(() => {
  if (settingsStore.settings.tourDone || !charactersStore.active) return
  setTimeout(() => {
    if (!settingsStore.settings.tourDone && router.currentRoute.value.path === '/') tour.start()
  }, 700)
})

/** Null when the library is empty: the screen then invites to import a card. */
const character = computed(() => charactersStore.active)

const scenario = computed(() =>
  character.value
    ? applyMacros(character.value.scenario, { char: character.value.name, user: settingsStore.persona.name })
    : '',
)

interface Row extends Message {
  streaming: boolean
  thinking: boolean
  remembering: boolean
}

// Saved messages, plus the reply being written. That reply takes the place of the
// message with the same id (a new version of the last reply), or comes last (a new
// reply). Either way the id does not change once it is saved, so Vue updates the
// row in place without re-animating it.
const rows = computed<Row[]>(() => {
  const reply = chatStore.streamingReply
  const list: Row[] = chatStore.messages
    .filter((message) => message.id !== reply?.id)
    .map((message) => ({ ...message, streaming: false, thinking: false, remembering: false }))

  if (reply) {
    list.push({
      id: reply.id,
      role: 'assistant',
      characterId: reply.characterId,
      content: reply.text,
      createdAt: 0,
      streaming: true,
      thinking: reply.thinking,
      remembering: reply.remembering,
      direction: reply.direction,
    })
  }
  return list
})

// --- Several characters in one chat ----------------------------------------------

/** The character who wrote a reply. A reply without one on record was written by the chat's own. */
function speakerOf(row: Row): Character | null {
  if (row.role === 'user') return null
  const id = row.characterId ?? character.value?.id
  return charactersStore.characters.find((item) => item.id === id) ?? null
}

/** The name on a message: who wrote it now, or the name it was written under if they are gone. */
function authorOf(row: Row): string {
  if (row.role === 'user') return row.author ?? settingsStore.persona.name
  return speakerOf(row)?.name ?? row.author ?? character.value?.name ?? ''
}

/** The characters that can still be added to this chat. */
const addable = computed(() => {
  const present = new Set(chatStore.members.map((member) => member.character.id))
  return charactersStore.ordered.filter((item) => !present.has(item.id))
})
const sceneIsFull = computed(() => chatStore.members.length >= MAX_CHAT_MEMBERS)

function addCharacter(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (select.value) void chatStore.addMember(select.value)
  select.value = '' // Back to the placeholder, so the same menu can be used again.
}

/** "with Professor Quill and Mara": who else is in the chat, under the title. */
const sceneCaption = computed(() => {
  const names = chatStore.members.slice(1).map((member) => member.character.name)
  if (names.length === 0) return ''
  return `with ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`}`
})

/** The character's opening message, when the chat has one. It comes from the card, not from the model. */
const greetingId = computed(() => {
  const first = chatStore.messages[0]
  return first?.role === 'assistant' ? first.id : null
})
/** The last message, when it is a reply and not the greeting: the model can write other versions of it. */
const lastReplyId = computed(() => {
  const last = chatStore.messages.at(-1)
  return last?.role === 'assistant' && last.id !== greetingId.value ? last.id : null
})

/**
 * Versions can be browsed on the last reply, and on the greeting while nothing
 * else has been said: that is how one of the card's other greetings is picked.
 */
function canSwipe(row: Row): boolean {
  if (row.id === lastReplyId.value) return true
  return row.id === greetingId.value && chatStore.messages.length === 1 && (row.swipes?.count ?? 1) > 1
}

function caption(row: Row): string | undefined {
  return row.meta ? `${row.meta.model} · ${formatDuration(row.meta.durationMs)}` : undefined
}

/** "Oct 5, 14:32 · 12 messages": how a chat is named in the chat picker. */
function chatLabel(chat: ChatSummary): string {
  const count = chat.messageCount <= 1 ? 'new' : `${chat.messageCount} messages`
  return `${formatDateTime(chat.updatedAt)} · ${count}`
}

function pickChat(event: Event): void {
  void chatStore.openChat((event.target as HTMLSelectElement).value)
}

async function deleteChat(): Promise<void> {
  const confirmed = await confirm({
    title: 'Delete this chat?',
    message: `Its ${chatStore.messages.length} messages will be gone for good. Your other chats with ${character.value?.name} are kept.`,
    confirmLabel: 'Delete chat',
  })
  if (confirmed) await chatStore.deleteChat()
}

// Deleting a message also deletes what came after it: the chat goes back to that point.
async function deleteMessage(row: Row): Promise<void> {
  const after = chatStore.messages.length - 1 - chatStore.messages.findIndex((message) => message.id === row.id)
  const versions = row.swipes ? ` All ${row.swipes.count} versions of this reply go with it.` : ''

  const confirmed = await confirm(
    after === 0
      ? { title: 'Delete this message?', message: `It will be gone for good.${versions}`, confirmLabel: 'Delete message' }
      : {
          title: `Delete this message and the ${after === 1 ? 'one' : after} after it?`,
          message: `The chat goes back to just before this message. These ${after + 1} messages will be gone for good.`,
          confirmLabel: `Delete ${after + 1} messages`,
        },
  )
  if (confirmed) await chatStore.deleteMessage(row.id)
}

const scroller = ref<HTMLElement | null>(null)
// The announcement of new tags takes room above the message box: it counts as a change too.
useStickToBottom(scroller, () => [rows.value.length, chatStore.streamingReply?.text, chatStore.activeChatId, chatStore.noticed])
</script>

<template>
  <div class="screen">
    <AppSidebar />

    <main v-if="character" class="chat" :class="{ 'with-backdrop': settingsStore.appearance.background !== 'none' }">
      <ChatBackdrop :character="character" />
      <header class="header drag">
        <div class="heading">
          <span class="name">{{ character.name }}</span>
          <span class="tagline">{{ sceneCaption || character.tagline }}</span>
        </div>

        <!-- Earlier chats with this character. Shown once there is more than one. -->
        <select
          v-if="chatStore.chats.length > 1"
          class="field chat-picker"
          aria-label="Chats with this character"
          :value="chatStore.activeChatId"
          :disabled="chatStore.isBusy"
          @change="pickChat"
        >
          <option v-for="chat in chatStore.chats" :key="chat.id" :value="chat.id">{{ chatLabel(chat) }}</option>
        </select>

        <!-- The button is a menu: the system's own list of characters opens over it -->
        <label
          class="btn btn-small add-character"
          :class="{ disabled: chatStore.isBusy || sceneIsFull || addable.length === 0 }"
          :title="
            sceneIsFull
              ? `A chat can hold ${MAX_CHAT_MEMBERS} characters at most`
              : addable.length === 0
                ? 'There is no other character to add'
                : 'Bring another character into this chat'
          "
        >
          <UserPlus :size="14" :stroke-width="2" />Add a character
          <select
            aria-label="Add a character to this chat"
            :disabled="chatStore.isBusy || sceneIsFull || addable.length === 0"
            @change="addCharacter"
          >
            <option value="" disabled selected>Add to this chat…</option>
            <option v-for="item in addable" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>

        <button
          type="button"
          class="btn btn-small"
          :disabled="!chatStore.canStartNew"
          @click="chatStore.startNew()"
        >
          <Plus :size="14" :stroke-width="2" />New chat
        </button>
        <button
          type="button"
          class="btn btn-small icon-button"
          aria-label="Delete this chat"
          title="Delete this chat"
          :disabled="chatStore.isBusy"
          @click="deleteChat"
        >
          <Trash2 :size="14" :stroke-width="2" />
        </button>
      </header>

      <SceneBar v-if="chatStore.isScene" />

      <section ref="scroller" class="messages">
        <!-- :key resets the list (and its entrance animations) when the chat changes -->
        <div :key="chatStore.activeChatId ?? character.id" class="column">
          <p v-if="scenario" class="scenario"><span>Scenario · {{ scenario }}</span></p>

          <ChatMessage
            v-for="row in rows"
            :key="row.id"
            :role="row.role"
            :author="authorOf(row)"
            :portrait="speakerOf(row)?.portraitUrl"
            :content="row.content"
            :streaming="row.streaming"
            :thinking="row.thinking"
            :remembering="row.remembering"
            :direction="row.direction"
            :caption="caption(row)"
            :swipes="row.swipes"
            :can-swipe="canSwipe(row)"
            :can-regenerate="row.id === lastReplyId"
            :can-continue="chatStore.canContinue && row.id === chatStore.messages.at(-1)?.id"
            :can-delete="row.id !== greetingId"
            :busy="chatStore.isBusy"
            :voice="voiceStore.enabled && row.role === 'assistant' && !row.streaming ? voiceStore.stateOf(voiceStore.messageKey(row.id)) : undefined"
            :voice-problem="voiceStore.problem?.key === voiceStore.messageKey(row.id) ? voiceStore.problem.message : undefined"
            @speak="voiceStore.toggleMessage(row.id, row.content, speakerOf(row) ?? character)"
            @regenerate="chatStore.regenerate()"
            @continue="chatStore.continueReply()"
            @swipe="(index) => chatStore.selectSwipe(row.id, index)"
            @edit="(content) => chatStore.editMessage(row.id, content)"
            @delete="deleteMessage(row)"
          />

          <!-- A card without an opening message: the user speaks first -->
          <p v-if="rows.length === 0" class="no-greeting">
            {{ character.name }} has no opening message. Write the first one.
          </p>

          <p v-if="chatStore.activeError" class="notice error" role="alert">
            <span>{{ chatStore.activeError }}</span>
            <span class="notice-actions">
              <button v-if="chatStore.canRetry" type="button" class="btn btn-small" @click="chatStore.retry()">
                Try again
              </button>
              <RouterLink to="/settings/generation">Generation settings</RouterLink>
              <RouterLink to="/settings/connection">Connection settings</RouterLink>
            </span>
          </p>
          <!-- The last message is the user's and nothing is being written: a reply is missing
               (the reply was deleted, or the app was closed while it was being written). -->
          <p v-else-if="chatStore.canRetry" class="notice">
            <span>
              {{ chatStore.isScene ? 'No one has replied to this message yet.' : `${character.name} has not replied to this message.` }}
            </span>
            <span class="notice-actions">
              <button type="button" class="btn btn-small" @click="chatStore.retry()">Generate a reply</button>
            </span>
          </p>
        </div>
      </section>

      <!-- "Learn my tastes" just added tags: said out loud, so nothing is learned behind the user's back -->
      <p v-if="chatStore.noticed" class="noticed" role="status">
        <Sparkles :size="13" :stroke-width="2" />
        <span class="noticed-text">
          Noted about how you play:
          <span v-for="tag in chatStore.noticed.likes" :key="`+${tag}`" class="noticed-tag">enjoys {{ tag }}</span>
          <span v-for="tag in chatStore.noticed.dislikes" :key="`-${tag}`" class="noticed-tag">does not enjoy {{ tag }}</span>
        </span>
        <RouterLink to="/settings/adapt" @click="chatStore.dismissNoticed()">Review</RouterLink>
        <button type="button" aria-label="Dismiss" title="Dismiss" @click="chatStore.dismissNoticed()">
          <X :size="12" :stroke-width="2.2" />
        </button>
      </p>

      <ChatComposer
        :key="chatStore.activeChatId ?? character.id"
        v-model:draft="chatStore.draft"
        :persona-name="settingsStore.persona.name"
        :busy="chatStore.isBusy"
        :context="contextUsage"
        :more-hint="
          chatStore.isScene ? 'The scene goes on without waiting for you' : `${character.name} carries on without waiting for you`
        "
        @send="chatStore.send"
        @more="chatStore.goOn()"
        @direct="chatStore.direct"
        @stop="chatStore.stop"
      />
    </main>

    <main v-else class="chat empty">
      <div class="header drag" />
      <div class="empty-body">
        <h1 class="title-serif">No characters yet</h1>
        <p>Pick a ready-to-play story in the library, import a character card, or write your own character.</p>
        <div class="empty-actions">
          <RouterLink to="/library" class="btn">Open the library</RouterLink>
          <button type="button" class="btn btn-primary" @click="characterEditor.open(null)">
            <Plus :size="14" :stroke-width="2" />New character
          </button>
        </div>
      </div>
    </main>

    <CharacterPanel v-if="character" :character="chatStore.onStage ?? character" />
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  height: 100%;
}

.chat {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
/* Everything in the chat stands in front of its backdrop. */
.chat > :not(.backdrop) {
  position: relative;
  z-index: 1;
}
/* With a picture behind, what is read gets a panel of its own: the picture shows around
   the text, never through it. The components read these variables (ChatMessage,
   ChatComposer, SceneBar). */
.chat.with-backdrop {
  --message-bg: color-mix(in srgb, var(--bg-app) 76%, transparent);
  --message-user-bg: color-mix(in srgb, var(--bg-card) 88%, transparent);
  --bar-bg: color-mix(in srgb, var(--bg-app) 72%, transparent);
  --composer-bg: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg-app) 82%, transparent) 46%);
}
.chat.with-backdrop .header {
  background: var(--bar-bg);
}
.chat.with-backdrop .scenario span {
  background: var(--message-bg);
  color: var(--text-faint);
}

.header {
  height: var(--titlebar-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
}
.heading {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  margin-right: 4px;
}
.name {
  font-size: 14px;
  font-weight: 700;
}
.tagline {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-character {
  position: relative;
  -webkit-app-region: no-drag;
}
.add-character.disabled {
  opacity: 0.5;
}
/* The real menu, invisible, laid over the button. */
.add-character select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.add-character select:disabled {
  cursor: default;
}
/* The menu cannot be seen, so its focus ring is drawn around the button instead. */
.add-character:has(select:focus-visible) {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}

.chat-picker {
  width: auto;
  max-width: 230px;
  height: 30px;
  font-size: 12px;
  -webkit-app-region: no-drag;
}
.icon-button {
  width: 30px;
  padding: 0;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 14px 8px;
}
.column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 760px;
  margin: 0 auto;
}

.scenario {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}
.scenario span {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  color: var(--text-ghost);
  text-align: center;
}

.no-greeting {
  padding: 24px 14px;
  color: var(--text-faint);
  text-align: center;
}

.notice {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 4px 14px;
  padding: 12px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  line-height: 1.5;
}
.notice.error {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-text);
}
.notice-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
.notice a {
  font-weight: 600;
}

.noticed {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 28px;
  padding: 7px 8px 7px 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border-field);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--text-muted);
}
.noticed svg {
  flex-shrink: 0;
  color: var(--accent-soft);
}
.noticed-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.noticed-tag {
  padding: 1px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  color: var(--text-soft);
}
.noticed a {
  font-weight: 600;
}
.noticed button {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--text-faint);
}
.noticed button:hover {
  background: var(--bg-selected);
  color: var(--text);
}

.empty .header {
  border-bottom: none;
}
.empty-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding-bottom: 80px;
}
.empty-body h1 {
  font-size: 26px;
}
.empty-body p {
  margin-bottom: 8px;
  color: var(--text-muted);
}
.empty-actions {
  display: flex;
  gap: 10px;
}
</style>
