import { buildMessages, type LlmMessage } from '@core/prompt/buildMessages'
import { SCENE_LINES, sceneAfter, sceneFromLines } from '@core/prompt/place'
import type { SceneMessage } from '@core/prompt/scene'
import { DEFAULT_SYSTEM_PROMPT } from '@shared/defaults'
import type { Character } from '@shared/types'
import type { LabScene } from './scenes'

// The ways of asking the model where the scene is and what the character wears. The
// first is the app's own; the others are tried against it. One that does better takes
// its place in src/core/prompt/place.ts, and the trial is run again.
//
// What the trials found so far (Gemma 4 e2b, 7 October 2026):
//
//   First, 14 scenes.
//   - The app then asked "what is she wearing?" and nothing else: where the clothes
//     change, the answer was most often the note it had been given, recited. Saying how
//     things were and asking what changed ("app", today) made it right twice as often.
//   - Without the note in the conversation the model made up a place and clothes from the
//     character's card: the note stays in what the reply reads.
//
//   Second, 20 scenes, clothes right / place right:
//   - app 13 / 19. With one more sentence after it, worse: "only clothes the story has
//     told count" 10 (and it started listing what happens instead of what is worn),
//     "where the note and the last message differ, the last message is right" 10. The
//     two lines shown as a form to fill in: 14, the same.
//   - "changes first" 15 / 19: its line on what changed is nearly always right, its
//     line on the clothes does not always follow from it (an apron "tied on", then not
//     worn).
//   - Asked in the conversation, whatever the wording: shoes taken off stay on, and the
//     scene that went to the bakery stays in the hallway, as the note says.
//   - "apart" (the last messages only, no note) 15 / 20, and the only way to follow the
//     scene every time it moved. What it gets wrong is something else: it drops clothes
//     that did not change (a skirt, when a coat is put on), and twice it answered on one
//     line, which cannot be read.
//   - A question asked apart does not make the next reply read the conversation again:
//     136 ms against 132, 1793 from nothing (Ollama 0.40.0). That was the one reason to
//     ask in the conversation.
//
//   Third, 23 scenes, about asking apart:
//   - "apart" as it was: 18 / 23, and 3 of 3 when the scene moves. Each other wording
//     read worse: how things were said in the question and not before the messages 8,
//     what changed asked first 11, the lines shown as a form 9 (they list what happens,
//     "Hoodie off, hair crackling", in place of what is worn).
//   - The next reply after three questions asked apart: 169 ms against 180, 3596 from
//     nothing (6100 tokens).
//
// So the app now asks apart wherever that costs nothing (`asksApart`), and in the
// conversation elsewhere. What "apart" still gets wrong: clothes that did not change
// are sometimes left out when something else changes (a skirt, when a coat goes on).
// A way that does better on that without losing the rest is what to look for next;
// `SCENE_LAB_MODEL=…` says what a larger model makes of the same scenes.

export const MINA: Character = {
  id: 'mina',
  name: 'Mina',
  tagline: '',
  description: 'Mina works in a bookshop in the old town. She is quick-witted and teasing, and warm under it.',
  personality: 'playful, stubborn, kind',
  scenario: '',
  firstMessage: '',
  alternateGreetings: [],
  exampleMessages: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  tags: [],
  lorebook: null,
}
export const USER = 'Alex'
const NAME = MINA.name

const history = (scene: LabScene): SceneMessage[] => scene.told.map((content, index) => ({ role: index % 2 === 0 ? 'user' : 'assistant', content }))

/** What the model read to write the reply: the app's own messages, its note on the place and the clothes at the end. */
function conversation(scene: LabScene): LlmMessage[] {
  return buildMessages({
    character: MINA,
    persona: { name: USER, description: '' },
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    history: history(scene),
    place: scene.before.place,
    outfit: scene.before.outfit,
  })
}

const lines = (scene: LabScene): { name: string; content: string }[] =>
  [...history(scene), { role: 'assistant' as const, content: scene.reply }].map((item) => ({ name: item.role === 'user' ? USER : NAME, content: item.content }))

export interface Way {
  what: string
  ask: (scene: LabScene) => LlmMessage[]
}

export const WAYS: Record<string, Way> = {
  app: {
    what: 'as the app asks an Ollama or an online service: apart from the conversation, the last messages only',
    ask: (scene) => sceneFromLines(lines(scene).slice(-SCENE_LINES), NAME, scene.before),
  },
  'in the conversation': {
    what: 'as the app asks another server on this computer: in the conversation the reply was written in, saying how things were',
    ask: (scene) => sceneAfter(conversation(scene), scene.reply, NAME, scene.before),
  },
  // A way to try goes here. This one is after the clothes left out when something else
  // changes; it has not been tried yet.
  'apart, still worn': {
    what: 'the app\'s question apart, and: what she wore earlier and did not take off is still worn',
    ask: (scene) => {
      const asked = sceneFromLines(lines(scene).slice(-SCENE_LINES), NAME, scene.before)
      const last = asked.at(-1)!
      return [
        ...asked.slice(0, -1),
        { ...last, content: last.content.replace('what was taken off is no longer worn', 'what was taken off is no longer worn, what she wore earlier and did not take off still is') },
      ]
    },
  },
}
