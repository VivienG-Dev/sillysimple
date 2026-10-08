import type { SceneDirection } from '@shared/types'

// Directing the scene without writing a line.
//
// The user can ask for a reply without saying anything ("More…"), or give the next reply
// a stage direction with one click: something happens, the scene moves, time passes.
// Neither is a message of the chat. It is a note in brackets, the way roleplayers write
// out-of-character remarks, placed where the model reads it last: at the end of the
// user's last message, or as a message of its own when the character spoke last (a model
// needs something to answer). Only the reply it produces is kept.

/** Every direction, in the order the app offers them. */
export const DIRECTIONS: readonly SceneDirection[] = ['event', 'place', 'time']

export function isDirection(value: unknown): value is SceneDirection {
  return DIRECTIONS.includes(value as SceneDirection)
}

const NEVER = "Do not write {{user}}'s words or actions, and do not mention this note."

// "Something happens" used to give the model a list of examples: "(someone arrives,
// something is found or goes wrong, news comes, a danger appears…)". It took the first
// one, every time: someone always arrived (Vivien, 7 October). A model does not draw
// lots, so the app does. But a kind drawn blindly may not fit the scene (an animal
// turning up in a spaceship), and the model is the one who knows the scene: so the app
// draws two kinds, never those of the time before, and the model takes whichever fits
// better. Variety comes from the draw, fitness from the model.
//
// The kinds are meant to make sense anywhere, from a bedroom to outer space: nothing in
// them names a thing a story may not have. They happen where the scene is, and all but
// one bring no one new in.

/** What can happen. Each completes "what happens is: …". */
export const EVENTS: readonly string[] = [
  'something in the place breaks, falls, spills or stops working',
  'a sound, a smell or a light comes from close by that should not be there',
  'the surroundings change all at once (the weather, the light, the temperature, something that starts or stops)',
  'a message, a call, a signal or a piece of news reaches them',
  '{{char}} notices something that was there all along and had gone unseen (an object, a detail, a mark)',
  '{{char}} suddenly remembers or realises something that changes how the situation looks',
  'something {{char}} was hiding or holding back comes out by accident (a secret, a feeling, an object)',
  'a small accident or mishap happens to {{char}}',
  'something that should be here is missing, or is not where it was left',
  'something turns urgent: it has to be dealt with right now, before it is too late',
  'what was going well goes wrong, or what looked like trouble turns into a chance',
  'someone arrives, or interrupts',
]
/** The one kind that brings someone in. */
const ARRIVAL = EVENTS.length - 1
/** How many kinds the model is given to choose from. */
export const EVENT_CHOICES = 2

/**
 * The kinds of event offered this time: two, in an order of their own, and none of those
 * offered the time before, so that two "something happens" in a row differ whatever the
 * model picks. `previous`: what was offered last time in this chat. `random`: for the tests.
 */
export function pickEvents(previous: readonly number[] = [], random: () => number = Math.random): number[] {
  const left = EVENTS.map((_, index) => index).filter((index) => !previous.includes(index))
  const picked: number[] = []
  while (picked.length < EVENT_CHOICES && left.length > 0) {
    const at = Math.min(left.length - 1, Math.floor(random() * left.length))
    picked.push(...left.splice(at, 1))
  }
  return picked
}

/** What "something happens" may be told on top of the direction itself. */
export interface EventHints {
  /** The kinds of thing it may be (see `pickEvents`). Left out: the model is free, which in practice means it does the same thing each time. */
  events?: readonly number[]
  /**
   * The model was told how the user likes to play ("Adapts to you", see notice.ts): the
   * event leans that way. (Vivien, 7 October: if the app knows my tastes, let it use them.)
   */
  tastes?: boolean
}

function eventCue({ events: kinds = [], tastes = false }: EventHints = {}): string {
  const events = kinds.map((kind) => EVENTS[kind]).filter((event): event is string => event !== undefined)
  const [first, ...others] = events
  const what = !first
    ? ''
    : others.length === 0
      ? ` What happens is this: ${first}.`
      : ` It is one of these, whichever fits this scene and this story better: either ${first}; ${others.map((event) => `or ${event}`).join('; ')}.`
  const alone = first && !kinds.includes(ARRIVAL) ? ' No one new comes into the scene.' : ''
  const liked = tastes ? ' Make it the kind of turn {{user}} enjoys in a story, going by what is noted above of how they like to play.' : ''
  return (
    `[Stage direction: something unexpected happens now, where the scene is.${what} In {{char}}'s next reply, bring it into the scene ` +
    `in a way that makes sense here and changes the situation, and show how {{char}} reacts to it.${alone}${liked} ${NEVER}]`
  )
}

const CUES: Record<Exclude<SceneDirection, 'event'>, string> = {
  place:
    "[Stage direction: the scene moves somewhere else. In {{char}}'s next reply, tell briefly how the characters leave this place and where " +
    `they arrive, a place that fits the story so far, describe it in a few words, then carry on the scene there. ${NEVER}]`,
  time:
    "[Stage direction: time passes. {{char}}'s next reply takes place later: a few hours, the next day or longer, whatever fits the story. " +
    `Say briefly how much time has passed and what happened meanwhile, then carry on the scene from there. ${NEVER}]`,
}

/**
 * What the model is told for a direction. `{{char}}` and `{{user}}` are filled in by the
 * caller. `hints`: for "something happens" only.
 */
export function directionCue(direction: SceneDirection, hints?: EventHints): string {
  return direction === 'event' ? eventCue(hints) : CUES[direction]
}

/**
 * Sent when the character is asked to speak again right after its own message ("More…",
 * or its name clicked in a scene): it goes on by itself.
 */
export const GO_ON_CUE =
  '[{{user}} says nothing for now. Continue the scene as {{char}}: carry on from where it stopped and move things forward, without repeating what was already said.]'

/** Sent when the character is asked to speak in a chat where nothing has been said yet. */
export const OPEN_CUE = '[Open the scene as {{char}}.]'
