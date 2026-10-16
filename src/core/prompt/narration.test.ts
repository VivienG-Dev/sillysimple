import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { NARRATION_NOTE } from './narration'

const elena: Character = { ...EMPTY_CHARACTER, id: 'elena', name: 'Elena', lorebook: null }
const history = [{ role: 'user' as const, content: 'Elena wanted it to never stop.' }]

describe('what is said and what is told', () => {
  it('is explained to the model, with the names filled in, when the app asks for it', () => {
    const [system] = buildMessages({ character: elena, persona: { name: 'Dean', description: '' }, systemPrompt: 'Be {{char}}.', history, readNarration: true })
    expect(system!.content).toContain("How Dean's turns are written: words between quotes are what Dean says out loud.")
    expect(system!.content).toContain('play Elena that way')
    expect(system!.content).not.toContain('{{')
  })

  it('stays out otherwise', () => {
    const [system] = buildMessages({ character: elena, persona: { name: 'Dean', description: '' }, systemPrompt: 'Be {{char}}.', history })
    expect(system!.content).not.toContain(NARRATION_NOTE.slice(0, 30))
  })
})
