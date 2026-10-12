<script setup lang="ts">
import { Camera, Plus, X } from '@lucide/vue'
import { isGreeting, OTHER_GREETINGS, type CardSection, type WrittenCard } from '@core/cards/writeCard'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character, CharacterDraft, LorebookEntry, ReviewedCard } from '@shared/types'

// The window where a character is written or changed, opened with useCharacterEditor().
// Four tabs: who the character is, how chats open, instructions for the model, and its lorebook.
// It works on a copy: the card file is only written when Save is pressed.
// For a new character, the model can write the fields from an idea (<CharacterAssistant />).
// For one that exists, the editor says what would make it better (<CardAdvice />).

const router = useRouter()
const charactersStore = useCharactersStore()
const settingsStore = useSettingsStore()
const { editing, close } = useCharacterEditor()
const { confirm } = useConfirm()

const dialog = ref<HTMLDialogElement | null>(null)

type Tab = 'description' | 'greetings' | 'prompt' | 'lorebook'
const tab = ref<Tab>('description')
const tabs = computed<{ value: Tab; label: string }[]>(() => [
  { value: 'description', label: 'Description' },
  { value: 'greetings', label: 'Greetings' },
  { value: 'prompt', label: 'System prompt' },
  { value: 'lorebook', label: lore.value.length ? `Lorebook · ${lore.value.length}` : 'Lorebook' },
])

/** The character being changed, or null for a new one. */
const original = ref<Character | null>(null)
const draft = ref<CharacterDraft>(toPlain(EMPTY_CHARACTER))
/** Tags are typed as one line, separated by commas. */
const tagsText = ref('')
/** The lorebook entries. They are only written to the card if they were changed here. */
const lore = ref<LorebookEntry[]>([])
let untouchedLore = ''
/** A picture picked in this window, not saved yet. */
const picture = ref<{ bytes: Uint8Array; url: string } | null>(null)
const saving = ref(false)
const problem = ref('')

let untouched = ''
const snapshot = (): string => JSON.stringify([draft.value, tagsText.value, lore.value])
const isDirty = (): boolean => picture.value !== null || snapshot() !== untouched

// flush: 'post' = run once the form is rendered, so the dialog can focus its first field.
watch(
  editing,
  (request) => {
    if (!request) {
      dialog.value?.close()
      return
    }

    original.value = request.character
    draft.value = toPlain(pickDraft(request.character ?? EMPTY_CHARACTER))
    tagsText.value = draft.value.tags.join(', ')
    lore.value = toPlain(request.character?.lorebook?.entries ?? [])
    untouchedLore = JSON.stringify(lore.value)
    tab.value = 'description'
    problem.value = ''
    releasePicture()
    untouched = snapshot()
    assistBusy.value = false
    beforeFix = null
    emptyText = writtenFields()
    lastWritten = ''
    writingSection = null
    dialog.value?.showModal()
  },
  { flush: 'post' },
)

/** Only the fields the editor shows. The rest of a Character (id, lorebook…) is not its to send back. */
function pickDraft(source: CharacterDraft): CharacterDraft {
  const fields = Object.keys(EMPTY_CHARACTER) as (keyof CharacterDraft)[]
  return Object.fromEntries(fields.map((key) => [key, source[key]])) as unknown as CharacterDraft
}

const pictureUrl = computed(() => picture.value?.url ?? original.value?.portraitUrl)

// --- Written by the model, from an idea -------------------------------------------

const assistant = ref<{ stop(): void } | null>(null)
/** The model is writing: the fields fill in by themselves and are not to be typed in. */
const assistBusy = ref(false)

/** The fields the model writes. The picture and the system prompt are not among them. */
const writtenFields = (): string =>
  JSON.stringify([
    draft.value.name,
    draft.value.tagline,
    draft.value.description,
    draft.value.personality,
    draft.value.scenario,
    draft.value.exampleMessages,
    draft.value.firstMessage,
    draft.value.alternateGreetings,
    tagsText.value,
    lore.value,
  ])
let emptyText = ''
/** Those fields as the model last left them: writing again over them loses nothing of the user's. */
let lastWritten = ''

async function mayReplace(): Promise<boolean> {
  const now = writtenFields()
  if (now === emptyText || now === lastWritten) return true
  return confirm({
    title: 'Write over what is there?',
    message:
      'The name, the description, the greetings, the tags and the lorebook are written again from your idea. The picture and the system prompt are kept.',
    confirmLabel: 'Write again',
  })
}

let writingSection: CardSection | null = null

/** Shows what the model has written so far, and follows the field it is writing in. */
function onWritten(card: WrittenCard, finished: boolean): void {
  draft.value.name = card.name ?? ''
  draft.value.tagline = card.tagline ?? ''
  draft.value.description = card.description ?? ''
  draft.value.personality = card.personality ?? ''
  draft.value.scenario = card.scenario ?? ''
  draft.value.exampleMessages = card.exampleMessages ?? ''
  draft.value.firstMessage = card.firstMessage ?? ''
  draft.value.alternateGreetings = [...(card.otherGreetings ?? [])]
  lore.value = (card.lore ?? []).map((note) => ({ ...newLoreEntry(), keys: [...note.keys], content: note.content }))
  tagsText.value = (card.tags ?? []).join(', ')
  problem.value = ''

  if (finished) {
    // Back to the top, to read it through from the name down.
    lastWritten = writtenFields()
    writingSection = null
    tab.value = 'description'
    void nextTick(() => {
      markWriting(null)
      dialog.value?.querySelector('.fields')?.scrollTo({ top: 0 })
    })
    return
  }

  if (card.last !== writingSection) {
    writingSection = card.last
    tab.value = isGreeting(card.last) ? 'greetings' : card.last === 'LORE' ? 'lorebook' : 'description'
  }
  void nextTick(() => {
    const field = dialog.value?.querySelector<HTMLElement>(`[data-section="${writingSection}"]`)
    markWriting(field ?? null)
    field?.scrollIntoView({ block: 'nearest' })
    if (field instanceof HTMLTextAreaElement) field.scrollTop = field.scrollHeight
  })
}

// Whatever way the writing ends, no field stays lit.
watch(assistBusy, (busy) => {
  if (!busy) void nextTick(() => markWriting(null))
})

/**
 * Lights up the field the model is writing in, and no other. A plain attribute, set by
 * hand: the fields come and go with the tabs, and Vue leaves alone what it did not put there.
 */
function markWriting(field: HTMLElement | null): void {
  for (const lit of dialog.value?.querySelectorAll('[data-writing]') ?? []) if (lit !== field) lit.removeAttribute('data-writing')
  field?.setAttribute('data-writing', '')
}

// --- Advice on a character that exists, and its fixes --------------------------------

/** The card as it is in the editor, for the advice to look at. */
const reviewed = computed<ReviewedCard>(() => {
  const notes = lore.value.filter((entry) => entry.enabled && entry.content.trim())
  return {
    name: draft.value.name,
    tagline: draft.value.tagline,
    description: draft.value.description,
    personality: draft.value.personality,
    scenario: draft.value.scenario,
    exampleMessages: draft.value.exampleMessages,
    firstMessage: draft.value.firstMessage,
    alternateGreetings: draft.value.alternateGreetings,
    loreCount: notes.length,
    loreKeys: notes.flatMap((entry) => entry.keys),
  }
})

/** What the fields held before the last fix, to put back if the user does not like it. */
let beforeFix: { draft: CharacterDraft; lore: LorebookEntry[] } | null = null

/** Shows what the model has written so far for a fix, in the field it belongs to. */
function onImproved(card: WrittenCard, finished: boolean, sections: CardSection[]): void {
  if (card.last === null && !finished) {
    beforeFix = { draft: toPlain(draft.value), lore: toPlain(lore.value) } // A fix begins.
    problem.value = ''
    return
  }
  const before = beforeFix
  if (!before) return

  for (const section of sections) {
    if (section === 'DESCRIPTION' && card.description) draft.value.description = card.description
    if (section === 'EXAMPLE DIALOGUE' && card.exampleMessages) draft.value.exampleMessages = card.exampleMessages
    if (section === 'FIRST MESSAGE' && card.firstMessage) draft.value.firstMessage = card.firstMessage
    if (section === 'SECOND GREETING' && card.otherGreetings?.[0]) {
      // Added after the greetings that were there; an empty box left by the user is not kept.
      draft.value.alternateGreetings = [...before.draft.alternateGreetings.filter((text) => text.trim()), card.otherGreetings[0]]
    }
    if (section === 'LORE' && card.lore?.length) {
      lore.value = [...toPlain(before.lore), ...card.lore.map((note) => ({ ...newLoreEntry(), keys: [...note.keys], content: note.content }))]
    }
  }

  // Follow the writing: its tab, and its field brought into view.
  const section = sections[0]
  tab.value = section === 'LORE' ? 'lorebook' : section === 'FIRST MESSAGE' || section === 'SECOND GREETING' ? 'greetings' : 'description'
  void nextTick(() => {
    const field =
      section === 'SECOND GREETING'
        ? [...(dialog.value?.querySelectorAll<HTMLElement>('.greeting textarea') ?? [])].at(-1)
        : dialog.value?.querySelector<HTMLElement>(`[data-section="${section}"]`)
    field?.scrollIntoView({ block: 'nearest' })
    if (field instanceof HTMLTextAreaElement && !finished) field.scrollTop = field.scrollHeight
  })
}

function undoFix(): void {
  if (!beforeFix) return
  draft.value = beforeFix.draft
  lore.value = beforeFix.lore
  beforeFix = null
}

// --- Picture ---------------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)

async function onPicturePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // So picking the same file again is noticed.
  if (!file) return

  try {
    const picked = await pictureToPng(file)
    releasePicture()
    picture.value = picked
    problem.value = ''
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
  }
}

function releasePicture(): void {
  if (picture.value) URL.revokeObjectURL(picture.value.url)
  picture.value = null
}

// --- Greetings -------------------------------------------------------------------

async function addGreeting(): Promise<void> {
  draft.value.alternateGreetings.push('')
  await nextTick()
  const boxes = dialog.value?.querySelectorAll<HTMLTextAreaElement>('.greeting textarea')
  boxes?.[boxes.length - 1]?.focus()
}

// --- Save and close --------------------------------------------------------------

async function save(): Promise<void> {
  if (saving.value || assistBusy.value) return
  if (!draft.value.name.trim()) {
    tab.value = 'description'
    problem.value = 'Give the character a name.'
    return
  }

  saving.value = true
  problem.value = ''
  const tags = tagsText.value.split(',').map((tag) => tag.trim())
  const toSave: CharacterDraft = { ...draft.value, tags: tags.filter(Boolean) }
  // An untouched lorebook is not sent at all, so the card's own stays exactly as it is.
  if (JSON.stringify(lore.value) !== untouchedLore) {
    toSave.lorebookEntries = lore.value.filter((entry) => entry.content.trim() || entry.keys.length || entry.source !== null)
  }

  try {
    if (original.value) {
      await charactersStore.update(original.value.id, toSave, picture.value?.bytes)
    } else {
      // A new character opens straight into its first chat.
      const created = await charactersStore.create(toSave, picture.value?.bytes)
      charactersStore.select(created.id)
      void router.push('/')
    }
    finish()
  } catch (error) {
    problem.value = `The character could not be saved. ${describeError(error)}`
  } finally {
    saving.value = false
  }
}

/** Errors from the main process arrive wrapped: "Error invoking remote method '…': Error: <the message>". */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

async function cancel(): Promise<void> {
  if (saving.value) return
  assistant.value?.stop() // Closing the window also ends what the model is writing.
  if (isDirty()) {
    const discard = await confirm({
      title: 'Discard your changes?',
      message: original.value
        ? `What you changed about ${original.value.name} has not been saved.`
        : 'This character has not been saved.',
      confirmLabel: 'Discard changes',
    })
    if (!discard) return
  }
  finish()
}

function finish(): void {
  releasePicture()
  close()
}
</script>

<template>
  <!-- @cancel is the Escape key: it goes through the same question as the Cancel button -->
  <dialog ref="dialog" class="editor" aria-labelledby="editor-title" @cancel.prevent="cancel">
    <!-- No submit button on purpose: pressing Enter in a field must not save and close the window -->
    <form v-if="editing" class="box" novalidate @submit.prevent>
      <h2 id="editor-title" class="sr-only">{{ original ? `Edit ${original.name}` : 'New character' }}</h2>

      <!-- `editing`, not `original`: that one is only set once the window opens, a moment too late
           for the focus, which goes to the first field on screen at that instant. -->
      <CharacterAssistant
        v-if="!editing.character"
        ref="assistant"
        v-model:busy="assistBusy"
        :may-replace="mayReplace"
        @written="onWritten"
      />
      <CardAdvice v-else ref="assistant" v-model:busy="assistBusy" :card="reviewed" @written="onImproved" @undo="undoFix" />

      <header class="head">
        <button
          type="button"
          class="picture"
          aria-label="Choose a picture"
          title="Choose a picture"
          @click="fileInput?.click()"
        >
          <img v-if="pictureUrl" :src="pictureUrl" alt="" draggable="false" />
          <CharacterAvatar v-else :name="draft.name || '?'" :size="84" />
          <span class="picture-badge"><Camera :size="13" :stroke-width="2" /></span>
        </button>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          tabindex="-1"
          aria-hidden="true"
          @change="onPicturePicked"
        />

        <div class="identity" :inert="assistBusy">
          <input
            v-model="draft.name"
            data-section="NAME"
            class="field name"
            type="text"
            maxlength="80"
            placeholder="Character name"
            aria-label="Character name"
            autofocus
          />
          <input
            v-model="draft.tagline"
            data-section="TAGLINE"
            class="field"
            type="text"
            maxlength="90"
            placeholder="One line shown under the name · optional"
            aria-label="Tagline"
          />
        </div>

        <button type="button" class="close" aria-label="Close" title="Close" @click="cancel">
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <SegmentedControl v-model="tab" :options="tabs" label="Sections" />

      <div class="fields" :inert="assistBusy">
        <template v-if="tab === 'description'">
          <label>
            <span class="label">Description</span>
            <span class="hint">Who the character is: looks, past, way of speaking. The model reads this first.</span>
            <textarea v-model="draft.description" class="field" rows="7" data-section="DESCRIPTION" />
          </label>
          <label>
            <span class="label">Personality <span class="optional">· optional</span></span>
            <input
              v-model="draft.personality"
              data-section="PERSONALITY"
              class="field"
              type="text"
              placeholder="A few words: guarded, dry humor, loyal"
            />
          </label>
          <label>
            <span class="label">Scenario <span class="optional">· optional</span></span>
            <span class="hint">Where and when the chat takes place.</span>
            <textarea v-model="draft.scenario" class="field" rows="2" data-section="SCENARIO" />
          </label>
          <label>
            <span class="label">Example dialogue <span class="optional">· optional</span></span>
            <!-- v-pre: show the braces as they are, do not treat them as Vue expressions -->
            <span v-pre class="hint">
              A few lines showing how the character talks. Start each example with &lt;START&gt;, and write lines
              as {{user}}: … and {{char}}: …
            </span>
            <textarea
              v-model="draft.exampleMessages"
              class="field"
              rows="4"
              spellcheck="false"
              data-section="EXAMPLE DIALOGUE"
            />
          </label>
          <label>
            <span class="label">Tags <span class="optional">· optional</span></span>
            <input
              v-model="tagsText"
              class="field"
              type="text"
              placeholder="Mystery, Slow burn, Coastal"
              data-section="TAGS"
            />
          </label>
        </template>

        <template v-else-if="tab === 'greetings'">
          <label>
            <span class="label">First message</span>
            <span class="hint">What the character says to open every new chat. It sets the tone and the length of the replies.</span>
            <textarea v-model="draft.firstMessage" class="field prose" rows="6" data-section="FIRST MESSAGE" />
          </label>

          <div v-for="(_, index) in draft.alternateGreetings" :key="index" class="greeting">
            <label>
              <span class="label">Other greeting {{ index + 1 }}</span>
              <textarea
                v-model="draft.alternateGreetings[index]"
                class="field prose"
                rows="4"
                :data-section="OTHER_GREETINGS[index]"
              />
            </label>
            <button
              type="button"
              class="remove"
              :aria-label="`Remove greeting ${index + 1}`"
              title="Remove this greeting"
              @click="draft.alternateGreetings.splice(index, 1)"
            >
              <X :size="14" :stroke-width="2" />
            </button>
          </div>

          <div class="add-row">
            <button type="button" class="btn btn-small" @click="addGreeting">
              <Plus :size="14" :stroke-width="2" />Add another greeting
            </button>
            <span class="hint">In a new chat, the arrows under the first message switch between greetings.</span>
          </div>
        </template>

        <LorebookEditor v-else-if="tab === 'lorebook'" v-model="lore" data-section="LORE" />

        <template v-else>
          <label>
            <span class="label">Instructions for the model <span class="optional">· optional</span></span>
            <span v-pre class="hint">
              Used for this character in place of the app's system prompt. Write {{original}} where the app's own
              prompt should be kept. Leave empty to use the app's.
            </span>
            <textarea v-model="draft.systemPrompt" class="field mono" rows="6" spellcheck="false" />
          </label>
          <label>
            <span class="label">Reminder after the conversation <span class="optional">· optional</span></span>
            <span class="hint">Repeated at the end of every request, where the model reads it last. Keep it short.</span>
            <textarea v-model="draft.postHistoryInstructions" class="field mono" rows="3" spellcheck="false" />
          </label>
          <p v-if="!settingsStore.generation.useCardPrompts" class="note">
            These are not used right now: “Follow the instructions written into character cards” is turned off in
            Settings › Generation.
          </p>
        </template>
      </div>

      <footer class="foot">
        <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
        <span v-else v-pre class="hint macros">{{char}} and {{user}} are replaced by the two names.</span>
        <button type="button" class="btn" :disabled="saving" @click="cancel">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving || assistBusy" @click="save">
          {{ original ? 'Save' : 'Create character' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.editor {
  width: 720px;
  max-width: calc(100vw - 48px);
  height: 720px;
  max-height: calc(100vh - 48px);
  padding: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  color: var(--text);
  overflow: hidden;
}
.editor::backdrop {
  background: rgb(11 7 4 / 0.6);
}

.box {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.picture {
  position: relative;
  flex-shrink: 0;
  width: 84px;
  height: 84px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 24px;
}
.picture img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  /* Card pictures are tall portraits: keep the top, where the face usually is. */
  object-fit: cover;
  object-position: top center;
}
.picture-badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  border: 2px solid var(--bg-panel);
  border-radius: 50%;
  color: #fff;
}
.picture:hover .picture-badge {
  background: var(--accent-hover);
}

.identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}
.name {
  height: 38px;
  font-size: 17px;
  font-weight: 700;
}

.close {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  color: var(--text-muted);
}
.close:hover {
  background: var(--bg-button);
  color: var(--text);
}

/* The fields scroll; the header, the tabs and the buttons stay in place. */
.fields {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-right: -10px;
  padding-right: 10px;
  overflow-y: auto;
}
.fields > * {
  flex-shrink: 0;
}
/* The field the model is writing in: one can see where the words are landing. */
[data-writing] {
  border-color: var(--accent-strong);
  border-radius: var(--radius);
  animation: writing-here 1.5s ease-in-out infinite;
}
@keyframes writing-here {
  0%,
  100% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-strong) 18%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-strong) 34%, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-writing] {
    animation: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-strong) 26%, transparent);
  }
}

label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.label {
  font-size: 12.5px;
  font-weight: 600;
}
.optional {
  font-weight: 400;
  color: var(--text-faint);
}
.hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-faint);
}
textarea.field {
  background: var(--bg-sunken);
}
.prose {
  font-family: var(--font-prose);
  font-size: 14px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.greeting {
  position: relative;
}
.remove {
  position: absolute;
  top: -4px;
  right: 0;
  width: 24px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.remove:hover {
  background: var(--bg-button);
  color: var(--danger-text);
}
.add-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.note svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.foot {
  display: flex;
  align-items: center;
  gap: 10px;
}
.macros,
.problem {
  flex: 1;
}
.problem {
  font-size: 12.5px;
  color: var(--danger-text);
}
</style>
