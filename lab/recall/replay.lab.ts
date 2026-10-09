import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { writeReport, type RecallTrial } from './report'

// `pnpm recall:replay`: the report of the last trial again, from the vectors it kept, with
// recall.ts as it is now. No model needed. Changed cases or a change in how messages are
// cut need the model again (`pnpm recall:lab`).

const OUT = resolve('lab/out')

it('writes the exact-memory report again from the vectors kept', () => {
  let trial: RecallTrial
  try {
    trial = JSON.parse(readFileSync(join(OUT, 'recall-vectors.json'), 'utf8')) as RecallTrial
  } catch {
    throw new Error('There is no trial to read again: lab/out/recall-vectors.json is what pnpm recall:lab writes.')
  }
  const report = writeReport(trial)
  writeFileSync(join(OUT, 'recall-report.md'), report, 'utf8')
  console.log(`\n${report.split('## The best ways')[0]}`)
  console.log(`Written: ${join(OUT, 'recall-report.md')} (every case is in it)`)
})
