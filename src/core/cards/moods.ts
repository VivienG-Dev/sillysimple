import type { CardMood, MoodPick } from '@shared/types'

// Moods: what the user asks of a character with one click, when they would rather not
// find the words ("Describe your character"). Each is a sentence added to the request
// the model gets, next to the idea, or in place of it when there is none.
//
// A mood has three strengths: a first press asks for a touch of it, a second for the
// mood plainly, a third for all of it. The three sentences of a mood are written to be
// told apart by a model: each names different things, not the same thing "more".
//
// "Sassy" and "spicy" are two things on purpose: an attitude, and a sensual story. One
// button for both would leave the user guessing which they will get. Spicy also says,
// at every strength, that the character is an adult whatever the idea says: the app is
// for everyone to use.

/** Every mood, in the order the app offers them. */
export const CARD_MOODS: readonly CardMood[] = ['soft', 'funny', 'dark', 'mysterious', 'sassy', 'spicy']

/** More moods than this at once and they cancel each other out. */
export const MAX_MOODS = 3
/** How strong a mood can be asked for: 1 (a touch), 2 (plainly), 3 (all of it). */
export const MAX_MOOD_LEVEL = 3

export function isCardMood(value: unknown): value is CardMood {
  return CARD_MOODS.includes(value as CardMood)
}

/**
 * The moods of a request as the app trusts them: known ones, once each, the first few,
 * each with a strength from 1 to 3.
 */
export function cleanMoods(value: unknown): MoodPick[] {
  if (!Array.isArray(value)) return []
  const picks = new Map<CardMood, MoodPick>()
  for (const item of value as unknown[]) {
    const mood = (item as Partial<MoodPick> | null)?.mood
    if (!isCardMood(mood) || picks.has(mood)) continue
    const level = Math.round(Number((item as Partial<MoodPick>).level))
    picks.set(mood, { mood, level: level === 2 || level === 3 ? level : 1 })
  }
  return [...picks.values()].slice(0, MAX_MOODS)
}

const ADULT =
  'The character is an adult, whatever the idea says: in age (give it in the description, twenty-one or older), in body and in manner.'

const LINES: Record<CardMood, [string, string, string]> = {
  soft: [
    'A soft touch: a kind, easygoing tone, without changing what the story is about.',
    'Soft: gentle and warm. Kindness, comfort and quiet moments; nothing harsh or frightening.',
    'Very soft: pure comfort. A tender, reassuring character, in a world where nothing bad happens and the only troubles are small everyday ones.',
  ],
  funny: [
    'A little humor: a light tone and a few smiles, in a story that is otherwise played straight.',
    'Funny: a comic premise and a character who is fun to talk to. Wit, mishaps and running jokes, from the first message on.',
    'Very funny: outright comedy. An absurd premise, a character who is a walking disaster or a deadpan menace, and a joke in every reply; nothing is taken seriously.',
  ],
  dark: [
    'A darker edge: some shadow, a past that weighs, a threat kept in the background.',
    'Dark: a heavy atmosphere, real stakes and no easy comfort. The character carries something, and their world is not kind.',
    'Very dark: grim and oppressive. Danger is real, people are hurt or lost, hope is scarce and every choice has a cost.',
  ],
  mysterious: [
    'A little mystery: one secret, or one open question, behind the character.',
    'Mysterious: secrets and things left unsaid. The character knows more than they tell, and the card leaves questions open for the chat to answer.',
    'Very mysterious: a riddle from end to end. Nothing is quite what it seems, the character speaks in half-truths, and the card hints at something large without ever naming it.',
  ],
  sassy: [
    'A little sass: a playful character who teases now and then.',
    'Sassy: a character with attitude, who teases, answers back and lets {{user}} get away with nothing, without ever being cruel.',
    'Very sassy: sharp-tongued and impossible to impress. The character mocks, provokes and always wants the last word; warmth shows rarely, and only sideways. Never cruel or humiliating.',
  ],
  spicy: [
    `A little spice: light flirting and a hint of attraction between the character and {{user}}, suggested and never shown. ${ADULT}`,
    `Spicy: a flirtatious, sensual story, with attraction and tension between the character and {{user}}. ${ADULT}`,
    `Very spicy: an openly erotic story for adults. Desire between the character and {{user}} is the heart of the card, and the opening messages are bold and forward about it. ${ADULT}`,
  ],
}

/** What the model is told about the moods asked for. Empty when there are none. */
export function moodsSection(picks: readonly MoodPick[]): string {
  const asked = CARD_MOODS.flatMap((mood) => picks.filter((pick) => pick.mood === mood).slice(0, 1))
  if (asked.length === 0) return ''
  return [
    'The mood asked for. It colors the whole card: the personality, the scenario, the example dialogue and above all the opening messages.',
    ...asked.map((pick) => `- ${LINES[pick.mood][pick.level - 1]}`),
  ].join('\n')
}

/** "sassy1+spicy3": the moods of a request, for the log. */
export function describeMoods(picks: readonly MoodPick[]): string {
  return picks.map((pick) => `${pick.mood}${pick.level}`).join('+')
}
