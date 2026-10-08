import { LORE_MEANING, loreScores, pickByMeaning, type LoreForm, type LoreMeaningSettings, type LoreMethod } from '@core/prompt/loreMeaning'
import type { LoreCase } from './cases'

// The report of a lorebook trial: from the vectors kept, every way of calling notes by
// meaning is tried (what of a note is read, how a score is made, how many messages back,
// from which score up), with the app's own functions (src/core/prompt/loreMeaning.ts).
// Used by lore.lab.ts after asking the model, and by replay.lab.ts without it.

export const FORMS: readonly LoreForm[] = ['content', 'keys', 'both']
export const METHODS: readonly LoreMethod[] = ['raw', 'margin']
export const DEPTHS: readonly number[] = [1, 2, 3]
const THRESHOLDS: Record<LoreMethod, number[]> = {
  raw: range(0.3, 0.8, 0.025),
  margin: range(0.02, 0.3, 0.01),
}

/** lore-vectors.json */
export interface LoreTrial {
  made: string
  model: string
  ollama: string
  platform: string
  what: string
  /** The first question, the model loading: ms. */
  cold: number
  /** The latest messages of a case, once loaded: ms. */
  cost: number
  cards: {
    id: string
    name: string
    entries: {
      label: string
      /** Sent always, switched off or empty: the meaning never calls it. */
      candidate: boolean
      /** The text of the note in each form, as an index in `texts`. */
      forms: Record<LoreForm, number>
    }[]
  }[]
  cases: (LoreCase & {
    /** The sentences of its latest messages (as many as the deepest try reads), as indexes in `texts`. */
    pieces: { index: number; age: number }[]
    /** The notes its keywords call, as the app reads them. */
    keyed: string[]
  })[]
  texts: string[]
  vectors: number[][]
}

interface Outcome {
  settings: LoreMeaningSettings
  /** Notes to call that the keywords miss, and how many of them the meaning calls. */
  needed: number
  found: number
  /** Notes the meaning calls that it should not, and how many in the lines that call nothing. */
  wrong: number
  wrongQuiet: number
  /** Per case: what the meaning adds, with scores. */
  calls: { label: string; score: number }[][]
}

function run(trial: LoreTrial, settings: LoreMeaningSettings): Outcome {
  let needed = 0
  let found = 0
  let wrong = 0
  let wrongQuiet = 0
  const calls: Outcome['calls'] = []
  for (const item of trial.cases) {
    const card = trial.cards.find((each) => each.id === item.card)!
    const candidates = card.entries.filter((entry) => entry.candidate)
    const pieces = item.pieces.filter((piece) => piece.age < settings.depth).map((piece) => trial.vectors[piece.index]!)
    const scores = loreScores(
      candidates.map((entry) => trial.vectors[entry.forms[settings.form]]!),
      pieces,
      settings.method,
    )
    const keyed = new Set(candidates.flatMap((entry, index) => (item.keyed.includes(entry.label) ? [index] : [])))
    const added = pickByMeaning(scores, settings, keyed).map((call) => ({ label: candidates[call.index]!.label, score: call.score }))
    calls.push(added)

    const missing = item.expect.filter((label) => !item.keyed.includes(label))
    needed += missing.length
    found += missing.filter((label) => added.some((call) => call.label === label)).length
    const extra = added.filter((call) => !item.expect.includes(call.label)).length
    wrong += extra
    if (item.kind === 'none' || item.kind === 'near') wrongQuiet += extra
  }
  return { settings, needed, found, wrong, wrongQuiet, calls }
}

/** Better first: more notes found, each wrong one counting as two missed. */
const rank = (outcome: Outcome): number => outcome.found - 2 * outcome.wrong

export function writeReport(trial: LoreTrial): string {
  const outcomes: Outcome[] = []
  for (const form of FORMS) {
    for (const method of METHODS) {
      for (const depth of DEPTHS) {
        for (const threshold of THRESHOLDS[method]) {
          outcomes.push(run(trial, { form, method, depth, threshold, most: LORE_MEANING.most }))
        }
      }
    }
  }
  const now = run(trial, LORE_MEANING)
  const sorted = [...outcomes].sort((a, b) => rank(b) - rank(a) || a.wrong - b.wrong)
  const best = sorted[0]!
  const describe = (settings: LoreMeaningSettings): string =>
    `${settings.form}, ${settings.method}, ${settings.depth} message${settings.depth > 1 ? 's' : ''}, from ${settings.threshold.toFixed(3)}`
  const row = (outcome: Outcome, mark = ''): string =>
    `| ${outcome.settings.form} | ${outcome.settings.method} | ${outcome.settings.depth} | ${outcome.settings.threshold.toFixed(3)} | ${outcome.found}/${outcome.needed} | ${outcome.wrong} | ${outcome.wrongQuiet} |${mark}`

  const keyedRight = trial.cases.filter((item) => item.kind === 'keyed' && item.expect.every((label) => item.keyed.includes(label))).length
  const keyedAll = trial.cases.filter((item) => item.kind === 'keyed').length
  const leaks = trial.cases.filter((item) => item.kind !== 'keyed' && item.keyed.length > 0)

  const lines = [
    '# Lorebook notes called by meaning',
    '',
    `- Vectors made: ${trial.made}, by ${trial.model} through ${trial.what} (Ollama ${trial.ollama}), on ${trial.platform}`,
    `- First question (the model loads, unless it already was): ${trial.cold} ms. The latest messages of a case afterwards: about ${trial.cost} ms.`,
    `- ${trial.cases.length} cases on the notes of ${trial.cards.length} stories (lab/lore/cases.ts). At most ${LORE_MEANING.most} notes called by meaning per reply.`,
    `- The keywords alone call the notes of ${keyedRight} of the ${keyedAll} "keyed" cases.${leaks.length ? ` They also call something in ${leaks.length} other case(s): ${leaks.map((item) => `"${item.messages.at(-1)}" (${item.keyed.join(', ')})`).join('; ')}.` : ''}`,
    '',
    '## The app today',
    '',
    `${describe(LORE_MEANING)}: finds **${now.found} of the ${now.needed}** notes the keywords miss, calls **${now.wrong}** it should not (${now.wrongQuiet} of them in lines that call nothing).`,
    '',
    `Best of every way tried: ${describe(best.settings)}: ${best.found}/${best.needed} found, ${best.wrong} wrong (${best.wrongQuiet} in lines that call nothing).`,
    '',
    '## The best ways',
    '',
    '"Found": notes the keywords miss and the meaning calls. "Wrong": notes it calls and should not; "quiet": of those, in lines that should call nothing.',
    '',
    '| Read of a note | Score | Messages | From | Found | Wrong | Wrong, quiet |',
    '|---|---|---|---|---|---|---|',
    ...sorted.slice(0, 25).map((outcome) => row(outcome)),
    '',
    '## Each way, at its best threshold',
    '',
    '| Read of a note | Score | Messages | From | Found | Wrong | Wrong, quiet |',
    '|---|---|---|---|---|---|---|',
    ...FORMS.flatMap((form) =>
      METHODS.flatMap((method) =>
        DEPTHS.map((depth) => sorted.find((outcome) => outcome.settings.form === form && outcome.settings.method === method && outcome.settings.depth === depth)!),
      ),
    ).map((outcome) => row(outcome)),
    '',
    `## How far apart, with ${LORE_MEANING.form}, ${LORE_MEANING.method}, ${LORE_MEANING.depth} messages`,
    '',
    'For each case: the score of each note it should call, and the best score of a note it should not. A threshold works where the first stay above the second.',
    '',
    ...scoreSpread(trial, LORE_MEANING),
    '',
    `## Every case, the app today (${describe(LORE_MEANING)})`,
    '',
    ...everyCase(trial, now),
    '',
    `## Every case, the best way (${describe(best.settings)})`,
    '',
    ...everyCase(trial, best),
  ]
  return `${lines.join('\n')}\n`
}

function scoreSpread(trial: LoreTrial, settings: LoreMeaningSettings): string[] {
  const right: number[] = []
  const otherBest: number[] = []
  for (const item of trial.cases) {
    const card = trial.cards.find((each) => each.id === item.card)!
    const candidates = card.entries.filter((entry) => entry.candidate)
    const pieces = item.pieces.filter((piece) => piece.age < settings.depth).map((piece) => trial.vectors[piece.index]!)
    const scores = loreScores(candidates.map((entry) => trial.vectors[entry.forms[settings.form]]!), pieces, settings.method)
    candidates.forEach((entry, index) => {
      if (item.expect.includes(entry.label) && !item.keyed.includes(entry.label)) right.push(scores[index]!)
    })
    const others = candidates.map((entry, index) => (item.expect.includes(entry.label) ? -Infinity : scores[index]!))
    otherBest.push(Math.max(...others))
  }
  const stats = (values: number[]): string => {
    const sorted = [...values].sort((a, b) => a - b)
    const at = (share: number): string => (sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? NaN).toFixed(3)
    return `lowest ${at(0)}, quarter ${at(0.25)}, middle ${at(0.5)}, three quarters ${at(0.75)}, highest ${at(0.999)}`
  }
  return [
    `- Notes it should call (${right.length}): ${stats(right)}`,
    `- Best note it should not call, per case (${otherBest.length}): ${stats(otherBest)}`,
  ]
}

function everyCase(trial: LoreTrial, outcome: Outcome): string[] {
  return trial.cases.map((item, index) => {
    const added = outcome.calls[index]!
    const missing = item.expect.filter((label) => !item.keyed.includes(label) && !added.some((call) => call.label === label))
    const extra = added.filter((call) => !item.expect.includes(call.label))
    const mark = missing.length === 0 && extra.length === 0 ? 'ok' : [missing.length ? `missed ${missing.join(', ')}` : '', extra.length ? `wrong ${extra.map((call) => call.label).join(', ')}` : ''].filter(Boolean).join('; ')
    const said = added.map((call) => `${call.label} ${call.score.toFixed(3)}`).join(', ') || 'nothing'
    return `- **${mark}** · ${item.card}, ${item.kind} · "${item.messages.at(-1)}" · expected ${item.expect.join(', ') || 'nothing'} · keywords ${item.keyed.join(', ') || 'nothing'} · meaning ${said}`
  })
}

function range(from: number, to: number, step: number): number[] {
  const values: number[] = []
  for (let value = from; value <= to + 1e-9; value += step) values.push(Math.round(value * 1000) / 1000)
  return values
}
