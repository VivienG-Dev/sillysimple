import { readScene } from '@core/prompt/place'
import type { LabScene } from './scenes'

// Judging what the model answered, and the report made of a trial. The same code reads a
// trial just run (scene.lab.ts) and one that was kept (replay.lab.ts): asking is what
// costs a model, reading its answers again with the app's reader of today costs nothing.

export interface Answer {
  way: string
  /** The answer, as the model wrote it. */
  raw: string
  ms: number
  /** What the app would keep: what it read, or else what it knew. */
  place: string | null
  outfit: string | null
  /** What it read in the answer, before falling back. */
  read: { place: string | null; outfit: string | null }
  placeRight: boolean
  outfitRight: boolean
}

/** scene-answers.json */
export interface Trial {
  made: string
  model: string
  ollama: string
  what: string
  /** Each way of asking, and what it is. */
  ways: Record<string, string>
  scenes: (LabScene & { answers: Pick<Answer, 'way' | 'raw' | 'ms'>[] })[]
  /** Whether a question asked apart costs the next reply (see scene.lab.ts). */
  memory?: { tokens: number; first: number; again: number; apart: number; back: number }
}

/** Whether `word` is in `text` as something worn: "no shoes", "gloves in her pocket" do not count. */
export function worn(text: string, word: string): boolean {
  const lower = text.toLowerCase()
  for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + 1)) {
    const before = lower.slice(Math.max(0, at - 28), at)
    const after = lower.slice(at + word.length, at + word.length + 28)
    const not =
      /\b(?:no|without|not wearing|minus|removed|took off|taken off|holding|carrying)\b[^,;]*$/.test(before) ||
      /^[^,;]*\b(?:off|removed|held|in (?:her|the|a) (?:pocket|hand|hands))\b/.test(after)
    if (!not) return true
  }
  return false
}

/** Reads an answer the way the app does today, and says whether what it would keep is right. */
export function judge(scene: LabScene, way: string, raw: string, ms: number): Answer {
  const read = readScene(raw)
  const place = read.place ?? scene.before.place
  const outfit = read.outfit ?? scene.before.outfit
  const wanted = scene.after
  const placeRight = wanted.place === null ? place === null : place !== null && wanted.place.some((word) => place.toLowerCase().includes(word))
  const outfitRight =
    wanted.outfit === null
      ? outfit === null
      : outfit !== null && wanted.outfit.has.every((names) => names.some((name) => worn(outfit, name))) && !(wanted.outfit.not ?? []).some((name) => worn(outfit, name))
  return { way, raw, ms, place, outfit, read, placeRight, outfitRight }
}

const flat = (text: string | null): string => (text === null ? '(nothing)' : text.replace(/\s*\n\s*/g, ' ⏎ ').replace(/\|/g, '/'))
const median = (list: number[]): number => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0

export function writeReport(trial: Trial): string {
  const ways = Object.keys(trial.ways)
  const scenes = trial.scenes.map((scene) => ({ scene, answers: scene.answers.map((answer) => judge(scene, answer.way, answer.raw, answer.ms)) }))
  const of = (list: typeof scenes, way: string): Answer[] => list.flatMap((item) => item.answers.filter((answer) => answer.way === way))
  /** The clothes are not what they were. */
  const changing = scenes.filter(({ scene }) => {
    const was = scene.before.outfit ?? ''
    return scene.after.outfit && (!was || scene.after.outfit.not?.some((name) => worn(was, name)) || scene.after.outfit.has.some((names) => !names.some((name) => worn(was, name))))
  })
  /** The place is not what it was. */
  const moving = scenes.filter(({ scene }) => scene.after.place && scene.before.place && !scene.after.place.some((word) => scene.before.place!.toLowerCase().includes(word)))
  const count = (answers: Answer[], right: (answer: Answer) => boolean): string => `${answers.filter(right).length}/${answers.length}`

  const lines: string[] = [
    '# Where the scene is, what the character wears: how the model answers',
    '',
    `${trial.made} · ${trial.model} · Ollama ${trial.ollama} (${trial.what})`,
    '',
    `${scenes.length} scenes, each asked in ${ways.length} ways. "Right" is judged on what the app would keep: what it reads in the answer, or else what it knew before.`,
    `The clothes change in ${changing.length} of the scenes and the place in ${moving.length}; in the others they must stay as they were.`,
    '',
    '| Way of asking | Clothes right | where they change | Place right | where it moves | Both right | Clothes not read | One answer |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...ways.map(
      (way) =>
        `| **${way}** | ${count(of(scenes, way), (answer) => answer.outfitRight)} | ${count(of(changing, way), (answer) => answer.outfitRight)} | ${count(of(scenes, way), (answer) => answer.placeRight)} | ${count(of(moving, way), (answer) => answer.placeRight)} | ${count(of(scenes, way), (answer) => answer.outfitRight && answer.placeRight)} | ${of(scenes, way).filter((answer) => answer.read.outfit === null).length} | ${median(of(scenes, way).map((answer) => answer.ms))} ms |`,
    ),
    '',
    'The judging is by words and can be wrong either way: the answers below are what to read.',
    '',
    'The ways:',
    '',
    ...ways.map((way) => `- **${way}**: ${trial.ways[way]}`),
  ]

  if (trial.memory) {
    const { tokens, first, again, apart, back } = trial.memory
    lines.push(
      '',
      '## Does a question asked apart cost the next reply?',
      '',
      `A conversation of about ${tokens} tokens, read for the first time: ${first} ms. Asked again with one more message, while the model still has it in memory: ${again} ms.`,
      `Then questions about other scenes, asked apart (${apart} ms in all), and the conversation again with one more message: **${back} ms**.`,
      back < (first + again) / 2
        ? 'The model still had the conversation in memory: a question asked apart does not make the next reply read everything again.'
        : 'The model had to read the conversation again: a question asked apart costs the next reply that much.',
    )
  }

  lines.push('', '## Every scene')
  for (const { scene, answers } of scenes) {
    const wanted = scene.after.outfit
    lines.push(
      '',
      `### ${scene.id}: ${scene.tries}`,
      '',
      `- Before: place "${flat(scene.before.place)}", wearing "${flat(scene.before.outfit)}"`,
      `- The reply: ${flat(scene.reply)}`,
      `- Should be: place with ${scene.after.place ? scene.after.place.map((word) => `"${word}"`).join(' or ') : 'nothing'}; clothes ${
        wanted ? `with ${wanted.has.map((names) => names[0]).join(', ')}${wanted.not?.length ? `, without ${wanted.not.join(', ')}` : ''}` : 'unknown'
      }`,
      '',
      '| Way | The answer, as written | Clothes kept | Place kept |',
      '| --- | --- | --- | --- |',
      ...answers.map(
        (answer) =>
          `| ${answer.way} | ${flat(answer.raw) || '(empty)'} | ${answer.outfitRight ? 'ok' : '**NO**'} ${flat(answer.outfit)}${answer.read.outfit === null ? ' (not read)' : ''} | ${answer.placeRight ? 'ok' : '**NO**'} ${flat(answer.place)}${answer.read.place === null ? ' (not read)' : ''} |`,
      ),
    )
  }
  return `${lines.join('\n')}\n`
}
