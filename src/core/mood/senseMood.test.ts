import { describe, expect, it } from 'vitest'
import { MOODS } from './detectMood'
import { ANCHORS, anchorList, buildSense, cutReply, FEELINGS, from, senseMood, settleMood, type Feeling, type SenseReading } from './senseMood'

// No model here: a stand-in turns a text into a point. Each word pulls it in a direction
// of its own, and also towards every feeling whose anchors use that word: a crude "this
// word belongs to that mood", which is enough to try the arithmetic, the cutting and the
// decision. What the real model understands is tried with it (`pnpm mood:lab`).

const LITTLE = new Set(
  'the a an and or of to in on at is are was it its her his their them she he they with for from not that this what how you your i me my am do so if by up no did let will have has had can'.split(' '),
)
const wordsOf = (text: string): string[] => (text.toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((word) => !LITTLE.has(word)).map((word) => word.slice(0, 5))
const SPACE = 96
/** The words of each feeling's anchors. */
const KNOWN = FEELINGS.map((feeling) => new Set(ANCHORS[feeling].flatMap(wordsOf)))

function point(text: string): number[] {
  const vector = new Array<number>(SPACE + FEELINGS.length).fill(0)
  for (const word of wordsOf(text)) {
    let hash = 7
    for (const letter of word) hash = (hash * 31 + letter.codePointAt(0)!) % 9973
    vector[hash % SPACE]! += 1
    KNOWN.forEach((known, index) => {
      if (known.has(word)) vector[SPACE + index]! += 1.5
    })
  }
  const length = Math.hypot(...vector) || 1
  return vector.map((value) => value / length)
}

const sense = buildSense(anchorList().map((anchor) => point(anchor.text)))
/** A vector that is read as `seen`: what `from` gives back when it is asked about it. */
const back = (seen: readonly number[]): number[] => seen.map((value, index) => value + sense.middle[index]!)
const read = (text: string, userName?: string): SenseReading =>
  senseMood(sense, cutReply(text, userName).map((piece) => ({ vector: point(piece.text), place: piece.place })))

describe('the anchors', () => {
  it('has a few sentences for every mood, and more for "nothing"', () => {
    expect(FEELINGS).toEqual([...MOODS, 'none'])
    for (const mood of MOODS) expect(ANCHORS[mood].length).toBeGreaterThanOrEqual(3)
    expect(ANCHORS.none.length).toBeGreaterThan(ANCHORS.joy.length)
    const all = anchorList().map((anchor) => anchor.text)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('what a model said of the anchors', () => {
  it('becomes one point per feeling and a measure of what "clear" is', () => {
    for (const feeling of FEELINGS) {
      expect(sense.centers[feeling]).toHaveLength(SPACE + FEELINGS.length)
      expect(Math.hypot(...sense.centers[feeling])).toBeCloseTo(1, 5)
    }
    expect(sense.scale).toBeGreaterThan(0)
  })

  it('reads every vector from the middle of the anchors: what they all share is taken away', () => {
    expect(sense.middle).toHaveLength(SPACE + FEELINGS.length)
    // A point the anchors all lean towards: added to a vector, it changes nothing of how it is read.
    const laugh = point('She laughs out loud, her whole face bright with happiness.')
    const pushed = laugh.map((value, index) => value + 0.4 * sense.middle[index]!)
    const direct = senseMood(sense, [{ vector: laugh, place: 1 }])
    const shifted = senseMood(sense, [{ vector: pushed, place: 1 }])
    expect(direct.mood).toBe('joy')
    expect(shifted.mood).toBe('joy')
    // Seen from the middle, a vector has length 1 whatever its own.
    expect(Math.hypot(...from(sense.middle, laugh.map((value) => value * 7)))).toBeCloseTo(1, 5)
  })

  it('refuses vectors that are not what was asked for', () => {
    const vectors = anchorList().map((anchor) => point(anchor.text))
    expect(() => buildSense(vectors.slice(1))).toThrow(/vectors/)
    expect(() => buildSense([...vectors.slice(1), [1, 0]])).toThrow()
    expect(() => buildSense(vectors.map((vector, index) => (index === 3 ? vector.map(() => Number.NaN) : vector)))).toThrow()
    expect(() => buildSense([])).toThrow()
  })

  it('shows nothing with a model that tells no mood from another', () => {
    const flat = buildSense(anchorList().map(() => [1, 0, 0]))
    expect(flat.scale).toBe(0)
    expect(senseMood(flat, [{ vector: [1, 0, 0], place: 1 }]).mood).toBeNull()
  })
})

describe('cutting a reply', () => {
  it('gives its sentences, without the asterisks, and where each is', () => {
    const pieces = cutReply('*Mara blushes and looks away.* "I... I did not mean it like that."')
    expect(pieces.map((piece) => piece.text)).toEqual(['Mara blushes and looks away.', '"I... I did not mean it like that."'])
    expect(pieces[0]!.place).toBeLessThan(pieces[1]!.place)
    expect(pieces[1]!.place).toBeLessThanOrEqual(1)
  })

  it('joins what is too short to say anything alone', () => {
    expect(cutReply('"No." *She crosses her arms and turns to the window.* "Never."').map((piece) => piece.text)).toEqual([
      '"No." She crosses her arms and turns to the window. "Never."',
    ])
    expect(cutReply('Hm.').map((piece) => piece.text)).toEqual(['Hm.'])
    expect(cutReply('')).toEqual([])
    expect(cutReply('...')).toEqual([])
  })

  it('keeps the last sentences of a long reply', () => {
    const reply = Array.from({ length: 10 }, (_, index) => `This is sentence number ${index + 1} of the reply.`).join(' ')
    const pieces = cutReply(reply)
    expect(pieces).toHaveLength(6)
    expect(pieces[0]!.text).toContain('number 5 ')
    expect(pieces.at(-1)!.text).toContain('number 10 ')
  })

  it('leaves out what is told of the user, and keeps what is said to them', () => {
    const told = cutReply('*You laugh, and the sound fills the room.* "You came back for the map?" *She folds it away.*').map((piece) => piece.text)
    expect(told.join(' ')).not.toContain('You laugh')
    expect(told.join(' ')).toContain('"You came back for the map?"')

    const named = cutReply('*Ren blushes and looks at the floor in silence.* *She pours the tea without a word.*', 'Ren').map((piece) => piece.text)
    expect(named).toEqual(['She pours the tea without a word.'])
    // Without knowing who Ren is, it is a character like another.
    expect(cutReply('*Ren blushes and looks at the floor in silence.*')).toHaveLength(1)

    // Without asterisks, the quotes say what is said: the second sentence of a line is still said.
    const plain = cutReply('You step into the room and look around. "You are late. You always are, and I always wait," she says.').map((piece) => piece.text)
    expect(plain.join(' ')).not.toContain('You step')
    expect(plain.join(' ')).toContain('You always are')
  })

  it('takes a reply with no quotes and no asterisks for someone talking', () => {
    const pieces = cutReply('You scared me half to death! Your letter never came, and I thought the worst.').map((piece) => piece.text)
    expect(pieces.join(' ')).toContain('You scared me half to death!')
    expect(pieces.join(' ')).toContain('Your letter never came')
  })

  it('is not turned around by asterisks around one word, or by a mark left open', () => {
    // A word stressed inside what is said: the quotes still say what is said.
    const stressed = cutReply('"I *really* missed this place, more than I can say." You smile back at her warmly.').map((piece) => piece.text)
    expect(stressed.join(' ')).toContain('missed this place')
    expect(stressed.join(' ')).not.toContain('You smile back')

    // An asterisk never closed: the next paragraph starts afresh.
    const open = cutReply('*She pours the tea and sits down\nYou came all this way for nothing, I am afraid.\n*You tremble all over as she speaks.*').map((piece) => piece.text)
    expect(open.join(' ')).toContain('You came all this way')
    expect(open.join(' ')).not.toContain('You tremble')
  })

  it('reads German quotes, which close with the mark English opens with', () => {
    const pieces = cutReply('„Du bist wirklich gekommen, nach all den Jahren.“ Du lächelst sie an und sagst kein Wort. „Setz dich doch bitte zu mir.“', 'Du').map((piece) => piece.text)
    expect(pieces.join(' ')).toContain('Du bist wirklich gekommen')
    expect(pieces.join(' ')).not.toContain('Du lächelst')
    expect(pieces.join(' ')).toContain('Setz dich')
  })

  it('knows where a sentence ends in Japanese too', () => {
    const pieces = cutReply('*彼女は声をあげて笑い、顔を輝かせた。本当に嬉しそうに、何度も何度も手を叩いている。*「来てくれたんだ！ずっと待っていたんだよ、本当に、本当に嬉しい！」')
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    expect(pieces.at(-1)!.text.endsWith('嬉しい！」')).toBe(true)
  })

  it('takes the end of a paragraph that never stops', () => {
    const [piece] = cutReply(`${'and then she walked on and on '.repeat(40)}until she laughed`)
    expect(piece!.text.length).toBe(400)
    expect(piece!.text.endsWith('until she laughed')).toBe(true)
  })
})

describe('the mood of a reply, by what it means', () => {
  it('finds the mood whose anchors the reply is closest to', () => {
    const cases: [Feeling, string][] = [
      ['love', '*She gazes at him with such warmth and devotion, cherishing the moment.*'],
      ['sigh', '*He rubs his temples; his patience is running out.* "Whatever. I give up."'],
      ['fear', '"Stay away! Please, we have to run!" *She is backing away, terrified, from the thing in the dark.*'],
      ['thinking', '*She falls silent, pondering the problem, weighing the options.*'],
    ]
    for (const [mood, text] of cases) expect(read(text).mood, text).toBe(mood)
  })

  it('shows nothing for a reply that shows no feeling', () => {
    expect(read('"The harbour is two streets down. Turn left at the fountain."').mood).toBeNull()
    expect(read('*She opens the ledger, counts the crates and writes the numbers down.*').mood).toBeNull()
    expect(read('').mood).toBeNull()
  })

  it('still says which mood was closest, and by how much, when it shows none', () => {
    const reading = read('"The meeting is at noon." *He nods and gets on with his work.*')
    expect(reading.mood).toBeNull()
    expect(reading.best).not.toBeNull()
    expect(reading.strength).toBeLessThan(0.5)
  })

  it('goes by how the reply ends when two moods are as clear', () => {
    // A sentence that is all tears, another that is all laughter: the very middle of each mood.
    const sad = back(sense.centers.sad)
    const joy = back(sense.centers.joy)
    expect(senseMood(sense, [{ vector: sad, place: 0.1 }, { vector: joy, place: 0.9 }]).mood).toBe('joy')
    expect(senseMood(sense, [{ vector: joy, place: 0.1 }, { vector: sad, place: 0.9 }]).mood).toBe('sad')
  })

  it('does not choose between two moods that are neck and neck', () => {
    const vector = back(sense.centers.joy.map((value, index) => value + sense.centers.playful[index]!))
    const reading = senseMood(sense, [{ vector, place: 1 }])
    expect(Math.abs(reading.strength - reading.nextStrength)).toBeLessThan(0.1)
    expect(reading.mood).toBeNull()
  })

  it('does not read vectors of another size than the anchors, or that are not numbers', () => {
    expect(senseMood(sense, [{ vector: [1, 0, 0], place: 1 }]).mood).toBeNull()
    const joy = back(sense.centers.joy)
    const broken = joy.map(() => Number.NaN)
    expect(senseMood(sense, [{ vector: broken, place: 1 }])).toMatchObject({ mood: null, best: null })
    expect(senseMood(sense, [{ vector: joy, place: Number.NaN }]).mood).toBeNull()
    // One broken sentence does not take the others with it.
    expect(senseMood(sense, [{ vector: joy, place: 1 }, { vector: broken, place: 1 }]).mood).toBe('joy')
  })
})

describe('the words and the meaning together', () => {
  const meaning = (mood: SenseReading['mood'], strengths: SenseReading['strengths'] = mood ? { [mood]: 1 } : {}): SenseReading => ({
    mood,
    best: mood,
    strength: 1,
    next: null,
    nextStrength: 0,
    strengths,
  })

  it('believes a telling word first', () => {
    expect(settleMood('shy', meaning('joy', { joy: 1, shy: 0.2 }))).toEqual({ mood: 'shy', by: 'words' })
    expect(settleMood('shy', null)).toEqual({ mood: 'shy', by: 'words' })
    // Nothing could be read by meaning (every sentence was about the user, say): the word stands.
    expect(settleMood('shy', meaning(null))).toEqual({ mood: 'shy', by: 'words' })
  })

  it('drops a word-read mood the meaning finds no trace of', () => {
    // "You burst into tears": the word is there, no sentence of the character's is sad.
    expect(settleMood('sad', meaning(null, { sad: -0.9, joy: -0.4 }))).toEqual({ mood: null, by: null })
    expect(settleMood('sad', meaning(null, { sad: 0 }))).toEqual({ mood: 'sad', by: 'words' })
    // And what the meaning reads clearly instead is shown.
    expect(settleMood('sad', meaning('joy', { sad: -0.3, joy: 1.2 }))).toEqual({ mood: 'joy', by: 'meaning' })
  })

  it('says how clear a case of each mood a reply is', () => {
    const reading = read('*She laughs out loud, her whole face bright with happiness.*')
    expect(reading.strengths.joy).toBe(reading.strength)
    expect(Object.keys(reading.strengths)).toHaveLength(MOODS.length)
    expect(read('').strengths).toEqual({})
  })

  it('lets the meaning speak where the words are silent', () => {
    expect(settleMood(null, meaning('sigh'))).toEqual({ mood: 'sigh', by: 'meaning' })
    expect(settleMood(null, meaning(null))).toEqual({ mood: null, by: null })
    expect(settleMood(null, null)).toEqual({ mood: null, by: null })
  })
})
