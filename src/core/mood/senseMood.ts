import { MOODS, type Mood } from './detectMood'

// The mood of a reply, read from what it means rather than from its words.
//
// The word lists (detectMood.ts) only know the words they were given, in English and in
// French. An embedding model turns a sentence into a point, close to the points of
// sentences that mean the same, whatever their words or their language. So each mood is
// given a few sentences that show it (the anchors below), a reply is cut into its
// sentences, and each is compared to every mood: "You are the best thing that ever
// happened to me" is closer to tenderness than to anything else, with no telling word in
// it. It has its limits, which the trial showed: it finds the feelings that are plain to
// see (joy, tenderness, anger, surprise, tears), in any language, and misses the ones
// that take reading between the lines (irony, unease, a question left hanging).
//
// This file only does the arithmetic: it never talks to a model. The vectors come from
// outside (src/main/sense.ts asks the app's own embedding model for them), which is what
// lets all of it be tested with made-up vectors.
//
// Like the word lists, it prefers silence to a wrong guess: among the anchors are
// sentences that show no feeling at all, and a mood only counts by how much closer a
// sentence is to it than to those.

/** A mood, or plainly nothing: what a sentence that states a fact shows. */
export type Feeling = Mood | 'none'
export const FEELINGS: readonly Feeling[] = [...MOODS, 'none']

// What the trial with the real model said (`pnpm mood:lab`, 7 October 2026, 142 replies;
// it writes its report in lab/out). Three things here come from it, not from taste:
//   - The texts are given to the model as they are. EmbeddingGemma has words to write
//     before a text for each kind of task ("task: classification | query: "); with them
//     it read these replies worse, whichever was tried, so nothing is written before.
//   - The vectors are taken from the middle of the anchors (`Sense.middle`): what all
//     sentences have in common is taken away, and what tells them apart is left.
//   - The two thresholds, `ENOUGH` and `LEAD`.

/**
 * A few sentences per mood, written like roleplay prose: what the body does, what is
 * felt, what is said. A mood is where its sentences meet (their middle point), so each
 * sentence may lean its own way; what they share is the mood.
 *
 * Changing one changes what the app reads: run `pnpm mood:lab` afterwards (lab/mood).
 */
export const ANCHORS: Record<Feeling, readonly string[]> = {
  joy: [
    'She laughs out loud, her whole face bright with happiness.',
    'He is delighted, grinning from ear to ear, almost bouncing with excitement.',
    '"This is wonderful! I am so happy, I can hardly believe it!"',
    'They cheer and clap, overjoyed at the good news.',
  ],
  playful: [
    'She smirks and teases, a mischievous glint in her eyes.',
    'He winks and pokes fun, clearly enjoying the game.',
    '"Oh? And what will you do if I refuse? You will have to catch me first."',
    'They joke around, cheeky and playful, sticking out their tongue.',
  ],
  love: [
    'She looks at them with tenderness and deep affection, her heart full.',
    'He holds them close and kisses them softly, completely in love.',
    '"I love you. I want to stay by your side, always."',
    'They gaze with warmth and devotion, cherishing the moment together.',
  ],
  shy: [
    'She blushes deeply and looks away, too embarrassed to speak.',
    'He stammers, flustered, hiding his red face behind his hands.',
    '"I-it is not like that... please do not look at me, it is embarrassing."',
    'They shrink back bashfully, cheeks burning, unable to meet anyone\'s eyes.',
  ],
  anger: [
    'She glares, furious, her fists clenched and her voice shaking with rage.',
    'He slams his hand on the table and shouts, losing his temper.',
    '"How dare you! I have had enough of this. Get out!"',
    'They scowl, irritated and resentful, jaw tight with anger.',
  ],
  surprise: [
    'She gasps, eyes wide, completely taken aback by what just happened.',
    'He freezes in shock, mouth open, unable to believe what he sees.',
    '"What?! No way... that is impossible! Since when?"',
    'They jump, startled, astonished by the sudden news.',
  ],
  question: [
    'She tilts her head, puzzled, not understanding what is meant.',
    'He frowns in confusion, trying to make sense of it.',
    '"Huh? What do you mean? I do not follow."',
    'They look curious and perplexed, an eyebrow raised in doubt.',
  ],
  sad: [
    'She cries quietly, tears running down her cheeks, heartbroken.',
    'He lowers his head, his voice breaking with grief and sorrow.',
    '"It hurts so much... I miss them. Why did it have to end like this?"',
    'They feel lonely and miserable, weighed down by a deep sadness.',
  ],
  nervous: [
    'She fidgets anxiously, sweating, unsure of what to say.',
    'He swallows hard and laughs awkwardly, visibly uneasy.',
    '"Um... well... about that... I am not sure how to put this..."',
    'They hesitate, tense and worried, wringing their hands.',
  ],
  sigh: [
    'She sighs and rolls her eyes, tired of this nonsense.',
    'He rubs his temples, exasperated, his patience running out.',
    '"Ugh, fine. Whatever. Do what you want, I give up."',
    'They look unimpressed and weary, shaking their head in resignation.',
  ],
  fear: [
    'She trembles in terror, backing away, her face pale.',
    'He panics, heart pounding, frozen with dread at the danger.',
    '"No... stay away! Please, do not hurt me! We have to run!"',
    'They cower, terrified, horrified by the thing in the dark.',
  ],
  sleepy: [
    'She yawns widely, rubbing her eyes, barely staying awake.',
    'He dozes off, eyelids heavy, exhausted and drowsy.',
    '"Mmh... five more minutes... so sleepy... let me rest."',
    'They slump, drained and half asleep, ready for bed.',
  ],
  thinking: [
    'She strokes her chin, deep in thought, weighing the options.',
    'He falls silent, pondering the problem carefully.',
    '"Hmm... let me think. If that is true, then maybe..."',
    'They consider it thoughtfully, working through an idea.',
  ],
  // No feeling shown: facts, places, plain actions. There are more of these because
  // "nothing" is many things, and a mood has to beat all of them.
  none: [
    'She explains the facts calmly, in an even voice.',
    'He describes the room, the furniture and what is on the shelves.',
    '"The harbour is two streets down. Turn left at the fountain."',
    'They open the ledger, count the crates and write the numbers down.',
    'She walks to the door, picks up her coat and waits.',
    '"The meeting is at noon. Bring the documents and the keys."',
    'He nods and gets on with his work without a word.',
    'The street is quiet; a cart rolls past the old stone houses.',
  ],
}

/** Every anchor with the feeling it shows, in the order `buildSense` expects their vectors. */
export function anchorList(anchors: Record<Feeling, readonly string[]> = ANCHORS): { feeling: Feeling; text: string }[] {
  return FEELINGS.flatMap((feeling) => anchors[feeling].map((text) => ({ feeling, text })))
}

// --- From the anchors' vectors to something a reply can be compared to ----------------

export interface Sense {
  /**
   * The middle of all the anchors: what every sentence has in common, for this model.
   * A vector is read from there (`from`), which spreads apart what was all in one corner.
   */
  middle: number[]
  /** The middle point of each feeling's anchors, seen from `middle`, of length 1. */
  centers: Record<Feeling, number[]>
  /**
   * How much closer an anchor is to its own mood than to "none", typically. Every model
   * has its own idea of "close" (for one, 0.1 apart is a lot; for another, nothing):
   * measured on the anchors themselves, it turns distances into "how much of a clear
   * case this is", 1 being as clear as the anchors.
   */
  scale: number
}

/**
 * `vectors`: one per anchor, in the order of `anchorList(anchors)`.
 * Throws when they are not what was asked for: a model that answers something else.
 */
export function buildSense(vectors: readonly (readonly number[])[], anchors: Record<Feeling, readonly string[]> = ANCHORS): Sense {
  const list = anchorList(anchors)
  const size = vectors[0]?.length ?? 0
  if (vectors.length !== list.length || size === 0 || vectors.some((vector) => vector.length !== size || !vector.every(Number.isFinite))) {
    throw new Error(`The embedding model answered ${vectors.length} vectors for ${list.length} sentences, or vectors that cannot be used.`)
  }

  const units = vectors.map(unit)
  const middle = mean(units)
  const seen = units.map((vector) => from(middle, vector))
  const of = (feeling: Feeling, except = -1): number[][] => list.flatMap((anchor, index) => (anchor.feeling === feeling && index !== except ? [seen[index]!] : []))
  const centers = Object.fromEntries(FEELINGS.map((feeling) => [feeling, unit(mean(of(feeling)))])) as Record<Feeling, number[]>

  // Each anchor against the middle of the others of its mood: with itself in, it would flatter the measure.
  const margins: number[] = []
  list.forEach((anchor, index) => {
    if (anchor.feeling === 'none') return
    const others = of(anchor.feeling, index)
    if (others.length === 0) return
    margins.push(dot(seen[index]!, unit(mean(others))) - dot(seen[index]!, centers.none))
  })
  // A model that tells no sentence from another leaves nothing once the middle is taken away.
  const scale = median(margins)
  return { middle, centers, scale: Number.isFinite(scale) ? Math.max(0, scale) : 0 }
}

/** A vector as it is read: seen from the middle of the anchors, of length 1. */
export function from(middle: readonly number[], vector: readonly number[]): number[] {
  const whole = unit(vector)
  return unit(whole.map((value, index) => value - middle[index]!))
}

// --- Cutting a reply ------------------------------------------------------------------

/** A reply has many sentences; the last ones say how the character feels now. */
export const MAX_PIECES = 6
/** A sentence shorter than this says too little alone: it goes with its neighbour. */
const SHORT = 25
/** Beyond this a "sentence" is a paragraph without a full stop: its end is what counts. */
const LONG = 400

export interface Piece {
  text: string
  /** Where it is in the reply, from 0 (the start) to 1 (the end). */
  place: number
}

interface Sentence {
  text: string
  start: number
  end: number
}

/** The marks that open something said. */
const OPENS = '"“«„「『'
const ABOUT_YOU = /^(?:you|your|tu|ton|ta|tes|vous|votre|vos)\b/i

/**
 * The sentences of a reply worth reading for a mood, at most MAX_PIECES, the last ones.
 * `userName`: the name the user plays under. Narration about them ("You laugh", "Ren
 * blushes") is left out: it is their mood, not the character's. What the character says
 * to them ("You came back!") stays. What is said and what is told is known from the
 * reply's own marks: its quotes when it has any; otherwise its asterisks, around what is
 * told; a reply with neither is someone talking.
 */
export function cutReply(text: string, userName?: string): Piece[] {
  const total = text.length
  if (total === 0) return []
  const you = userName?.trim()
  const aboutUser = you ? new RegExp(`^${escape(you)}(?:['’]s)?(?![\\p{L}\\p{N}])`, 'iu') : null

  // A sentence ends on its punctuation (with the quote or asterisk that closes it), or on a new line.
  const found = [...text.matchAll(/[^.!?…。！？\n]+(?:[.!?…。！？]+["“”»’'*)\]」』]*|\n+|$)|[.!?…。！？]+["“”»’'*)\]」』]*/g)]
  const sentences: Sentence[] = []
  // Quotes say it best: asterisks are also put around one word to stress it.
  const marks = /["“”«»„「『]/.test(text) ? 'quotes' : /\*[^*\n]+\*/.test(text) ? 'stars' : 'none'
  /** The quote that is open where the sentence starts, or "". */
  let quote = ''
  let inStars = false
  for (const match of found) {
    const first = match[0].trimStart()[0] ?? ''
    const said = marks === 'none' || (marks === 'quotes' ? quote !== '' || OPENS.includes(first) : !(inStars || first === '*'))
    for (const letter of match[0]) {
      if (letter === '*') inStars = !inStars
      else if (letter === '"') quote = quote ? '' : letter
      // German closes with the mark English opens with: „so“.
      else if (letter === '“' && quote === '„') quote = ''
      else if (OPENS.includes(letter)) quote = letter
      else if ('”»」』'.includes(letter)) quote = ''
    }
    // A mark left open (a typo, a reply cut short) does not turn the rest of the reply around.
    if (match[0].endsWith('\n')) {
      quote = ''
      inStars = false
    }

    const clean = match[0].replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/[\p{L}\p{N}]/u.test(clean)) {
      // Punctuation alone ("...", "?!") belongs to what came before.
      const before = sentences.at(-1)
      if (before && clean) before.text += clean
      continue
    }
    const subject = clean.replace(/^["“«„「『'’\s]+/, '')
    const theirs = !said && (ABOUT_YOU.test(subject) || aboutUser?.test(subject) === true)
    if (!theirs) sentences.push({ text: clean, start: match.index, end: match.index + match[0].length })
  }

  // Short ones join the next (the last one, the one before): "I... I did not mean it like that."
  const merged: Sentence[] = []
  let carry: Sentence | null = null
  for (const sentence of sentences) {
    const whole: Sentence = carry ? { text: `${carry.text} ${sentence.text}`, start: carry.start, end: sentence.end } : sentence
    if (whole.text.length < SHORT) carry = whole
    else {
      merged.push(whole)
      carry = null
    }
  }
  if (carry) {
    const last = merged.at(-1)
    if (last) merged[merged.length - 1] = { text: `${last.text} ${carry.text}`, start: last.start, end: carry.end }
    else merged.push(carry)
  }

  return merged
    .slice(-MAX_PIECES)
    .map(({ text: sentence, start, end }) => ({ text: sentence.length > LONG ? sentence.slice(-LONG) : sentence, place: (start + end) / 2 / total }))
}

// --- Reading --------------------------------------------------------------------------

/** As for the word lists: the end of a reply tells more than its start. */
const START_WEIGHT = 0.7
const END_WEIGHT = 1.2
/**
 * How clear a case has to be to show a mood, 1 being "as clear as the anchors". Real
 * replies are never as clear as sentences written to show one thing.
 *
 * Set on the trial with the real model: below this, about one mood in five that it showed
 * was the wrong one; from here, fewer than one in ten, and it still finds about a third
 * of the moods no word tells. A reply that shows no feeling stays far under (0.02 at most
 * there).
 */
export const ENOUGH = 0.5
/** And how far ahead of the next mood: joy and playfulness are neighbours, a near tie says "unsure". */
export const LEAD = 0.1

export interface SenseReading {
  /** Null: nothing clear enough. */
  mood: Mood | null
  /** The closest mood, shown or not, and how clear a case it is. */
  best: Mood | null
  strength: number
  /** The next one, for telling a near tie. */
  next: Mood | null
  nextStrength: number
  /** How clear a case of each mood the reply is. Empty when nothing could be read. */
  strengths: Partial<Record<Mood, number>>
}

/** The mood of a reply, from the vectors of its pieces (see `cutReply`). */
export function senseMood(sense: Sense, pieces: readonly { vector: readonly number[]; place: number }[], enough = ENOUGH, lead = LEAD): SenseReading {
  const nothing: SenseReading = { mood: null, best: null, strength: 0, next: null, nextStrength: 0, strengths: {} }
  if (sense.scale <= 0 || pieces.length === 0) return nothing

  // For each mood, its clearest sentence: one clear sign is enough, as with the words.
  const strengths = new Map<Mood, number>()
  for (const piece of pieces) {
    if (piece.vector.length !== sense.middle.length) return nothing
    const vector = from(sense.middle, piece.vector)
    const weight = START_WEIGHT + (END_WEIGHT - START_WEIGHT) * Math.min(1, Math.max(0, piece.place))
    const flat = dot(vector, sense.centers.none)
    for (const mood of MOODS) {
      const strength = (weight * (dot(vector, sense.centers[mood]) - flat)) / sense.scale
      if (strength > (strengths.get(mood) ?? Number.NEGATIVE_INFINITY)) strengths.set(mood, strength)
    }
  }

  const ranked = [...strengths].filter(([, strength]) => Number.isFinite(strength)).sort((a, b) => b[1] - a[1])
  // Vectors that are not numbers compare to nothing: nothing can be said.
  if (ranked.length === 0) return nothing
  const [best, strength] = ranked[0]!
  const [next, nextStrength] = ranked[1] ?? [null, 0]
  const clear = strength >= enough && strength - nextStrength >= lead
  return { mood: clear ? best : null, best, strength, next, nextStrength, strengths: Object.fromEntries(ranked) }
}

/** The mood to show for a reply, and what read it. */
export interface MoodReading {
  mood: Mood | null
  by: 'words' | 'meaning' | null
}

/**
 * What the meaning has to make of the mood a word told, for that mood to be shown. Under
 * it, no sentence of the character's reads like that mood at all: the word was about
 * someone else ("You burst into tears", the lists look one word back and miss it), or
 * said the opposite of what it seemed.
 * From the trial with the real model: of the moods the lists read right, all but one
 * were over this; the three they took from the user for the character's were near -1.
 */
export const SUPPORT = 0

/**
 * The words and the meaning, put together. A telling word is a sure sign ("she blushes"):
 * when the lists read a mood, that is the one, unless the meaning finds no trace of it
 * (`SUPPORT`). The meaning speaks where the words are silent: a reply with no word they
 * know, or in a language they do not have. `meaning`: null when no model was asked.
 */
export function settleMood(words: Mood | null, meaning: SenseReading | null): MoodReading {
  const trace = words ? meaning?.strengths[words] : undefined
  if (words && (trace === undefined || trace >= SUPPORT)) return { mood: words, by: 'words' }
  if (meaning?.mood) return { mood: meaning.mood, by: 'meaning' }
  return { mood: null, by: null }
}

// --- Vectors --------------------------------------------------------------------------

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let index = 0; index < a.length; index++) sum += a[index]! * b[index]!
  return sum
}

/** The same direction, of length 1: then `dot` is the cosine. */
function unit(vector: readonly number[]): number[] {
  const length = Math.sqrt(dot(vector, vector))
  return length > 0 ? vector.map((value) => value / length) : [...vector]
}

function mean(vectors: readonly (readonly number[])[]): number[] {
  const sum = new Array<number>(vectors[0]?.length ?? 0).fill(0)
  for (const vector of vectors) for (let index = 0; index < sum.length; index++) sum[index]! += vector[index]!
  return sum.map((value) => value / Math.max(1, vectors.length))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
