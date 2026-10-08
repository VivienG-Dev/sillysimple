import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { writeReport, type Trial } from './report'

// The report again, from the vectors of the last trial: no model, no Ollama, a second.
// Run with `pnpm mood:replay` after changing a threshold or the way of deciding
// (src/core/mood/senseMood.ts), to see what it does to the same replies.
//
// It cannot follow a change of what is asked of the model: another anchor, a reply added
// to the lab, another way of cutting replies. Then it says so, and `pnpm mood:lab` is the
// one to run.

const OUT = resolve('lab/out')

it('reads the lab replies again with the vectors of the last trial', () => {
  let trial: Trial
  try {
    trial = JSON.parse(readFileSync(join(OUT, 'mood-vectors.json'), 'utf8')) as Trial
  } catch {
    throw new Error('There is no trial to read again: lab/out/mood-vectors.json is what pnpm mood:lab writes.')
  }
  const report = writeReport(trial)
  writeFileSync(join(OUT, 'mood-report.md'), report, 'utf8')
  console.log(`\n${report.split('## Every reply')[0]}`)
  console.log(`Written: ${join(OUT, 'mood-report.md')} (every reply is in it)`)
})
