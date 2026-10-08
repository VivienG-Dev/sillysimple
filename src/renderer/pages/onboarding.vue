<script setup lang="ts">
import { Check } from '@lucide/vue'
import { AnimatePresence, motion } from 'motion-v'
import { applyMacros } from '@core/prompt/macros'
import type { ConnectionChoice } from '@/components/ConnectionPicker.vue'
import type { Scenario } from '@shared/types'

// First launch, three steps: your name, a model, a story to start with. The mascot
// stands at the top and says what each step is about (MascotGuide.vue).

const router = useRouter()
const settingsStore = useSettingsStore()
const charactersStore = useCharactersStore()
const engineStore = useEngineStore()

const steps = ['Welcome', 'Connect a model', 'Pick a story']
const step = ref(0)

const name = ref(settingsStore.persona.name === 'You' ? '' : settingsStore.persona.name)

async function saveName(): Promise<void> {
  await settingsStore.updatePersona({ name: name.value.trim() || 'You' })
  step.value = 1
}

// --- The last step -------------------------------------------------------------
// What is offered: the ready-to-play scenarios the app comes with. Someone who already
// has characters (a restored backup, cards put in the folder by hand) sees those first.

interface Choice {
  /** Unique in the list: a character and a scenario may not be told apart by their id alone. */
  key: string
  /** Set for a scenario that is not one of the user's characters yet. */
  scenario?: Scenario
  id: string
  name: string
  tagline: string
  pictureUrl?: string
  /** What the story starts on, with {{char}} and {{user}} still in it. */
  pitch: string
}

const scenarios = ref<Scenario[]>([])
onMounted(async () => {
  scenarios.value = await window.api.scenarios.list().catch(() => [])
})

const choices = computed<Choice[]>(() => {
  const owned = charactersStore.ordered.map((character) => ({
    key: `character:${character.id}`,
    id: character.id,
    name: character.name,
    tagline: character.tagline,
    pictureUrl: character.portraitUrl,
    pitch: character.scenario,
  }))
  const had = new Set(owned.map((choice) => choice.id))
  const offered = scenarios.value
    .filter((scenario) => !had.has(scenario.id))
    .map((scenario) => ({ ...scenario, key: `scenario:${scenario.id}`, scenario }))
  return [...owned, ...offered]
})

/** What the user clicked. Until they do, the first choice is the one that is picked. */
const pickedKey = ref('')
const selected = computed(() => choices.value.find((choice) => choice.key === pickedKey.value) ?? choices.value[0] ?? null)
const selectedKey = computed({
  get: () => selected.value?.key ?? '',
  set: (key) => {
    pickedKey.value = key
  },
})

/** The story of the choice that is picked, told with the user's own name. */
const pitch = computed(() =>
  selected.value ? applyMacros(selected.value.pitch, { char: selected.value.name, user: settingsStore.persona.name }) : '',
)

const finishing = ref(false)
const problem = ref('')

// --- What the guide says --------------------------------------------------------
// One title and a few words per step. On the second step it speaks about the choice that
// is picked (what stays on this computer, what leaves it), and follows the download: it
// is the one that waits for it, its eyes on the bar.

/** The name as it stood half a second ago: the guide does not greet every letter. */
const greeted = ref(name.value.trim())
let greeting = 0
watch(name, (typed) => {
  clearTimeout(greeting)
  greeting = window.setTimeout(() => (greeted.value = typed.trim()), 550)
})
onBeforeUnmount(() => clearTimeout(greeting))

/** The progress bar on screen while something downloads: DownloadProgress says where it is. */
const bar = ref<HTMLElement | null>(null)
provide(GUIDE, { bar })

/** A model arrived while this screen was open: the guide is glad, and says what comes next. */
const arrived = ref(false)
let sawDownload = false
watch(
  () => engineStore.job,
  (job) => {
    if (!job) return
    sawDownload = true
    arrived.value = false
  },
)
watch(
  () => engineStore.status?.models.length ?? 0,
  (now, before) => {
    if (sawDownload && now > before) arrived.value = true
  },
)

/**
 * What is picked on the second step, as ConnectionPicker reports it. Until it is on
 * screen: what is saved, which is what it opens on.
 */
const choice = ref<ConnectionChoice>({ kind: settingsStore.connection.kind, service: null, leaves: false, found: null, failed: false })
let choiceTimer = 0

function onLooking(next: ConnectionChoice): void {
  clearTimeout(choiceTimer)
  // Another choice is spoken about at once. The rest comes while an address or a key is
  // typed and tried: the guide waits for it to settle, rather than starting over at each letter.
  if (next.kind !== choice.value.kind || next.service !== choice.value.service) choice.value = next
  else choiceTimer = window.setTimeout(() => (choice.value = next), 450)
}
onBeforeUnmount(() => clearTimeout(choiceTimer))

interface Line {
  title: string
  text: string
  mood: 'idle' | 'waiting' | 'happy' | 'worried'
}

const line = computed<Line>(() => {
  const device = deviceName()

  if (step.value === 0) {
    return greeted.value
      ? { title: `Nice to meet you, ${greeted.value}!`, text: 'That is what characters will call you. You can change it anytime, and even be several people.', mood: 'happy' }
      : {
          title: 'Welcome to SillySimple',
          text: `Hi! Here you chat with characters that live on your own ${device}: no account, no terminal. Three short steps and you are in. First: what should they call you?`,
          mood: 'idle',
        }
  }

  if (step.value === 1) {
    const title = 'Where should replies come from?'
    const job = engineStore.job
    const { kind, service, leaves, found, failed } = choice.value

    // The two other choices: what it says must be true of the one that is picked.
    if (kind !== 'ollama') {
      // A download started on the first choice goes on while another one is looked at.
      const meanwhile = job ? ' The download goes on meanwhile.' : ''

      if (kind === 'cloud') {
        if (failed) return { title, text: `That did not work with ${service}. The reason is written just below.${meanwhile}`, mood: 'worried' }
        if (found) {
          return { title: 'Your key works!', text: `${service} answers. Pick a model in the list, then press Continue. Keep in mind that what you write is sent to ${service}.${meanwhile}`, mood: 'happy' }
        }
        return {
          title,
          text: `Here ${service} writes the replies: nothing to download, and it is quick on any computer. It takes a key of your own, and what you write is sent to ${service} instead of staying on this ${device}.${meanwhile}`,
          mood: 'idle',
        }
      }

      if (found) {
        const privacy = leaves ? 'What you write is sent to that server to write the replies.' : `Nothing you write leaves this ${device}.`
        return { title: 'Found it!', text: `That server answers. Pick one of its models, then press Continue. ${privacy}${meanwhile}`, mood: 'happy' }
      }
      const privacy = leaves
        ? 'This address is another computer: what you write is sent there to write the replies.'
        : `At this address, nothing you write leaves this ${device}.`
      return {
        title,
        text: `This one is for a program you already run yourself, like LM Studio or KoboldCpp: give me its address, and I ask it for its models. ${privacy}${meanwhile}`,
        mood: 'idle',
      }
    }

    if (job) {
      const text =
        job.step === 'engine'
          ? 'First the engine: the program that runs models. This part is quick.'
          : job.step === 'model'
            ? 'Now the model itself. This is the long part: I am keeping an eye on it, you can do something else meanwhile.'
            : job.step === 'finishing'
              ? 'Almost there: I am checking that everything arrived whole.'
              : 'Putting the engine in place…'
      return { title, text, mood: 'waiting' }
    }
    if (engineStore.error) {
      return { title, text: 'That did not work. The reason is written just below; most of the time, trying again is enough.', mood: 'worried' }
    }
    if (arrived.value) return { title: 'It is here!', text: 'Your model is ready. Press Continue, and let us pick a story.', mood: 'happy' }
    return {
      title,
      text: `A character needs a model to write its replies. The first choice is the simple one: I download what it takes, and nothing you write leaves this ${device}. You can change all this later in Settings.`,
      mood: 'idle',
    }
  }

  return {
    title: 'Which story do you want to start with?',
    text: 'Last step! These stories come with the app. The others wait for you in the library, where you can also import cards or write your own.',
    mood: 'idle',
  }
})

async function finish(): Promise<void> {
  if (finishing.value) return
  finishing.value = true
  problem.value = ''
  try {
    const choice = selected.value
    if (choice?.scenario) {
      await window.api.scenarios.play(choice.id)
      await charactersStore.load()
    }
    if (choice) charactersStore.select(choice.id)
    await settingsStore.update({ onboardingDone: true })
    await router.replace('/')
  } catch {
    problem.value = 'This story could not be added to your characters. Pick another one, or try again.'
  } finally {
    finishing.value = false
  }
}
</script>

<template>
  <div class="screen">
    <div class="titlebar drag" />

    <ol class="steps" aria-label="Setup steps">
      <li v-for="(label, index) in steps" :key="label" :class="{ done: index < step, current: index === step }">
        <span class="bullet">
          <Check v-if="index < step" :size="13" :stroke-width="2.6" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        {{ label }}
      </li>
    </ol>

    <!-- The guide stays in place from one step to the next: only what it says changes. -->
    <MascotGuide
      class="guide"
      :class="{ wide: step === 2 }"
      entrance
      :title="line.title"
      :text="line.text"
      :mood="line.mood"
      :watches="bar"
      :watches-at="engineStore.progress ?? 0.5"
    />

    <!-- mode="wait": the old step fades out before the new one comes in -->
    <AnimatePresence mode="wait">
      <motion.section
        :key="step"
        class="step"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: -8 }"
        :transition="{ duration: 0.2, ease: 'easeOut' }"
      >
        <template v-if="step === 0">
          <form class="name-form" @submit.prevent="saveName">
            <label for="persona-name">What should characters call you?</label>
            <input
              id="persona-name"
              v-model="name"
              class="field"
              type="text"
              maxlength="40"
              placeholder="Your name, or the name of the role you play"
              autofocus
            />
            <div class="actions">
              <span class="note">You can change it anytime.</span>
              <button type="submit" class="btn btn-primary">Continue</button>
            </div>
          </form>
        </template>

        <template v-else-if="step === 1">
          <ConnectionPicker save-label="Continue" @saved="step = 2" @looking="onLooking">
            <template #secondary>
              <button type="button" class="btn" @click="step = 0">Back</button>
            </template>
          </ConnectionPicker>
        </template>

        <template v-else>
          <div v-if="choices.length > 0" class="characters" role="radiogroup" aria-label="Stories">
            <label
              v-for="choice in choices"
              :key="choice.key"
              class="character"
              :class="{ selected: choice.key === selected?.key }"
            >
              <input
                v-model="selectedKey"
                type="radio"
                class="sr-only"
                name="character"
                :value="choice.key"
              />
              <CharacterAvatar :name="choice.name" :src="choice.pictureUrl" :size="44" />
              <span class="character-text">
                <span class="character-name">{{ choice.name }}</span>
                <span class="character-tagline">{{ choice.tagline }}</span>
              </span>
            </label>
          </div>
          <p v-else class="pitch">No story was found with the app. You can import a card or write a character once inside.</p>
          <!-- The story of the one that is picked: what you are about to walk into. -->
          <p v-if="pitch" class="pitch" aria-live="polite">{{ pitch }}</p>
          <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
          <div class="actions">
            <span class="note" />
            <button type="button" class="btn" @click="step = 1">Back</button>
            <button type="button" class="btn btn-primary" :disabled="finishing" @click="finish">Start chatting</button>
          </div>
        </template>
      </motion.section>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 0 32px 32px;
  overflow-y: auto;
}

.titlebar {
  align-self: stretch;
  height: var(--titlebar-height);
  flex-shrink: 0;
  margin: 0 -32px;
}

.steps {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 24px;
  padding: 0;
  list-style: none;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-faint);
}
.steps li + li::before {
  content: '';
  width: 32px;
  height: 1px;
  margin-right: 4px;
  background: var(--border-input);
}
.steps li.done {
  color: var(--text-muted);
}
.steps li.current {
  color: var(--text);
}

.bullet {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--border-hover);
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
}
.done .bullet {
  background: var(--bg-selected);
  border-color: transparent;
  color: var(--accent-soft);
}
.current .bullet {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}

.step {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* As wide as the step under it. */
.guide {
  max-width: 600px;
  flex-shrink: 0;
  margin-bottom: 22px;
  transition: max-width 0.25s ease-out;
}
.guide.wide {
  max-width: 720px;
}

.name-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.name-form label {
  font-weight: 600;
}
.name-form .field {
  height: 40px;
  font-size: 15px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.note {
  flex: 1;
  font-size: 12px;
  color: var(--text-dim);
}

/* The last step shows up to a dozen choices: it gets more room, and two columns. */
.step:has(.characters) {
  max-width: 720px;
}
.characters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.character {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 14px;
  background: var(--bg-panel);
  border: 1.5px solid var(--border-field);
  border-radius: var(--radius-lg);
  cursor: pointer;
}
.character:hover:not(.selected) {
  border-color: var(--border-hover);
}
.character.selected {
  background: var(--accent-bg);
  border-color: var(--accent-hover);
}
.character:has(:focus-visible) {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
.character-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.character-name {
  font-size: 14px;
  font-weight: 700;
}
.character-tagline {
  font-size: 12px;
  color: var(--text-dim);
}

.pitch {
  /* Tall enough for the longest story, so the buttons below do not move from one choice to the next. */
  min-height: 4.5em;
  padding: 0 4px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-soft);
  text-align: center;
}
.problem {
  color: var(--danger-text);
  text-align: center;
}

@media (max-width: 640px) {
  .characters {
    grid-template-columns: 1fr;
  }
}
</style>
