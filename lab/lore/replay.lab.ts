import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { lorePieces } from '@core/prompt/loreMeaning'
import { CASES } from './cases'
import { DEPTHS, writeReport, type LoreTrial } from './report'

// `pnpm lore:replay`: the report of the last trial again, from the vectors it kept, with
// loreMeaning.ts as it is now. No model needed. A case added or changed since, or a
// change in how sentences are cut, needs the model again (`pnpm lore:lab`): it says so.

const OUT = resolve('lab/out')

it('writes the lorebook report again from the vectors kept', () => {
  let trial: LoreTrial
  try {
    trial = JSON.parse(readFileSync(join(OUT, 'lore-vectors.json'), 'utf8')) as LoreTrial
  } catch {
    throw new Error('There is no trial to read again: lab/out/lore-vectors.json is what pnpm lore:lab writes.')
  }
  const known = new Set(trial.texts)
  const deepest = Math.max(...DEPTHS)
  const changed = CASES.filter((item) => lorePieces(item.messages, deepest).some((piece) => !known.has(piece.text)))
  if (changed.length > 0 || CASES.length !== trial.cases.length) {
    throw new Error(`The cases or the cutting changed since the trial (${changed.length} case(s) with sentences the model was never asked about). Run pnpm lore:lab.`)
  }
  const report = writeReport(trial)
  writeFileSync(join(OUT, 'lore-report.md'), report, 'utf8')
  console.log(`\n${report.split('## How far apart')[0]}`)
  console.log(`Written: ${join(OUT, 'lore-report.md')} (every case is in it)`)
})
