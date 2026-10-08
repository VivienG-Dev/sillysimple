import { detectMood, MOODS, type Mood } from '@core/mood/detectMood'
import { anchorList, buildSense, cutReply, ENOUGH, LEAD, senseMood, settleMood, type Feeling, type Sense } from '@core/mood/senseMood'
import { REPLIES, type LabReply } from './replies'

// What a trial found, and the report made of it. The same code reads a trial just run
// (mood.lab.ts) and one that was kept (replay.lab.ts): the vectors are what costs a
// model, everything after them is arithmetic that can be done again at will.

/**
 * What may be written before each text. The app writes nothing ("bare"): the trial of
 * 7 October 2026 read these replies worse with either of the model's own task prefixes.
 * The three are kept in the vectors so that this can be looked at again with another model.
 */
export const BEFORE = {
  bare: '',
  classification: 'task: classification | query: ',
  similarity: 'task: sentence similarity | query: ',
} as const
export type Variant = keyof typeof BEFORE
/** The one the app uses. */
export const APP_VARIANT: Variant = 'bare'

/** mood-vectors.json */
export interface Trial {
  made: string
  model: string
  ollama: string
  platform: string
  /** Which Ollama answered. */
  what?: string
  /** How long the first question took, and one reply afterwards, in milliseconds. */
  cold?: number
  cost?: number
  before: Record<string, string>
  /** Every text that was asked about, once each. */
  texts: string[]
  anchors: { feeling: Feeling; index: number }[]
  named: { feeling: Feeling; index: number }[]
  replies: { kind: LabReply['kind']; mood: Mood | null; user: string | null; text: string; words: Mood | null; pieces: { index: number; place: number }[]; whole: number }[]
  /** For each way of writing the texts, one vector per text. */
  vectors: Record<string, number[][]>
}

interface Reading {
  reply: LabReply
  words: Mood | null
  pieces: { vector: number[]; place: number }[]
  meaning: ReturnType<typeof senseMood>
  together: ReturnType<typeof settleMood>
}

/**
 * Reads the lab's replies with the vectors of a trial, the way the app does today: its
 * anchors, its way of cutting a reply, its thresholds. Throws when the trial does not
 * hold a text that is needed now (an anchor was changed, a reply added, the cutting
 * changed): the model has to be asked again.
 */
export function readTrial(trial: Trial): { sense: Sense; readings: Reading[] } {
  const vectors = trial.vectors[APP_VARIANT]
  if (!vectors) throw new Error(`This trial has no vectors for "${APP_VARIANT}" texts. Run pnpm mood:lab again.`)
  const indexOf = new Map(trial.texts.map((text, index) => [text, index]))
  const vectorOf = (text: string): number[] => {
    const index = indexOf.get(text)
    if (index === undefined) throw new Error(`This trial was made before a change: it has no vector for "${text.slice(0, 60)}". Run pnpm mood:lab again.`)
    return vectors[index]!
  }

  const sense = buildSense(anchorList().map((anchor) => vectorOf(anchor.text)))
  const readings = REPLIES.map((reply) => {
    const words = detectMood(reply.text, { userName: reply.user })
    const pieces = cutReply(reply.text, reply.user).map((piece) => ({ vector: vectorOf(piece.text), place: piece.place }))
    const meaning = senseMood(sense, pieces)
    return { reply, words, pieces, meaning, together: settleMood(words, meaning) }
  })
  return { sense, readings }
}

export function writeReport(trial: Trial): string {
  const { sense, readings } = readTrial(trial)
  const lines: string[] = []
  const out = (line = ''): void => void lines.push(line)
  const percent = (right: number, all: number): string => (all === 0 ? '-' : `${right}/${all} (${Math.round((right / all) * 100)}%)`)

  out('# Reading moods: the word lists and the embedding model')
  out()
  out(`- Vectors made: ${trial.made}, by ${trial.model}${trial.what ? ` through ${trial.what}` : ''} (Ollama ${trial.ollama}), on ${trial.platform}`)
  if (trial.cold !== undefined) out(`- First question (the model loads into memory, unless it already was): ${trial.cold} ms. One reply afterwards: about ${trial.cost} ms.`)
  out(`- Read as the app reads today: nothing written before a text, ${anchorList().length} anchors, scale ${sense.scale.toFixed(4)}`)
  out(`- Shown when: clear enough (${ENOUGH}) and ahead of the next mood (${LEAD})`)
  out()

  out('## How many replies are read right')
  out()
  out('"Right" is the mood expected, or nothing where nothing is expected.')
  out()
  out('| Kind | Replies | Words | Meaning | Both together |')
  out('|---|---|---|---|---|')
  const kinds = [...new Set(readings.map((reading) => reading.reply.kind))]
  const row = (name: string, list: Reading[]): void =>
    out(
      `| ${name} | ${list.length} | ${percent(list.filter((item) => item.words === item.reply.mood).length, list.length)} | ${percent(
        list.filter((item) => item.meaning.mood === item.reply.mood).length,
        list.length,
      )} | ${percent(list.filter((item) => item.together.mood === item.reply.mood).length, list.length)} |`,
    )
  for (const kind of kinds) row(kind, readings.filter((reading) => reading.reply.kind === kind))
  row('**all**', readings)
  out()

  // What matters most once the words come first: what the meaning adds where they are silent.
  const felt = readings.filter((reading) => reading.reply.mood !== null)
  const silent = felt.filter((reading) => reading.words === null)
  const shown = (list: Reading[]): Reading[] => list.filter((item) => item.meaning.mood !== null)
  const right = (list: Reading[]): Reading[] => list.filter((item) => item.meaning.mood === item.reply.mood)
  out(`Where a feeling is shown and no word tells it (${silent.length} replies), the meaning shows a mood for ${shown(silent).length} and has it right for ${right(silent).length}.`)
  out(`Over every reply that shows a feeling (${felt.length}), it shows a mood for ${shown(felt).length} and has it right for ${right(felt).length}.`)
  const quiet = readings.filter((reading) => reading.reply.mood === null)
  out(
    `A mood shown where there is none (${quiet.length} replies): words ${quiet.filter((item) => item.words).length}, meaning ${quiet.filter((item) => item.meaning.mood).length}, together ${quiet.filter((item) => item.together.mood).length}.`,
  )
  out()

  out('## Other thresholds')
  out()
  out('The same replies for other values of "clear enough" and of the lead. "Shown / right" is by meaning alone, over the replies that show a feeling.')
  out()
  out('| Clear enough | Lead | Shown / right | Where no word tells: shown / right | Shown where there is none | Together right |')
  out('|---|---|---|---|---|---|')
  for (const enough of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9]) {
    for (const lead of [0.05, 0.1, 0.15]) {
      const again = readings.map((item) => {
        const meaning = senseMood(sense, item.pieces, enough, lead).mood
        return { expected: item.reply.mood, words: item.words, meaning, together: settleMood(item.words, { ...item.meaning, mood: meaning }).mood }
      })
      const feeling = again.filter((item) => item.expected !== null)
      const wordless = feeling.filter((item) => item.words === null)
      const count = (list: typeof again): string => `${list.filter((item) => item.meaning !== null).length} / ${list.filter((item) => item.meaning === item.expected).length}`
      out(
        `| ${enough} | ${lead}${enough === ENOUGH && lead === LEAD ? ' (now)' : ''} | ${count(feeling)} | ${count(wordless)} | ${again.filter((item) => item.expected === null && item.meaning).length} | ${percent(
          again.filter((item) => item.together === item.expected).length,
          again.length,
        )} |`,
      )
    }
  }
  out()

  out('## What each mood is taken for, by meaning alone')
  out()
  out('| Expected | Right | Taken for |')
  out('|---|---|---|')
  for (const mood of [...MOODS, null]) {
    const list = readings.filter((reading) => reading.reply.mood === mood)
    if (list.length === 0) continue
    const others = new Map<string, number>()
    for (const item of list) if (item.meaning.mood !== mood) others.set(item.meaning.mood ?? 'nothing', (others.get(item.meaning.mood ?? 'nothing') ?? 0) + 1)
    out(`| ${mood ?? 'nothing'} | ${percent(list.filter((item) => item.meaning.mood === mood).length, list.length)} | ${[...others].map(([name, count]) => `${name} ${count}`).join(', ') || '-'} |`)
  }
  out()

  out('## Every reply')
  out()
  out('| | Kind | Expected | Words | Meaning (closest, how clear, then the next) | Together | Reply |')
  out('|---|---|---|---|---|---|---|')
  for (const { reply, words, meaning, together } of readings) {
    const closest = meaning.best ? `${meaning.mood ? '**' : ''}${meaning.best} ${meaning.strength.toFixed(2)}${meaning.mood ? '**' : ''}, ${meaning.next ?? '-'} ${meaning.nextStrength.toFixed(2)}` : '-'
    out(
      `| ${together.mood === reply.mood ? 'ok' : 'MISS'} | ${reply.kind} | ${reply.mood ?? 'nothing'} | ${words ?? '-'} | ${closest} | ${together.mood ?? '-'} | ${reply.text.replace(/\|/g, '/').slice(0, 110)} |`,
    )
  }
  out()
  return lines.join('\n')
}
