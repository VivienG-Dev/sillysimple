import { describe, expect, it } from 'vitest'
import { changeRequest, describeChange, readChange, saidNothing } from './changeCard'
import type { ChangedCard } from '@shared/types'

const CARD: ChangedCard = {
  name: 'Mara Venn',
  tagline: 'Archivist of a drowned city',
  description: '{{char}} keeps the last dry archive of Vell. She is forty and speaks softly.',
  personality: 'Patient, wry.',
  scenario: '',
  exampleMessages: '',
  tags: ['fantasy', 'mystery'],
  firstMessage: '*She looks up from a ledger.* "You are late."',
  alternateGreetings: ['*The lamps flicker.*'],
  lore: [
    { keys: ['Vell'], content: 'A city under the sea.' },
    { keys: ['Tomas', 'brother'], content: 'Her brother, lost at sea.' },
  ],
}

describe('changeRequest', () => {
  it('shows the card under the headings the answer uses, then the change', () => {
    const [system, user] = changeRequest(CARD, 'Make her a man')
    expect(system?.content).toContain('### NOTHING')
    expect(user?.content).toContain('### DESCRIPTION\n{{char}} keeps')
    expect(user?.content).toContain('### TAGS\nfantasy, mystery')
    expect(user?.content).toContain('2. Tomas, brother: Her brother, lost at sea.')
    expect(user?.content).toContain('### GREETING 2\n*The lamps flicker.*')
    expect(user?.content).toContain('The change: Make her a man')
    expect(system?.content).toContain("keeps the card's own format")
  })
})

describe('readChange', () => {
  const ANSWER = `### NAME
Marek Venn

### DESCRIPTION
{{char}} keeps the last dry archive of Vell. He is forty and speaks softly.

### LORE
2. Tomas, brother: His brother, lost at sea.
+ Ilse: His old teacher.
1. remove

### GREETING 2
*The lamps flicker as he turns.*
`

  it('reads only the parts written, by their place', () => {
    const change = readChange(ANSWER)
    expect(change.fields).toEqual({ NAME: 'Marek Venn', DESCRIPTION: '{{char}} keeps the last dry archive of Vell. He is forty and speaks softly.' })
    expect([...change.greetings]).toEqual([[0, '*The lamps flicker as he turns.*']])
    expect(change.lore).toEqual([
      { index: 1, keys: ['Tomas', 'brother'], content: 'His brother, lost at sea.' },
      { index: null, keys: ['Ilse'], content: 'His old teacher.' },
      { index: 0, remove: true, keys: [], content: '' },
    ])
    expect(describeChange(change)).toEqual(['the name', 'the description', 'another opening', '3 lorebook notes'])
  })

  it('leaves out the last part when the answer stopped in the middle of it', () => {
    const cut = readChange('### NAME\nMarek\n\n### DESCRIPTION\n{{char}} keeps the last', { drop: true })
    expect(cut.fields).toEqual({ NAME: 'Marek' })
  })

  it('does not show a heading still being written', () => {
    expect(readChange('### NAME\nMarek\n### DESCR', { partial: true }).last).toBe('NAME')
  })

  it('keeps headings of the card text that are not its own parts in the text', () => {
    const change = readChange('### DESCRIPTION\n## Appearance\nTall.\n')
    expect(change.fields.DESCRIPTION).toBe('## Appearance\nTall.')
  })

  it('knows when there is nothing to change', () => {
    expect(saidNothing('### NOTHING')).toBe(true)
    expect(describeChange(readChange('### NOTHING'))).toEqual([])
  })
})
