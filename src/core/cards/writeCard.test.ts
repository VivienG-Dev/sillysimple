import { describe, expect, it } from 'vitest'
import { cardRequest, isGreeting, readWrittenCard } from './writeCard'

const ANSWER = `### NAME
Mara Venn

### TAGLINE
Archivist of a drowned city

### DESCRIPTION
Mara Venn keeps the last dry archive of Vell. She is forty, ink-stained, and speaks softly.

She never lies to {{user}}, which makes her dangerous.

### PERSONALITY
Patient, wry, secretive, stubborn

### SCENARIO
A storm night. {{user}} comes down the archive stairs looking for a map.

### EXAMPLE DIALOGUE
<START>
{{user}}: Is it safe here?
{{char}}: *She shrugs.* "Safer than above."

### TAGS
mystery, slow burn, #fantasy

### FIRST MESSAGE
*Mara looks up from a ledger.* "You found the stairs, {{user}}."

### SECOND GREETING
*The lamps are out.* "Don't move. The floor is wet."
`

describe('the request sent to the model', () => {
  it('gives the instructions, then the idea', () => {
    const [system, user] = cardRequest('  a grumpy lighthouse keeper  ')
    expect(system?.role).toBe('system')
    expect(system?.content).toContain('### FIRST MESSAGE')
    expect(system?.content).toContain('{{user}}')
    expect(user).toEqual({ role: 'user', content: 'The idea: a grumpy lighthouse keeper' })
  })

  it('adds how the user likes to play when asked to, and says the idea comes first', () => {
    const [system, user] = cardRequest('a grumpy lighthouse keeper', { likes: ['mystery', 'banter'], dislikes: ['time skips'] })
    expect(system?.content).toBe(cardRequest('x')[0]?.content) // The instructions do not change.
    expect(user?.content).toBe(
      'The idea: a grumpy lighthouse keeper\n\n' +
        'About the person who will chat with the character, from their earlier chats:\n' +
        'They enjoy: mystery, banter.\nThey do not enjoy: time skips.\n' +
        'Where the idea leaves room, lean that way: in the tone, in the scenario, and above all in how the first message and the example dialogue are written. ' +
        'The idea comes first: when it asks for something they are said not to enjoy, follow the idea. Do not mention these tastes in the card.',
    )
    expect(cardRequest('an idea', { likes: [], dislikes: ['gore'] })[1]?.content).not.toContain('They enjoy')
  })

  it('adds nothing when there are no tastes to use', () => {
    expect(cardRequest('an idea', { likes: [], dislikes: [] })[1]?.content).toBe('The idea: an idea')
    expect(cardRequest('an idea', undefined)[1]?.content).toBe('The idea: an idea')
  })

  it('cuts an idea that is far too long', () => {
    expect(cardRequest('x'.repeat(5000))[1]?.content.length).toBeLessThan(2100)
  })
})

describe('reading what the model wrote', () => {
  it('reads every section of a well-formed answer', () => {
    expect(readWrittenCard(ANSWER)).toEqual({
      name: 'Mara Venn',
      tagline: 'Archivist of a drowned city',
      description:
        'Mara Venn keeps the last dry archive of Vell. She is forty, ink-stained, and speaks softly.\n\nShe never lies to {{user}}, which makes her dangerous.',
      personality: 'Patient, wry, secretive, stubborn',
      scenario: 'A storm night. {{user}} comes down the archive stairs looking for a map.',
      exampleMessages: '<START>\n{{user}}: Is it safe here?\n{{char}}: *She shrugs.* "Safer than above."',
      tags: ['Mystery', 'Slow burn', 'Fantasy'],
      firstMessage: '*Mara looks up from a ledger.* "You found the stairs, {{user}}."',
      otherGreetings: ['*The lamps are out.* "Don\'t move. The floor is wet."'],
      last: 'SECOND GREETING',
    })
  })

  it('reads every greeting when the idea asked for several', () => {
    const more = `${ANSWER}\n\n### THIRD GREETING\n*Dawn.* "You slept on the atlases."\n\n**Fourth greeting:** *She is gone.* A note waits.\n\n### FIFTH GREETING\n"Last boat leaves at dusk."`
    const card = readWrittenCard(more)
    expect(card.otherGreetings).toEqual([
      '*The lamps are out.* "Don\'t move. The floor is wet."',
      '*Dawn.* "You slept on the atlases."',
      '*She is gone.* A note waits.',
      '"Last boat leaves at dusk."',
    ])
    expect(card.last).toBe('FIFTH GREETING')
    expect(card.firstMessage).toBe('*Mara looks up from a ledger.* "You found the stairs, {{user}}."')

    // While the third is being written, the second is whole and the third grows.
    const partial = readWrittenCard(`${ANSWER}\n\n### THIRD GREETING\n*Dawn.* "You sle`, { partial: true })
    expect(partial.otherGreetings).toEqual(['*The lamps are out.* "Don\'t move. The floor is wet."', '*Dawn.* "You sle'])
    expect(partial.last).toBe('THIRD GREETING')
  })

  it('reads the lorebook notes: keywords, then the note', () => {
    const withLore = ANSWER.replace(
      '### FIRST MESSAGE',
      '### LORE\nsister, Lise, family: Her sister Lise runs a bookshop in Nantes. They have not spoken since the inheritance.\n' +
        'flood, the drowning: Vell went under eleven years ago, in one night.\n\n### FIRST MESSAGE',
    )
    const card = readWrittenCard(withLore)
    expect(card.lore).toEqual([
      { keys: ['sister', 'Lise', 'family'], content: 'Her sister Lise runs a bookshop in Nantes. They have not spoken since the inheritance.' },
      { keys: ['flood', 'the drowning'], content: 'Vell went under eleven years ago, in one night.' },
    ])
    // The sections around it are read as before.
    expect(card.tags).toEqual(['Mystery', 'Slow burn', 'Fantasy'])
    expect(card.firstMessage).toBe('*Mara looks up from a ledger.* "You found the stairs, {{user}}."')
    expect(readWrittenCard(ANSWER)).not.toHaveProperty('lore')
  })

  it('copes with the ways models write those notes', () => {
    const lore = (text: string) => readWrittenCard(`### NAME\nMara\n### LORE\n${text}\n### FIRST MESSAGE\nHello.`).lore
    expect(lore('- **sister, Lise**: Her sister runs a bookshop.\n2. "flood" / drowning — Vell went under in one night.')).toEqual([
      { keys: ['sister', 'Lise'], content: 'Her sister runs a bookshop.' },
      { keys: ['flood', 'drowning'], content: 'Vell went under in one night.' },
    ])
    expect(lore('Keywords: sister, Lise\nNote: Her sister runs a bookshop.\n\nKeywords: flood\nNote: Vell went under in one night.')).toEqual([
      { keys: ['sister', 'Lise'], content: 'Her sister runs a bookshop.' },
      { keys: ['flood'], content: 'Vell went under in one night.' },
    ])
    // A note that runs on to a second line.
    expect(lore('sister, Lise: Her sister runs a bookshop\nin Nantes, by the river.')).toEqual([
      { keys: ['sister', 'Lise'], content: 'Her sister runs a bookshop in Nantes, by the river.' },
    ])
    // Under other names for the section.
    expect(readWrittenCard('### NAME\nMara\n## Lorebook\nflood: Vell went under in one night.').lore).toHaveLength(1)
    expect(readWrittenCard('### NAME\nMara\n**Lore notes:**\nflood: Vell went under in one night.').lore).toHaveLength(1)
  })

  it('keeps only real notes, and not too many', () => {
    const lore = (text: string) => readWrittenCard(`### NAME\nMara\n### LORE\n${text}`).lore
    expect(lore('none')).toBeUndefined()
    expect(lore('She has a sister. That is all there is to say.')).toBeUndefined()
    expect(lore('sister: ok')).toBeUndefined() // Too short to be a note.
    expect(lore(Array.from({ length: 9 }, (_, index) => `key${index}: Note number ${index} of the list.`).join('\n'))).toHaveLength(6)
    expect(lore('a, b, c, d, e, f, g: A note with too many keywords.')?.[0]?.keys).toHaveLength(5)
  })

  it('shows the notes as they are written, without mixing a new line into the note above', () => {
    const partial = readWrittenCard('### NAME\nMara\n### LORE\nsister, Lise: Her sister runs a bookshop.\nflood, the dr', { partial: true })
    expect(partial.lore).toEqual([{ keys: ['sister', 'Lise'], content: 'Her sister runs a bookshop.' }])
    expect(partial.last).toBe('LORE')
  })

  it('asks for actions told in detail, and for lorebook notes', () => {
    const [system] = cardRequest('a keeper')
    expect(system?.content).toContain('Never a bare *She smiles.*')
    expect(system?.content).toContain('the gesture and how it is made')
    expect(system?.content).toContain('### LORE\nThree to five notes')
    expect(system?.content).toContain('keyword, keyword, keyword: The note')
    expect(system?.content.indexOf('### LORE')).toBeLessThan(system?.content.indexOf('### FIRST MESSAGE') ?? 0)
  })

  it('tells the model how to give more greetings, and which sections are greetings', () => {
    const [system] = cardRequest('a keeper, with multiple greetings')
    expect(system?.content).toContain('unless the idea asks for several greetings')
    expect(system?.content).toContain('### THIRD GREETING, ### FOURTH GREETING, ### FIFTH GREETING')
    expect(['FIRST MESSAGE', 'SECOND GREETING', 'FIFTH GREETING'].every((section) => isGreeting(section as never))).toBe(true)
    expect(isGreeting('SCENARIO')).toBe(false)
    expect(isGreeting(null)).toBe(false)
  })

  it('copes with the ways models stray from the format', () => {
    const card = readWrittenCard(
      [
        'Sure! Here is your character:',
        '',
        '```',
        '**Name:** "Juno"',
        '## Tagline: A pilot with one last flight',
        'Description:',
        'Juno flies cargo. Her name was given by her crew.',
        'PERSONALITY: - bold',
        '- reckless.',
        '__Scenario__',
        'A hangar at dawn.',
        '### Example dialogue',
        '{{user}}: Ready?',
        '{{char}}: "Always."',
        'Tags',
        '- sci-fi',
        '- Adventure',
        '**First Message**',
        '"Strap in."',
        '```',
      ].join('\n'),
    )
    expect(card).toEqual({
      name: 'Juno',
      tagline: 'A pilot with one last flight',
      description: 'Juno flies cargo. Her name was given by her crew.',
      personality: 'bold, reckless',
      scenario: 'A hangar at dawn.',
      exampleMessages: '<START>\n{{user}}: Ready?\n{{char}}: "Always."',
      tags: ['Sci-fi', 'Adventure'],
      firstMessage: '"Strap in."',
      last: 'FIRST MESSAGE',
    })
  })

  it('does not take a sentence of the text for a heading', () => {
    const card = readWrittenCard(
      '### NAME\nElara\n### DESCRIPTION\nName aside, she is plain.\nTags hang from her coat. Scenario writers love her.\nFirst message: none was ever sent.\n### PERSONALITY\ndry',
    )
    expect(card.name).toBe('Elara')
    expect(card.description).toBe(
      'Name aside, she is plain.\nTags hang from her coat. Scenario writers love her.\nFirst message: none was ever sent.',
    )
    expect(card.personality).toBe('dry')
  })

  it('takes "Personality: …" as a heading when that is the section expected next', () => {
    const card = readWrittenCard('Name: Elara\nTagline: Keeper\nDescription: She keeps the light.\nPersonality: dry, loyal')
    expect(card).toMatchObject({ name: 'Elara', tagline: 'Keeper', description: 'She keeps the light.', personality: 'dry, loyal' })
  })

  it('leaves out what the model did not write', () => {
    expect(readWrittenCard('### NAME\nElara\n### TAGLINE\n\n### DESCRIPTION\n')).toEqual({ name: 'Elara', last: 'DESCRIPTION' })
    expect(readWrittenCard('I cannot help with that.')).toEqual({ last: null })
  })

  describe('while it is being written', () => {
    const upTo = (marker: string, extra = ''): string => ANSWER.slice(0, ANSWER.indexOf(marker)) + extra

    it('reads what is there so far, and says which section is being written', () => {
      const card = readWrittenCard(upTo('She never lies'), { partial: true })
      expect(card).toEqual({
        name: 'Mara Venn',
        tagline: 'Archivist of a drowned city',
        description: 'Mara Venn keeps the last dry archive of Vell. She is forty, ink-stained, and speaks softly.',
        last: 'DESCRIPTION',
      })
    })

    it('shows a sentence as it grows', () => {
      const card = readWrittenCard(upTo('She never lies', 'She nev'), { partial: true })
      expect(card.description?.endsWith('She nev')).toBe(true)
    })

    it('never shows half a heading in a field', () => {
      for (const half of ['#', '### PERS', '### PERSONALITY', '**Pers', 'PERSONAL']) {
        const card = readWrittenCard(upTo('### PERSONALITY', half), { partial: true })
        expect(card.description?.endsWith('dangerous.')).toBe(true)
        expect(card.last).toBe('DESCRIPTION')
      }
      expect(readWrittenCard(upTo('### PERSONALITY', '### PERSONALITY\nPat'), { partial: true })).toMatchObject({
        personality: 'Pat',
        last: 'PERSONALITY',
      })
    })

    it('reads the same answer whatever the size of the pieces it arrives in', () => {
      for (let length = 1; length <= ANSWER.length; length += 7) {
        expect(() => readWrittenCard(ANSWER.slice(0, length), { partial: true })).not.toThrow()
      }
      expect(readWrittenCard(ANSWER, { partial: true })).toEqual(readWrittenCard(ANSWER))
    })
  })
})

describe('the personality, trait by trait', () => {
  it('keeps traits shown by what the character does, one per line', () => {
    const card = readWrittenCard(
      [
        '### PERSONALITY',
        '- **Loyal**: When someone doubts {{user}}, she stands up, her voice shaking but firm.',
        '- Bubbly: Talks about melon bread with a little hop, clapping her hands.',
        'Likes: melon bread, anime. Dislikes: silence. Wants: to become an idol.',
        '### SCENARIO',
        'A school corridor.',
      ].join('\n'),
    )
    expect(card.personality).toBe(
      'Loyal: When someone doubts {{user}}, she stands up, her voice shaking but firm.\n' +
        'Bubbly: Talks about melon bread with a little hop, clapping her hands.\n' +
        'Likes: melon bread, anime. Dislikes: silence. Wants: to become an idol.',
    )
  })

  it('still reads a bare list of traits as one line', () => {
    expect(readWrittenCard('### PERSONALITY\n- bold\n- reckless\n### SCENARIO\nA hangar.').personality).toBe('bold, reckless')
  })
})
