import { describe, expect, it } from 'vitest'
import { fixSections, improveRequest, isTipId, reviewCard, TIP_IDS, wordsIn, type ReviewedCard } from './reviewCard'
import { readWrittenCard, sectionGuide } from './writeCard'

const words = (count: number, word = 'word'): string => Array.from({ length: count }, () => word).join(' ')

/** A card nothing can be said against. */
const good: ReviewedCard = {
  name: 'Mara Venn',
  tagline: 'Archivist of a drowned city',
  description: `Mara keeps the last dry archive of Vell. ${words(80)}`,
  personality: 'Patient, wry',
  scenario: 'A storm night.',
  exampleMessages: '<START>\n{{user}}: Is it safe?\n{{char}}: *She shrugs.* "Safer than above."',
  firstMessage: `*Mara looks up from a ledger, one finger still marking her line.* "You found the stairs." ${words(30)}.`,
  alternateGreetings: ['*The lamps are out.* "Do not move."'],
  loreCount: 3,
}
const ids = (card: Partial<ReviewedCard>): string[] => reviewCard({ ...good, ...card }).map((tip) => tip.id)

describe('counting words', () => {
  it('counts words, in any language written with spaces', () => {
    expect(wordsIn('  The lamp   room smells of salt. ')).toBe(6)
    expect(wordsIn("Elle n'a pas parlé depuis l'héritage.")).toBe(6)
    expect(wordsIn('')).toBe(0)
  })

  it('counts a text without spaces by its characters', () => {
    expect(wordsIn('彼女は灯台を守っている。何年も前から。')).toBeGreaterThan(8)
    expect(wordsIn('Mara は司書です')).toBe(4) // One word, and five characters worth three.
  })
})

describe('advice on a card', () => {
  it('has nothing to say about a complete card', () => {
    expect(reviewCard(good)).toEqual([])
  })

  it('says when the chat would open on nothing', () => {
    const [tip] = reviewCard({ ...good, firstMessage: '  ' })
    expect(tip).toMatchObject({ id: 'greeting-missing', level: 'important', title: 'No opening message', fixLabel: 'Write one' })
    expect(tip?.detail).toContain('Every chat with Mara Venn starts blank')
    // Nothing else is said about a message that is not there.
    expect(ids({ firstMessage: '' })).toEqual(['greeting-missing'])
  })

  it('says when the description is missing or thin, with its size', () => {
    expect(ids({ description: '' })).toEqual(['description-missing'])
    const [bare] = reviewCard({ ...good, description: words(12) })
    expect(bare).toMatchObject({ id: 'description-short', level: 'important', fixLabel: 'Write a fuller one' })
    expect(bare?.detail).toContain('About 12 words')
    // A few lines are enough to play with, and better with more: an idea, not a warning.
    expect(reviewCard({ ...good, description: words(30) })[0]).toMatchObject({ id: 'description-short', level: 'idea' })
    expect(ids({ description: words(60) })).toEqual([])
  })

  it('says when a long description weighs on every reply, and has no button for it', () => {
    const [long] = reviewCard({ ...good, description: words(1060) })
    expect(long).toMatchObject({ id: 'description-long', level: 'idea' })
    expect(long?.detail).toContain('About 1060 words')
    expect(long?.detail).toContain('roughly 20%')
    expect(long).not.toHaveProperty('fixLabel')
    expect(fixSections('description-long')).toEqual([])
    expect(ids({ description: words(700) })).toEqual([])
  })

  it('looks at how the opening message will shape the replies', () => {
    expect(ids({ firstMessage: 'Hello there, stranger.' })).toEqual(['greeting-short'])
    expect(ids({ firstMessage: `${words(40)}. "Who are you?"` })).toEqual(['greeting-question'])
    expect(ids({ firstMessage: `${words(40)}. *She tilts her head.* "And you are?"*` })).toEqual(['greeting-question'])
    expect(ids({ firstMessage: `"Who are you?" ${words(40)}.` })).toEqual([]) // A question inside is fine.
    // Short and ending on a question: one thing at a time, the length first.
    expect(ids({ firstMessage: 'Who are you?' })).toEqual(['greeting-short'])
  })

  it('suggests what is optional: examples, lorebook notes, a second opening', () => {
    expect(ids({ exampleMessages: '' })).toEqual(['examples-missing'])
    expect(ids({ loreCount: 0 })).toEqual(['lore-missing'])
    expect(ids({ alternateGreetings: [] })).toEqual(['greeting-single'])
    expect(ids({ alternateGreetings: ['  '] })).toEqual(['greeting-single'])
    expect(reviewCard({ ...good, loreCount: 0 })[0]?.level).toBe('idea')
  })

  it('puts what matters most first', () => {
    const tips = reviewCard({ ...good, description: words(5), exampleMessages: '', firstMessage: '', loreCount: 0, alternateGreetings: [] })
    expect(tips.map((tip) => tip.id)).toEqual(['greeting-missing', 'description-short', 'examples-missing', 'lore-missing'])
    expect(tips.map((tip) => tip.level)).toEqual(['important', 'important', 'idea', 'idea'])
    // The same card with a few lines of description: what is missing still comes before what could be better.
    const milder = reviewCard({ ...good, description: words(30), firstMessage: '', loreCount: 0 })
    expect(milder.map((tip) => tip.level)).toEqual(['important', 'idea', 'idea'])
  })

  it('speaks of "the character" when the card has no name yet', () => {
    expect(reviewCard({ ...good, name: ' ', firstMessage: '' })[0]?.detail).toContain('Every chat with the character starts blank')
  })

  it('knows its own ids', () => {
    expect(TIP_IDS.every(isTipId)).toBe(true)
    expect(isTipId('greeting')).toBe(false)
    expect(isTipId(undefined)).toBe(false)
  })
})

describe('having the model write the missing part', () => {
  it('asks for that part only, with the same guide as for a whole card', () => {
    const request = improveRequest({ ...good, loreCount: 0 }, 'lore-missing')
    const [system, user] = request ?? []
    expect(system?.content).toContain('asked for one part of it')
    expect(system?.content).toContain(`### LORE\n${sectionGuide('LORE')}`)
    expect(system?.content.match(/^### /gm)).toHaveLength(1)
    expect(sectionGuide('LORE')).toContain('keyword, keyword, keyword: The note')
    expect(user?.content).toContain('What to do: The card has no lorebook.')
  })

  it('shows the model the card as it is', () => {
    const [, user] = improveRequest({ ...good, exampleMessages: '', loreKeys: ['sister', 'Lise', 'flood'] }, 'examples-missing') ?? []
    expect(user?.content).toContain('Name: Mara Venn')
    expect(user?.content).toContain('Description:\nMara keeps the last dry archive of Vell.')
    expect(user?.content).toContain('Example dialogue: (none)')
    expect(user?.content).toContain('First message:\n*Mara looks up from a ledger')
    expect(user?.content).toContain('Other opening messages: 1')
    expect(user?.content).toContain('Lorebook: notes about sister, Lise, flood')
  })

  it('says why, so a rewrite keeps what was there', () => {
    const why = (tip: Parameters<typeof improveRequest>[1]): string => improveRequest(good, tip)?.[1]?.content.split('What to do: ')[1] ?? ''
    expect(why('description-short')).toContain('keep every fact it gives')
    expect(why('greeting-question')).toContain('ending on an action, a statement or a silence')
    expect(why('greeting-short')).toContain('the same scene')
    expect(why('greeting-single')).toContain('a different situation or mood')
  })

  it('asks for the right part for each piece of advice', () => {
    expect(fixSections('greeting-missing')).toEqual(['FIRST MESSAGE'])
    expect(fixSections('greeting-single')).toEqual(['SECOND GREETING'])
    expect(fixSections('description-short')).toEqual(['DESCRIPTION'])
    expect(fixSections('examples-missing')).toEqual(['EXAMPLE DIALOGUE'])
    // Every piece of advice with a button has something for the model to write, and the others none.
    for (const tip of reviewCard({ ...good, description: words(5), exampleMessages: '', firstMessage: 'Hi?', loreCount: 0 })) {
      expect(fixSections(tip.id).length > 0).toBe(tip.fixLabel !== undefined)
    }
    expect(improveRequest(good, 'description-long')).toBeNull()
  })

  it('cuts a field that is far too long', () => {
    const [, user] = improveRequest({ ...good, description: 'x'.repeat(50000) }, 'lore-missing') ?? []
    expect(user?.content.length).toBeLessThan(8000)
  })

  it('gets an answer the card reader understands', () => {
    expect(readWrittenCard('### FIRST MESSAGE\n*She looks up.* "You are dripping on the maps."').firstMessage).toBe('*She looks up.* "You are dripping on the maps."')
    expect(readWrittenCard('### SECOND GREETING\n*Dawn.* "You slept on the atlases."').otherGreetings).toEqual(['*Dawn.* "You slept on the atlases."'])
    expect(readWrittenCard('### LORE\nsister, Lise: Her sister runs a bookshop.').lore).toHaveLength(1)
    expect(sectionGuide('SECOND GREETING')).toBe('Another opening message, as long, for a different situation or mood.')
    expect(sectionGuide('NAME')).toBe("The character's name only.")
  })
})
