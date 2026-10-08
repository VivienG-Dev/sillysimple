import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it } from 'vitest'
import { writeReport, type Trial } from './judge'

// Reads again the answers of the last trial (`pnpm scene:lab`) with the app as it is
// now, without asking the model: after a change to how an answer is read (`readScene`
// in src/core/prompt/place.ts) or to how the lab judges it. Run with `pnpm scene:replay`.
//
// A change to a question is another matter: the model has to be asked again.

const ANSWERS = resolve('lab/out/scene-answers.json')

it('reads the answers of the last trial again', () => {
  let trial: Trial
  try {
    trial = JSON.parse(readFileSync(ANSWERS, 'utf8')) as Trial
  } catch {
    throw new Error(`No trial to read again at ${ANSWERS}. Run pnpm scene:lab first.`)
  }
  if (!Array.isArray(trial.scenes) || !trial.scenes[0]?.answers?.[0] || typeof trial.ways !== 'object') {
    throw new Error('This trial was written by an older lab. Run pnpm scene:lab again.')
  }
  const report = writeReport(trial)
  writeFileSync(resolve('lab/out/scene-report.md'), report, 'utf8')
  console.log(`\n${report.split('## Every scene')[0]}`)
})
