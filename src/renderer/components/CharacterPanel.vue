<script lang="ts">
// The mood read for the last reply of each character in each chat, and for the reply
// before it. Kept for as long as the app runs, whichever panel is on screen: a symbol
// only plays when the mood changes (see "The mood of the last reply" below).
interface MoodSeen {
  messageId: string
  mood: string | null
  /** The mood of the reply before that one. Undefined: not known. */
  before: string | null | undefined
}
const moodsSeen = new Map<string, MoodSeen>()
/** The chat the last look was at: opening another one is a fresh start. */
let chatLooked: string | null = null
</script>

<script setup lang="ts">
import { ArrowLeftRight, Check, Download, Heart, Lightbulb, Pencil, Plus, Volume2 } from '@lucide/vue'
import { reviewCard } from '@core/cards/reviewCard'
import { detectMood, type Mood } from '@core/mood/detectMood'
import { applyMacros } from '@core/prompt/macros'
import type { Character } from '@shared/types'
import { LIFETIME } from './MoodEmote.vue'

// Right column of the chat screen: who you are talking to, who you are, and quick generation settings.

const props = defineProps<{ character: Character }>()

const settingsStore = useSettingsStore()
const charactersStore = useCharactersStore()
const voiceStore = useVoiceStore()
const chatStore = useChatStore()
const characterEditor = useCharacterEditor()

// In a chat with several characters, the panel follows the one who is speaking. The
// newcomer slides in, but only then: opening another chat or character changes the
// panel at once, as it always did.
const arriving = ref(false)
let justOpened = false
watch(
  () => [charactersStore.activeId, chatStore.activeChatId],
  () => {
    justOpened = true
    void nextTick(() => (justOpened = false)) // Once the screen has caught up with the new chat.
  },
  { flush: 'sync' },
)
watch(
  () => props.character.id,
  () => (arriving.value = !justOpened),
)

const tab = ref<'character' | 'persona' | 'memory'>('character')
const tabs = [
  { value: 'character' as const, label: 'Character' },
  { value: 'persona' as const, label: 'Persona' },
  { value: 'memory' as const, label: 'Memory' },
]

const colors = computed(() => avatarColors(props.character.name))

const description = computed(() =>
  applyMacros(props.character.description, {
    char: props.character.name,
    user: settingsStore.persona.name,
  }),
)

// `.lazy`-style saving: the value is written when the field loses focus.
function savePersona(key: 'name' | 'description', event: Event): void {
  const field = event.target as HTMLInputElement | HTMLTextAreaElement
  const value = field.value.trim()
  if (key === 'name' && !value) {
    field.value = settingsStore.persona.name // A persona always has a name.
    return
  }
  void settingsStore.updatePersona({ [key]: value })
}

// --- The mood of the last reply, shown on the picture --------------------------------
// When the character on show has just spoken (or their chat is opened), a small symbol
// pops beside them: a "!" for surprise, a drop of sweat for unease… The mood is read in
// the main process: from the words of the reply (src/core/mood/detectMood.ts) and, where
// the app's own embedding model runs, from what it means (src/main/sense.ts). No clear
// sign, no symbol.
//
// And it only plays when the mood changes (Vivien, 7 October: a symbol at every reply is
// too much). A character who goes on smiling does not get stars each time: the symbol
// marks the moment they start, and the next time is when they feel something else, or
// the same again after a reply that showed nothing. Opening a chat always shows the mood
// of its last reply: that is setting the scene, not repeating.

const moodsStore = useMoodsStore()
const emote = ref<{ mood: Mood; id: number } | null>(null)
let emoteTimer: ReturnType<typeof setTimeout> | undefined
/** Counts the looks: an answer that comes back after a newer look was started is dropped. */
let look = 0

/** The reply to read: the chat's last message, when it is this character's and finished. */
const lastWords = computed(() => {
  if (!settingsStore.appearance.moods || chatStore.isBusy) return null
  const last = chatStore.messages.at(-1)
  if (!last || last.role !== 'assistant') return null
  if ((last.characterId ?? charactersStore.activeId) !== props.character.id) return null
  // The key changes with the message, its version and its text: each is worth a new look.
  return {
    key: `${chatStore.activeChatId}:${last.id}:${last.swipes?.index ?? 0}:${last.content.length}`,
    text: last.content,
    messageId: last.id,
    who: `${chatStore.activeChatId}:${props.character.id}`,
  }
})

/**
 * Notes the mood just read for a reply, and says whether it is worth a symbol: not when
 * it is the mood the reply before already showed. Another version of the same reply is
 * compared to the reply before it too, not to the version it replaces.
 */
function isNews(who: string, messageId: string, mood: Mood | null): boolean {
  const opening = chatLooked !== chatStore.activeChatId
  chatLooked = chatStore.activeChatId
  const seen = moodsSeen.get(who)
  const before = seen ? (seen.messageId === messageId ? seen.before : seen.mood) : undefined
  moodsSeen.set(who, { messageId, mood, before })
  return mood !== null && (opening || mood !== before)
}

watch(
  () => lastWords.value?.key,
  async () => {
    const mine = ++look
    clearTimeout(emoteTimer)
    emote.value = null
    const words = lastWords.value
    if (!words) return
    const asked = Date.now()
    const userName = settingsStore.persona.name
    // Should the main process not answer, the words are still there to be read.
    const mood = await window.api.mood
      .read(words.text, userName)
      .then((reading) => reading.mood)
      .catch(() => detectMood(words.text, { userName }))
    // Another reply came, or another chat was opened, while this one was being read.
    if (mine !== look) return
    // Kept for the waiting row of the next reply ("Lyra hesitates…").
    if (chatStore.activeChatId) moodsStore.note(chatStore.activeChatId, props.character.id, words.messageId, mood)
    if (!isNews(words.who, words.messageId, mood) || !mood) return
    // A beat after the reply ends (or the chat opens), so it does not collide with what moves then.
    emoteTimer = setTimeout(
      () => {
        emote.value = { mood, id: Date.now() }
        emoteTimer = setTimeout(() => (emote.value = null), LIFETIME)
      },
      Math.max(0, 350 - (Date.now() - asked)),
    )
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  look++
  clearTimeout(emoteTimer)
})

// --- Advice: what stops this character from working well ------------------------------
// Only what matters is said here (no opening message, no description). The editor has
// the whole list, and a button to have each thing written.

const toImprove = computed(
  () =>
    reviewCard({ ...props.character, loreCount: props.character.lorebook?.entries.length ?? 0 }).filter((tip) => tip.level === 'important').length,
)

// --- Long memory: what the chat remembers of its oldest messages ---------------------

/** The card was just exported: the button says so for a moment. */
const exported = ref(false)
let exportedTimer = 0

/** Saves a copy of the card where the user chooses (the computer's own window asks where). */
async function exportCard(): Promise<void> {
  const done = await window.api.characters.export(props.character.id).catch(() => false)
  if (!done) return
  exported.value = true
  clearTimeout(exportedTimer)
  exportedTimer = window.setTimeout(() => (exported.value = false), 2500)
}

/** Saved when the field loses focus, like the persona. */
function saveMemory(event: Event): void {
  void chatStore.saveMemory((event.target as HTMLTextAreaElement).value.trim())
}

async function startMemoryOver(): Promise<void> {
  const confirmed = await confirm({
    title: 'Write the memory again?',
    message:
      'What is remembered now is thrown away. At the next reply, the model reads the chat from its first message again, as far as it can, and sums up the rest anew.',
    confirmLabel: 'Start over',
  })
  if (confirmed) await chatStore.saveMemory(null)
}

/** Where the scene is. Saved when the field loses focus, or on Enter. */
function savePlace(event: Event): void {
  void chatStore.savePlace((event.target as HTMLInputElement).value.trim())
}

/** What the character on show is wearing. Saved the same way. */
function saveOutfit(event: Event): void {
  void chatStore.saveOutfit(props.character.id, (event.target as HTMLInputElement).value.trim())
}

/** The note on where the story is heading ("adapts to you"). Saved when the field loses focus. */
function saveStory(event: Event): void {
  void chatStore.saveStory((event.target as HTMLTextAreaElement).value.trim())
}

// --- Several personas: switch, add, delete -----------------------------------------

const { confirm } = useConfirm()
const personaName = ref<HTMLInputElement | null>(null)

function switchPersona(event: Event): void {
  void settingsStore.selectPersona((event.target as HTMLSelectElement).value)
}

async function addPersona(): Promise<void> {
  await settingsStore.addPersona('New persona')
  await nextTick()
  personaName.value?.select() // Ready to be renamed.
}

async function deletePersona(): Promise<void> {
  const { id, name } = settingsStore.persona
  const confirmed = await confirm({
    title: `Delete the persona ${name}?`,
    message: 'Your chats are kept, and the messages written as this persona keep its name.',
    confirmLabel: 'Delete persona',
  })
  if (confirmed) await settingsStore.removePersona(id)
}

/** "3 greetings · Lorebook of 12 entries": what the card brings beyond its description. */
const extras = computed(() => cardExtras(props.character))

</script>

<template>
  <aside class="panel">
    <div class="stage" :class="emote && `feels-${emote.mood}`">
      <!-- The picture is shown whole, at its own proportions: card art is usually a tall portrait. -->
      <div
        :key="character.id"
        class="portrait"
        :class="{ 'has-picture': character.portraitUrl, arriving }"
        :style="{ background: colors.portraitBg, color: colors.portraitFg }"
      >
        <img v-if="character.portraitUrl" :src="character.portraitUrl" alt="" draggable="false" />
        <span v-else class="portrait-initials">{{ initials(character.name) }}</span>
      </div>
      <MoodEmote v-if="emote" :key="emote.id" class="mood" :mood="emote.mood" />
      <!-- Several characters in the chat: look at another one without waiting for them to speak. -->
      <button
        v-if="chatStore.nextOnStage"
        type="button"
        class="swap"
        :aria-label="`Show ${chatStore.nextOnStage.name}`"
        :title="`Show ${chatStore.nextOnStage.name}`"
        @click="chatStore.showNext()"
      >
        <ArrowLeftRight :size="15" :stroke-width="2" />
      </button>
    </div>

    <div class="content">
      <div :key="character.id" class="identity" :class="{ arriving }">
        <div class="identity-text">
          <h2 class="title-serif name">{{ character.name }}</h2>
          <span class="tagline">{{ character.tagline }}</span>
          <CardCredit v-if="character.creator" :creator="character.creator" />
        </div>
        <button
          type="button"
          class="like"
          :class="{ on: character.favorite }"
          :aria-pressed="character.favorite === true"
          :aria-label="character.favorite ? 'Remove from your favourites' : 'Add to your favourites'"
          :title="character.favorite ? 'Remove from favourites' : 'Add to favourites'"
          @click="charactersStore.toggleFavorite(character.id)"
        >
          <Heart :size="15" :stroke-width="2" :fill="character.favorite ? 'currentColor' : 'none'" />
        </button>
        <!-- A copy of the card, to share it or to use it in another app (SillyTavern, chub.ai…). -->
        <button
          type="button"
          class="like export"
          :class="{ done: exported }"
          :aria-label="exported ? 'Card exported' : `Export ${character.name}'s card`"
          :title="exported ? 'Card exported' : 'Export the card: to share it, or to use it in another app'"
          @click="exportCard"
        >
          <Check v-if="exported" :size="15" :stroke-width="2.4" />
          <Download v-else :size="15" :stroke-width="2" />
        </button>
        <button type="button" class="btn btn-small" @click="characterEditor.open(character)">
          <Pencil :size="13" :stroke-width="2" />Edit
        </button>
      </div>

      <div v-if="character.tags.length" class="tags">
        <span v-for="tag in character.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>

      <button v-if="toImprove > 0" type="button" class="to-improve" @click="characterEditor.open(character)">
        <Lightbulb :size="13" :stroke-width="2" />
        {{ toImprove === 1 ? 'One thing would make this character work better' : `${toImprove} things would make this character work better` }}
      </button>

      <span v-if="extras" class="extras">{{ extras }}</span>

      <!-- The voice this character is read with, once a voice service is set up (Settings › Voice). -->
      <div v-if="voiceStore.service" class="voice">
        <span class="field-label"><Volume2 :size="13" :stroke-width="2" />Voice</span>
        <VoicePicker
          :key="character.id"
          :model-value="character.voices?.[voiceStore.service] ?? null"
          :inherit="voiceStore.defaultVoice ? `Same as everyone · ${voiceStore.defaultVoice.name}` : 'None yet: pick one'"
          :fallback="voiceStore.defaultVoice"
          :label="`Voice of ${character.name}`"
          @update:model-value="(voice) => charactersStore.setVoice(character.id, voiceStore.service!, voice)"
        />
      </div>

      <SegmentedControl v-model="tab" :options="tabs" label="Details" />

      <p v-if="tab === 'character'" class="description">{{ description }}</p>

      <div v-else-if="tab === 'memory'" class="memory">
        <!-- Where the scene is and what the character wears: told to the model so that neither changes by itself -->
        <template v-if="settingsStore.generation.keepPlace">
          <label>
            <span class="field-label">Where the scene is</span>
            <input
              :key="`${chatStore.activeChatId}:${chatStore.place}`"
              class="field"
              type="text"
              maxlength="80"
              aria-label="Where the scene is"
              placeholder="Not known yet: it is noted after the next reply"
              :value="chatStore.place"
              @change="savePlace"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </label>
          <label>
            <span class="field-label">What {{ character.name }} is wearing</span>
            <input
              :key="`${chatStore.activeChatId}:${character.id}:${chatStore.outfits[character.id] ?? ''}`"
              class="field"
              type="text"
              maxlength="160"
              :aria-label="`What ${character.name} is wearing`"
              placeholder="Not known yet: write it, or wait for the story to say"
              :value="chatStore.outfits[character.id] ?? ''"
              @change="saveOutfit"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </label>
          <p class="memory-note place-note">
            The character is told to stay here until you go somewhere else, and to keep these clothes until the story
            changes them. Both are noted again after each reply: correct them if they are wrong.
          </p>
        </template>

        <!-- What the model keeps of a chat's oldest messages, once they no longer fit in what it reads -->
        <template v-if="chatStore.memory">
          <label>
            <span class="field-label">
              What is remembered of the first {{ chatStore.memory.count }} messages
            </span>
            <textarea
              :key="chatStore.activeChatId ?? ''"
              class="field memory-text"
              rows="11"
              aria-label="Memory of this chat"
              :value="chatStore.memory.summary"
              :disabled="chatStore.isBusy"
              @change="saveMemory"
            />
          </label>
          <p class="memory-note">
            The model no longer reads those messages, it reads this instead. You can correct it or add to it.
          </p>
          <button type="button" class="persona-delete" :disabled="chatStore.isBusy" @click="startMemoryOver">
            Start over
          </button>
        </template>
        <p v-else-if="settingsStore.generation.memory" class="memory-note">
          Nothing to remember yet: the model still reads this whole chat. When it grows longer than the model can
          read at once, its oldest messages are summed up here instead of being forgotten.
        </p>
        <p v-else class="memory-note">
          “Remember long chats” is turned off in
          <RouterLink to="/settings/generation">Settings › Generation</RouterLink>: in a long chat, the oldest messages
          are simply left out.
        </p>

        <!-- "Follow where each story is heading" (beta): a guess the character reads, open to the user -->
        <template v-if="settingsStore.adapt.followStory">
          <label class="story">
            <span class="field-label">Where this story seems to be heading <span class="beta">beta</span></span>
            <textarea
              :key="`${chatStore.activeChatId}:${chatStore.story}`"
              class="field memory-text"
              rows="4"
              aria-label="Where this story is heading"
              placeholder="Nothing noted yet. The model writes this once you have exchanged a few messages. You can also write it yourself."
              :value="chatStore.story"
              @change="saveStory"
            />
          </label>
          <p class="memory-note">
            A guess the character reads, brought up to date as the story moves. Correct it or empty it as you like.
            <RouterLink to="/settings/adapt">Settings</RouterLink>
          </p>
        </template>
      </div>

      <div v-else class="persona-form">
        <!-- Who you are in the chats. With several personas, this is where you switch. -->
        <div v-if="settingsStore.personas.length > 1">
          <label class="field-label" for="persona-switch">You are</label>
          <select id="persona-switch" class="field" :value="settingsStore.persona.id" @change="switchPersona">
            <option v-for="item in settingsStore.personas" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </div>
        <label>
          <span class="field-label">Your name</span>
          <input
            ref="personaName"
            :key="settingsStore.persona.id"
            class="field"
            type="text"
            :value="settingsStore.persona.name"
            maxlength="40"
            @change="savePersona('name', $event)"
          />
        </label>
        <label>
          <span class="field-label">About you <span class="optional">· optional</span></span>
          <textarea
            :key="settingsStore.persona.id"
            class="field"
            rows="3"
            :value="settingsStore.persona.description"
            placeholder="A few words the character should know about you"
            @change="savePersona('description', $event)"
          />
        </label>
        <div class="persona-actions">
          <button type="button" class="btn btn-small" @click="addPersona">
            <Plus :size="13" :stroke-width="2" />New persona
          </button>
          <button v-if="settingsStore.personas.length > 1" type="button" class="persona-delete" @click="deletePersona">
            Delete this one
          </button>
        </div>
      </div>

      <hr />

      <section class="generation">
        <span class="eyebrow">Generation</span>
        <AppSlider
          label="Creativity"
          :value="settingsStore.generation.temperature"
          :min="0"
          :max="1.5"
          :step="0.05"
          :format="(value) => value.toFixed(2)"
          @commit="(temperature) => settingsStore.update({ generation: { temperature } })"
        />
        <AppSlider
          label="Reply length"
          :value="settingsStore.generation.maxTokens"
          :min="80"
          :max="800"
          :step="20"
          :format="formatReplyLength"
          @commit="(maxTokens) => settingsStore.update({ generation: { maxTokens } })"
        />
        <RouterLink to="/settings/generation" class="more">All generation settings →</RouterLink>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  width: var(--panel-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border);
  /* The whole panel scrolls, picture included: a tall picture must not squeeze what is below it. */
  overflow-y: auto;
  /* The picture moves with the character's mood, sometimes past its edges: never a sideways scrollbar. */
  overflow-x: hidden;
}

.stage {
  position: relative;
  flex-shrink: 0;
}
/* The mood's tone covers the whole picture, however tall; its symbols play over the top,
   where heads usually are (see .pieces in MoodEmote.vue). */
.mood {
  inset: 0;
  --pieces-height: 460px;
}

/* The picture answers the mood with a movement of its own, and for some moods changes
   its light for as long as the effect lasts. */
.portrait img,
.portrait-initials {
  transition: filter 0.5s ease;
}
.stage[class*='feels-'] .portrait img,
.stage[class*='feels-'] .portrait-initials {
  animation: react-hop 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) 0.05s;
}
.stage.feels-surprise .portrait img,
.stage.feels-surprise .portrait-initials {
  animation: react-jump 0.55s cubic-bezier(0.2, 1.4, 0.4, 1) 0.02s;
}
.stage.feels-joy .portrait img,
.stage.feels-joy .portrait-initials,
.stage.feels-playful .portrait img,
.stage.feels-playful .portrait-initials {
  animation: react-hop 0.42s cubic-bezier(0.3, 1.5, 0.5, 1) 0.05s 2;
}
.stage.feels-anger .portrait img,
.stage.feels-anger .portrait-initials {
  animation: react-shake 0.6s linear 0.05s;
}
.stage.feels-fear .portrait img,
.stage.feels-fear .portrait-initials {
  animation: react-shiver 0.09s linear 0.1s 34 alternate;
  filter: saturate(0.55) brightness(0.9);
}
.stage.feels-sad .portrait img,
.stage.feels-sad .portrait-initials,
.stage.feels-sigh .portrait img,
.stage.feels-sigh .portrait-initials,
.stage.feels-sleepy .portrait img,
.stage.feels-sleepy .portrait-initials {
  animation: react-sink 0.9s ease-in-out 0.05s;
}
.stage.feels-sad .portrait img,
.stage.feels-sad .portrait-initials {
  filter: saturate(0.5) brightness(0.86);
}
@keyframes react-hop {
  35% {
    transform: translateY(-7px) scale(1.012);
  }
  70% {
    transform: translateY(2px);
  }
}
@keyframes react-jump {
  18% {
    transform: translateY(4px) scale(1.03, 0.97);
  }
  45% {
    transform: translateY(-13px) scale(0.985, 1.02);
  }
  75% {
    transform: translateY(2px) scale(1.01, 0.99);
  }
}
@keyframes react-shake {
  12% {
    transform: translateX(-7px) rotate(-0.6deg);
  }
  28% {
    transform: translateX(7px) rotate(0.6deg);
  }
  44% {
    transform: translateX(-5px);
  }
  60% {
    transform: translateX(5px);
  }
  78% {
    transform: translateX(-2px);
  }
}
@keyframes react-shiver {
  from {
    transform: translateX(-1.5px);
  }
  to {
    transform: translateX(1.5px);
  }
}
@keyframes react-sink {
  45% {
    transform: translateY(7px) scale(0.995);
  }
}
@media (prefers-reduced-motion: reduce) {
  .stage[class*='feels-'] .portrait img,
  .stage[class*='feels-'] .portrait-initials {
    animation: none;
  }
}

.swap {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: 50%;
  background: rgb(26 19 15 / 0.62);
  backdrop-filter: blur(6px);
  color: #fff;
  opacity: 0.85;
  transition: opacity 0.12s, background 0.12s;
}
.swap:hover,
.swap:focus-visible {
  opacity: 1;
  background: rgb(26 19 15 / 0.85);
}

.portrait {
  position: relative;
  height: 196px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.portrait.has-picture {
  height: auto;
}
.portrait img {
  display: block;
  width: 100%;
  height: auto;
  /* Only a picture far taller than usual gets cut, at the bottom, so it cannot fill the whole window. */
  max-height: 85vh;
  object-fit: cover;
  object-position: top center;
}
/* A chat with several characters: the one who starts speaking comes in. */
.arriving {
  animation: arrive 0.3s ease-out;
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .arriving {
    animation: none;
  }
}

.portrait-initials {
  font-family: var(--font-prose);
  font-size: 64px;
}

.content {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.identity {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
/* The heart that marks a favourite: the same one as on the cards of the library. */
.like {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: -4px;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--text-faint);
  transition:
    color 0.12s,
    transform 0.12s;
}
.like:hover {
  color: var(--like);
  transform: scale(1.12);
}
.like.on {
  color: var(--like);
}
.like.export:hover {
  color: var(--text);
  transform: none;
}
.like.export.done {
  color: var(--success-text);
}
.like.on svg {
  animation: like 0.36s cubic-bezier(0.3, 1.7, 0.5, 1);
}
@keyframes like {
  from {
    transform: scale(0.4);
  }
}
@media (prefers-reduced-motion: reduce) {
  .like.on svg {
    animation: none;
  }
}

.identity-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.voice {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.voice .field-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.extras {
  margin-top: -4px;
  font-size: 11.5px;
  color: var(--text-ghost);
}
.name {
  font-size: 20px;
}
.tagline {
  font-size: 12px;
  color: var(--text-faint);
}

.to-improve {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  background: var(--bg-button);
  border: 1px solid var(--border-field);
  border-left: 2px solid var(--warning-text);
  border-radius: var(--radius);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
  text-align: left;
}
.to-improve:hover {
  color: var(--text);
  border-color: var(--border-hover);
  border-left-color: var(--warning-text);
}
.to-improve svg {
  flex-shrink: 0;
  color: var(--warning-text);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.description {
  /* Imported cards can hold pages of text: it scrolls in place, so the settings below stay in reach. */
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-tag);
  white-space: pre-wrap;
  user-select: text;
}

.memory {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.memory label {
  align-self: stretch;
}
.memory-text {
  font-size: 12.5px;
  line-height: 1.5;
}
.memory-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-faint);
}
.memory-note a {
  font-weight: 600;
}
/* The place comes first; what is remembered of the chat follows under a line. */
.memory .place-note {
  align-self: stretch;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.memory .story {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.beta {
  margin-left: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--warning-text);
}

.persona-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}
.optional {
  font-weight: 400;
  color: var(--text-faint);
}
.persona-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.persona-delete {
  padding: 0;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.persona-delete:hover {
  color: var(--danger-text);
}

hr {
  width: 100%;
  height: 1px;
  margin: 0;
  border: none;
  background: var(--border);
}

.generation {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.more {
  font-size: 12px;
  font-weight: 600;
}
</style>
