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
//
// A mood changes the tone and what the story is about, never who the character is: a
// shy character asked for "very spicy" stays shy and lives the desire shyly, and asked
// for "very sassy" mutters the comebacks. Without that, the mood wins over the idea and
// every spicy character comes out forward. The header says it once for all moods, and
// the stronger sentences of each mood say it again with an example.

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
    'Soft: gentle and warm. Kindness, comfort and quiet moments; nothing harsh or frightening. The character brings that warmth in their own way: a gruff one through gestures rather than words.',
    'Very soft: pure comfort. A world where nothing bad happens and the only troubles are small everyday ones, and a character who looks after {{user}} in their own way, even a shy or prickly one.',
  ],
  funny: [
    'A little humor: a light tone and a few smiles, in a story that is otherwise played straight.',
    'Funny: a comic premise and a character who is fun to talk to. Wit, mishaps and running jokes from the first message on, drawn from who the character is: a shy one is funny through awkwardness, a serious one by taking everything too seriously.',
    'Very funny: outright comedy. An absurd premise, a joke in every reply, and nothing is taken seriously. The character is the comedy in their own way: a walking disaster, a deadpan menace, or a shy one whose every attempt goes wrong.',
  ],
  dark: [
    'A darker edge: some shadow, a past that weighs, a threat kept in the background.',
    'Dark: a heavy atmosphere, real stakes and no easy comfort. The character carries something, and their world is not kind; they bear it in their own way, a cheerful one behind a smile that cracks.',
    'Very dark: grim and oppressive. Danger is real, people are hurt or lost, hope is scarce and every choice has a cost. The character stays who they are, and the darkness shows in what it costs them.',
  ],
  mysterious: [
    'A little mystery: one secret, or one open question, behind the character.',
    'Mysterious: secrets and things left unsaid. The character knows more than they tell and hides it in their own way: a talkative one behind chatter, a quiet one behind silence. The card leaves questions open for the chat to answer.',
    'Very mysterious: a riddle from end to end. Nothing is quite what it seems, and the card hints at something large without ever naming it. The character stays who they are; the mystery is in what they hide and the half-truths they tell, in their own voice.',
  ],
  sassy: [
    'A little sass: a playful character who teases now and then.',
    'Sassy: a character with attitude, who teases, answers back and lets {{user}} get away with nothing, without ever being cruel. The attitude comes out in their own way: a shy one mutters the comeback, then looks away.',
    'Very sassy: sharp-tongued and impossible to impress. The character mocks, provokes and always wants the last word; warmth shows rarely, and only sideways. Never cruel or humiliating. It stays their own way: a shy one fires off cutting remarks under their breath.',
  ],
  spicy: [
    `A little spice: light flirting and a hint of attraction between the character and {{user}}, suggested and never shown, in the character's own way. ${ADULT}`,
    `Spicy: a flirtatious, sensual story, with attraction and tension between the character and {{user}}. The character shows it in keeping with who they are: a shy one through glances, blushes and things half said, a confident one openly. ${ADULT}`,
    `Very spicy: an openly erotic story for adults. Desire between the character and {{user}} is the heart of the card and the opening messages make it plain, but the character lives it their own way: a shy one blushes, hesitates and gives in slowly, a bold one makes the first move. ${ADULT}`,
  ],
}

/** What the model is told about the moods asked for. Empty when there are none. */
export function moodsSection(picks: readonly MoodPick[]): string {
  const asked = CARD_MOODS.flatMap((mood) => picks.filter((pick) => pick.mood === mood).slice(0, 1))
  if (asked.length === 0) return ''
  return [
    'The mood asked for. It colors the whole card: the tone, the scenario, the example dialogue and above all the opening messages. ' +
      'Who the character is still comes from the idea: a mood never overturns a trait the idea gives (a shy character stays shy, a cold one stays cold), it changes how that trait plays out.',
    ...asked.map((pick) => `- ${LINES[pick.mood][pick.level - 1]}`),
  ].join('\n')
}

/** "sassy1+spicy3": the moods of a request, for the log. */
export function describeMoods(picks: readonly MoodPick[]): string {
  return picks.map((pick) => `${pick.mood}${pick.level}`).join('+')
}
