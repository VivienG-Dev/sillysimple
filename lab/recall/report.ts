import type { LoreMethod } from '@core/prompt/loreMeaning'
import { nameBonuses, pickRecalls, RECALL, recallExchange, type RecallForm, type RecallPassage, type RecallSettings } from '@core/prompt/recall'
import { CHATS, type RecallCase } from './cases'

// The report of an exact-memory trial: from the vectors kept, every way of bringing old
// messages back is tried (what of a message is read, how a score is made, how many latest
// messages are read, from which score up, how many at most), with the app's own functions
// (src/core/prompt/recall.ts), as the app does them: with the name bonus, and an old
// message counting as found when it or the other message of its exchange is one expected.
// Used by recall.lab.ts after asking the model, and by
// replay.lab.ts without it.

export const FORMS: readonly RecallForm[] = ['message', 'pair', 'sentence']
export const METHODS: readonly LoreMethod[] = ['raw', 'margin']
export const DEPTHS: readonly number[] = [1, 2]
const MOSTS: readonly number[] = [1, 2]
const THRESHOLDS: Record<LoreMethod, number[]> = {
  raw: range(0.6, 0.95, 0.005),
  margin: range(0.03, 0.25, 0.005),
}

/** recall-vectors.json */
export interface RecallTrial {
  made: string
  model: string
  ollama: string
  platform: string
  what: string
  /** Every old message of a long chat at once, the model loaded: ms, and how many texts that was. */
  bulk: { ms: number; texts: number }
  /** The latest messages of a case: ms. */
  cost: number
  chats: {
    id: string
    old: string[]
    /** Per form, its passages, with the place of their text in `texts`. */
    passages: Record<RecallForm, (RecallPassage & { index: number })[]>
    cases: (RecallCase & { pieces: { index: number; age: number }[] })[]
  }[]
  texts: string[]
  vectors: number[][]
}

interface Outcome {
  settings: RecallSettings
  /** Cases that should bring something back, and how many brought back one of the right messages. */
  needed: number
  found: number
  /** Old messages brought back in lines that should bring nothing. */
  wrongQuiet: number
  /** Wrong old messages brought back along with, or instead of, the right one. */
  noise: number
  calls: { message: number; score: number; right: boolean }[][]
}

function run(trial: RecallTrial, settings: RecallSettings): Outcome {
  let needed = 0
  let found = 0
  let wrongQuiet = 0
  let noise = 0
  const calls: Outcome['calls'] = []
  for (const chat of trial.chats) {
    const passages = chat.passages[settings.form]
    const passageVectors = passages.map((passage) => trial.vectors[passage.index]!)
    const people = CHATS.find((each) => each.id === chat.id)
    const roles = chat.old.map((_, index) => (index % 2 === 0 ? ('user' as const) : ('assistant' as const)))
    for (const item of chat.cases) {
      const pieces = item.pieces.filter((piece) => piece.age < settings.depth).map((piece) => trial.vectors[piece.index]!)
      const bonus = nameBonuses(chat.old, item.messages.slice(-settings.depth), people ? [people.character, people.user] : [])
      const picked = pickRecalls(passages, passageVectors, pieces, settings, 8192, bonus).map((call) => ({
        message: call.message,
        score: call.score,
        right: recallExchange(call.message, roles).some((at) => item.expect.includes(at)),
      }))
      calls.push(picked)
      const wrong = picked.filter((call) => !call.right).length
      if (item.expect.length > 0) {
        needed++
        if (picked.some((call) => call.right)) found++
        noise += wrong
      } else wrongQuiet += wrong
    }
  }
  return { settings, needed, found, wrongQuiet, noise, calls }
}

/** Better first: more moments found; a message brought back in a quiet line counts as two missed, a wrong one alongside as half. */
const rank = (outcome: Outcome): number => outcome.found - 2 * outcome.wrongQuiet - 0.5 * outcome.noise

export function writeReport(trial: RecallTrial): string {
  const outcomes: Outcome[] = []
  for (const form of FORMS)
    for (const method of METHODS)
      for (const depth of DEPTHS)
        for (const most of MOSTS) for (const threshold of THRESHOLDS[method]) outcomes.push(run(trial, { form, method, depth, threshold, most }))
  const now = run(trial, RECALL)
  const sorted = [...outcomes].sort((a, b) => rank(b) - rank(a) || a.noise - b.noise)
  const best = sorted[0]!
  const describe = (s: RecallSettings): string =>
    `${s.form}, ${s.method}, ${s.depth} message${s.depth > 1 ? 's' : ''}, from ${s.threshold.toFixed(3)}, ${s.most} at most`
  const sum = (o: Outcome): string => `${o.found}/${o.needed} found, ${o.wrongQuiet} in quiet lines, ${o.noise} wrong alongside`
  const row = (o: Outcome): string =>
    `| ${o.settings.form} | ${o.settings.method} | ${o.settings.depth} | ${o.settings.most} | ${o.settings.threshold.toFixed(3)} | ${o.found}/${o.needed} | ${o.wrongQuiet} | ${o.noise} |`
  const header = ['| Read of a message | Score | Messages | At most | From | Found | Quiet, wrong | Wrong alongside |', '|---|---|---|---|---|---|---|---|']
  const cases = trial.chats.reduce((total, chat) => total + chat.cases.length, 0)
  const oldCount = trial.chats.reduce((total, chat) => total + chat.old.length, 0)

  const lines = [
    '# Old moments brought back by meaning',
    '',
    `- Vectors made: ${trial.made}, by ${trial.model} through ${trial.what} (Ollama ${trial.ollama}), on ${trial.platform}`,
    `- Every passage of a long chat at once (${trial.bulk.texts} texts): ${trial.bulk.ms} ms. The latest messages of a case: about ${trial.cost} ms.`,
    `- ${trial.chats.length} chats, ${oldCount} old messages, ${cases} later lines (lab/recall/cases.ts).`,
    '',
    '## The app today',
    '',
    `${describe(RECALL)}: ${sum(now)}.`,
    '',
    `Best of every way tried: ${describe(best.settings)}: ${sum(best)}.`,
    '',
    '## The best ways',
    '',
    '"Found": lines that come back to an old moment and bring back one of its messages. "Quiet, wrong": messages brought back in lines that should bring nothing. "Wrong alongside": a wrong message brought back in a line that should bring one.',
    '',
    ...header,
    ...sorted.slice(0, 25).map(row),
    '',
    '## Each way, at its best threshold',
    '',
    ...header,
    ...FORMS.flatMap((form) =>
      METHODS.flatMap((method) =>
        DEPTHS.flatMap((depth) =>
          MOSTS.map((most) =>
            sorted.find((o) => o.settings.form === form && o.settings.method === method && o.settings.depth === depth && o.settings.most === most)!,
          ),
        ),
      ),
    ).map(row),
    '',
    `## Every case, the app today (${describe(RECALL)})`,
    '',
    ...everyCase(trial, now),
    '',
    `## Every case, the best way (${describe(best.settings)})`,
    '',
    ...everyCase(trial, best),
  ]
  return `${lines.join('\n')}\n`
}

function everyCase(trial: RecallTrial, outcome: Outcome): string[] {
  let at = 0
  return trial.chats.flatMap((chat) =>
    chat.cases.map((item) => {
      const picked = outcome.calls[at++]!
      const right = picked.some((call) => call.right)
      const wrong = picked.filter((call) => !call.right)
      const mark =
        item.expect.length === 0
          ? wrong.length
            ? 'wrong'
            : 'ok'
          : right
            ? wrong.length
              ? 'found, with a wrong one'
              : 'ok'
            : wrong.length
              ? 'missed, wrong instead'
              : 'missed'
      const said = picked.map((call) => `#${call.message} ${call.score.toFixed(3)}`).join(', ') || 'nothing'
      return `- **${mark}** · ${chat.id}, ${item.kind} · "${item.messages.at(-1)}" · expected ${item.expect.map((n) => `#${n}`).join(' or ') || 'nothing'} · brought ${said}`
    }),
  )
}

function range(from: number, to: number, step: number): number[] {
  const values: number[] = []
  for (let value = from; value <= to + 1e-9; value += step) values.push(Math.round(value * 1000) / 1000)
  return values
}
