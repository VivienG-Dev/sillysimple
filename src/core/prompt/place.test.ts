import { describe, expect, it } from 'vitest'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { asksApart, cleanNote, readScene, SCENE_LINES, sceneAfter, sceneAnswered, sceneFromLines, sceneQuestion, steadyNote, whatToTell } from './place'

const character: Character = {
  id: 'elara',
  name: 'Elara',
  tagline: '',
  description: '{{char}} keeps the lighthouse.',
  personality: '',
  scenario: '',
  firstMessage: '',
  alternateGreetings: [],
  exampleMessages: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  tags: [],
  lorebook: null,
}
const persona = { name: 'Ren', description: '' }
const build = (extra: Partial<Parameters<typeof buildMessages>[0]> = {}) =>
  buildMessages({
    character,
    persona,
    systemPrompt: 'You are {{char}}.',
    history: [
      { role: 'assistant', content: 'The kettle is on.' },
      { role: 'user', content: 'I sit at the table.' },
    ],
    ...extra,
  })

describe('the note that keeps the scene as it is', () => {
  it('names the place when the app knows it, and says who may move the scene', () => {
    const note = steadyNote({ place: 'the kitchen of the lighthouse' })
    expect(note).toContain('Where the scene is now: the kitchen of the lighthouse.')
    expect(note).toContain('until {{user}} goes somewhere else or asks to')
    expect(note.startsWith('[') && note.endsWith('Do not mention this note.]')).toBe(true)
    expect(note).not.toContain('wearing')
  })

  it('still asks to stay put when the place is not known', () => {
    for (const unknown of [null, '', '   ']) {
      expect(steadyNote({ place: unknown })).toContain('stays in the place where the last messages are')
      expect(steadyNote({ place: unknown })).not.toContain('Where the scene is now')
    }
  })

  it('names what the character wears, and lets the story change it', () => {
    const note = steadyNote({ place: 'the kitchen', outfit: 'a white blouse, a navy skirt' })
    expect(note).toContain('What {{char}} is wearing now: a white blouse, a navy skirt.')
    expect(note).toContain('they only change when the story tells it happening (something is taken off, put on, or changed)')
    expect(note.indexOf('Where the scene is now')).toBeLessThan(note.indexOf('is wearing now'))
    expect(note.match(/Do not mention this note/g)).toHaveLength(1)
    // Wearing nothing is something to keep too.
    expect(steadyNote({ place: null, outfit: 'nothing' })).toContain('What {{char}} is wearing now: nothing.')
  })

  it('says nothing of clothes it does not know, and nothing at all when there is nothing to say', () => {
    expect(steadyNote({ place: 'the kitchen', outfit: null })).not.toContain('wearing')
    expect(steadyNote({ place: 'the kitchen', outfit: '  ' })).not.toContain('wearing')
    expect(steadyNote({})).toBe('')
    expect(steadyNote({ outfit: null })).toBe('')
    // The clothes alone, when the scene is asked to move.
    const alone = steadyNote({ outfit: 'a red dress' })
    expect(alone).toMatch(/^\[What \{\{char\}\} is wearing now: a red dress\./)
    expect(alone).not.toContain('scene stays')
  })

  it('is the last thing the model reads, after what the user wrote, with the names filled in', () => {
    const messages = build({ place: 'the kitchen', outfit: 'a grey jumper' })
    const last = messages.at(-1)!
    expect(last.role).toBe('user')
    expect(last.content.startsWith('I sit at the table.\n\n[Where the scene is now: the kitchen.')).toBe(true)
    expect(last.content).toContain('Elara does not leave it')
    expect(last.content).toContain('until Ren goes somewhere else')
    expect(last.content).toContain('What Elara is wearing now: a grey jumper.')
    // Nothing of it in the instructions at the top: a change does not make the model read everything again.
    expect(messages[0]!.content).not.toMatch(/kitchen|jumper/)
  })

  it('is left out when it is not asked for, and comes before a reminder of the card', () => {
    expect(build().at(-1)!.content).toBe('I sit at the table.')
    const withCard = buildMessages({
      character: { ...character, postHistoryInstructions: 'Stay terse.' },
      persona,
      systemPrompt: 'You are {{char}}.',
      history: [{ role: 'user', content: 'Hello.' }],
      place: null,
    })
    expect(withCard.at(-1)!.content).toMatch(/^Hello\.\n\n\[The scene stays in the place[^\]]+\]\n\nStay terse\.$/)
  })

  it('gives way where a direction asks for a change: the place when the scene moves, both when time passes', () => {
    const told = { place: 'the kitchen', outfit: 'a grey jumper' }
    const happens = build({ ...told, direction: 'event' }).at(-1)!.content
    expect(happens).toContain('Where the scene is now: the kitchen')
    expect(happens).toContain('is wearing now: a grey jumper')

    // Going somewhere else does not change clothes.
    const elsewhere = build({ ...told, direction: 'place' }).at(-1)!.content
    expect(elsewhere).not.toContain('Where the scene is now')
    expect(elsewhere).toContain('is wearing now: a grey jumper')

    // The next day, anything may have changed.
    const later = build({ ...told, direction: 'time' }).at(-1)!.content
    expect(later).not.toMatch(/Where the scene is now|is wearing now/)

    // The rest of a reply that was cut short is already somewhere, dressed somehow.
    const rest = buildMessages({
      character,
      persona,
      systemPrompt: 'You are {{char}}.',
      history: [{ role: 'assistant', content: 'She pours the' }],
      continuing: true,
      ...told,
    })
    expect(rest.at(-1)!.content).not.toMatch(/kitchen|jumper/)
  })

  it('is added to the note that stands for the user when the character speaks again', () => {
    const messages = buildMessages({
      character,
      persona,
      systemPrompt: 'You are {{char}}.',
      history: [{ role: 'assistant', content: 'The kettle is on.' }],
      place: 'the kitchen',
    })
    expect(messages.at(-1)!.role).toBe('user')
    expect(messages.at(-1)!.content).toMatch(/Continue the scene as Elara[\s\S]+Where the scene is now: the kitchen/)
  })
})

describe('asking the model how things stand', () => {
  const messages = build({ place: 'the kitchen' })

  it('asks both things at once, about the character who just spoke', () => {
    const question = sceneQuestion('Elara')
    expect(question.startsWith('[Pause the story for two questions')).toBe(true)
    expect(question).toContain('\nPlace: where the scene is now')
    expect(question).toContain('\nWearing: what Elara has on now')
    expect(question).toContain('Write "unknown" for one that cannot be told.]')
    // Nothing known before: nothing to start from.
    expect(question).not.toContain('Before the last message')
    expect(sceneQuestion('Elara', { place: ' ', outfit: null })).toBe(question)
  })

  it('says how things were and asks what the last message changed', () => {
    const both = sceneQuestion('Elara', { place: 'the kitchen', outfit: 'a grey jumper, jeans' })
    expect(both).toContain('Before the last message, the scene was here: the kitchen, and Elara was wearing: a grey jumper, jeans. Start from that and change only what the last message changed')
    expect(both).toContain('what was taken off is left out, what was put on is added')
    expect(sceneQuestion('Elara', { place: 'the kitchen', outfit: null })).toContain('Before the last message, the scene was here: the kitchen. Start from that')
    expect(sceneQuestion('Elara', { place: null, outfit: 'a red dress' })).toContain('Before the last message, Elara was wearing: a red dress. Start from that')
  })

  it('asks in the conversation the reply was written in: the same messages, the reply, the question', () => {
    const asked = sceneAfter(messages, '*She sets two cups down.*', 'Elara', { place: 'the kitchen', outfit: null })
    // The note on the place is still in it: without it a small model makes a place up.
    expect(asked.slice(0, messages.length)).toEqual(messages)
    expect(asked.at(-3)!.content).toContain('Where the scene is now: the kitchen')
    expect(asked.at(-2)).toEqual({ role: 'assistant', content: '*She sets two cups down.*' })
    expect(asked.at(-1)).toEqual({ role: 'user', content: sceneQuestion('Elara', { place: 'the kitchen', outfit: null }) })
    expect(sceneAfter(messages, 'Hm.', 'Elara').at(-1)!.content).toBe(sceneQuestion('Elara'))
    expect(asked).toHaveLength(messages.length + 2)
    expect(messages).toHaveLength(3) // Not changed by asking.
  })

  it('is asked apart wherever that costs the next reply nothing', () => {
    // An online service keeps nothing in memory; a conversation that no longer fits cannot be asked in.
    expect(asksApart({ cloud: true, fits: true, ollama: null })).toBe(true)
    expect(asksApart({ cloud: false, fits: false, ollama: null })).toBe(true)
    // The Ollama the app brings, and newer ones: measured.
    for (const version of ['0.40.0', '0.40.1', '0.41.0', '1.0.0', '0.0.0']) expect(asksApart({ cloud: false, fits: true, ollama: version }), version).toBe(true)
    // An older Ollama, LM Studio, KoboldCpp: asked in the conversation they have in memory.
    for (const version of ['0.39.9', '0.12.3']) expect(asksApart({ cloud: false, fits: true, ollama: version }), version).toBe(false)
    expect(asksApart({ cloud: false, fits: true, ollama: null })).toBe(false)
    expect(SCENE_LINES).toBe(4)
  })

  it('or with the last messages only, and things as they were known', () => {
    const lines = [
      { name: 'Ren', content: 'I sit at the table.' },
      { name: 'Elara', content: '*She sets two cups down.*' },
    ]
    const asked = sceneFromLines(lines, 'Elara', { place: 'the kitchen', outfit: 'a grey jumper' })
    expect(asked).toHaveLength(2)
    expect(asked[1]!.content).toContain('Earlier, the scene was here: the kitchen\nEarlier, Elara was wearing: a grey jumper')
    expect(asked[1]!.content).toContain('Ren: I sit at the table.\n\nElara: *She sets two cups down.*')
    expect(asked[1]!.content).toContain('Wearing: what Elara has on right now')
    expect(sceneFromLines(lines, 'Elara', { place: null, outfit: null })[1]!.content).not.toContain('Earlier')
  })
})

describe('what the model answered', () => {
  it('is read as a place and clothes, on the two lines asked for', () => {
    expect(readScene('Place: the kitchen of the flat\nWearing: a white blouse, a navy pleated skirt, knee socks')).toEqual({
      place: 'the kitchen of the flat',
      outfit: 'a white blouse, a navy pleated skirt, knee socks',
    })
    // In the other order, with what a model adds around.
    expect(readScene('**Wearing:** "a red dress"\n**Place:** [the rooftop]\n')).toEqual({ place: 'the rooftop', outfit: 'a red dress' })
    expect(readScene('- Place: The harbour, by the nets.\n- Wearing: An oilskin coat and boots.')).toEqual({
      place: 'The harbour, by the nets',
      outfit: 'An oilskin coat and boots',
    })
    expect(readScene('Location - the cellar\nOutfit: a lab coat over a t-shirt')).toEqual({ place: 'the cellar', outfit: 'a lab coat over a t-shirt' })
    expect(readScene('Place : la cuisine de l’appartement\nWearing : un pull gris, un jean')).toEqual({
      place: 'la cuisine de l’appartement',
      outfit: 'un pull gris, un jean',
    })
  })

  it('reads the place from a bare first line too, and the clothes from a second line that is a list of clothes', () => {
    const places: [string, string][] = [
      ['the kitchen of the flat', 'the kitchen of the flat'],
      ['The kitchen.', 'The kitchen'],
      ['"The lighthouse kitchen"', 'The lighthouse kitchen'],
      ['They are in the kitchen.', 'in the kitchen'],
      ['The scene is at the docks', 'at the docks'],
      ['  the kitchen  \n\nShe then pours the tea and smiles.', 'the kitchen'],
      ['The kitchen. They are making tea together.', 'The kitchen'],
      ["Suzu's bedroom, on the bed", "Suzu's bedroom, on the bed"],
    ]
    for (const [answer, place] of places) expect(readScene(answer), answer).toEqual({ place, outfit: null })
    // A first line about clothes is not a place.
    expect(readScene('Wearing: a red dress')).toEqual({ place: null, outfit: 'a red dress' })

    // Two lines without their names, as Gemma 4 e2b answered in the lab.
    expect(readScene('The kitchen of the flat.\nGrey hoodie, white t-shirt, black jeans, sneakers.')).toEqual({
      place: 'The kitchen of the flat',
      outfit: 'Grey hoodie, white t-shirt, black jeans, sneakers',
    })
    expect(readScene('Poolside edge\nRed bikini, no sundress or sandals')).toEqual({ place: 'Poolside edge', outfit: 'Red bikini, no sundress or sandals' })
    expect(readScene('Inn corridor\nBare feet, blue yukata')).toEqual({ place: 'Inn corridor', outfit: 'Bare feet, blue yukata' })
    expect(readScene('- the cellar\n- unknown')).toEqual({ place: 'the cellar', outfit: null })
  })

  it('reads both from one line when the clothes are a list after the place', () => {
    // As Gemma 4 e2b answered in the lab, twice in 23 scenes.
    expect(readScene('Living room, oversized t-shirt, pyjama shorts, bare feet')).toEqual({ place: 'Living room', outfit: 'oversized t-shirt, pyjama shorts, bare feet' })
    expect(readScene('Library, navy blazer, white blouse')).toEqual({ place: 'Library', outfit: 'navy blazer, white blouse' })
    // One thing after the place: the place alone, no telling what the rest is.
    expect(readScene('Park bench, casual clothes')).toEqual({ place: 'Park bench', outfit: null })
    expect(readScene('Hallway, red coat')).toEqual({ place: 'Hallway', outfit: null })
    // More of the place is the place.
    expect(readScene("Suzu's bedroom, on the bed")).toEqual({ place: "Suzu's bedroom, on the bed", outfit: null })
    expect(readScene('The kitchen, by the window, at night')).toEqual({ place: 'The kitchen, by the window, at night', outfit: null })
    expect(readScene('Clothes shop. Red dress held.')).toEqual({ place: 'Clothes shop', outfit: null })
    // A sentence is not cut into a place and clothes.
    expect(readScene('She walks to the kitchen, opens the fridge, takes the milk, and sighs')).toEqual({ place: null, outfit: null })
    expect(readScene('Elara pours the tea and looks out of the window at the sea, a cup in each hand, the kettle ticking')).toEqual({ place: null, outfit: null })
    // With its name, a line is what it says it is.
    expect(readScene('Place: Library, navy blazer, white blouse')).toEqual({ place: 'Library, navy blazer, white blouse', outfit: null })
  })

  it('does not take the story going on for clothes', () => {
    const goesOn = [
      'the kitchen\nShe then pours the tea and smiles.',
      'The kitchen\n"Sit down," Elara says.',
      'The kitchen\n*Elara turns to the window.*',
      'The kitchen\nWhat will Ren do now?',
      'The kitchen\nHer eyes soften at the sight of the old compass.',
      // Three lines: no telling which is which.
      'The kitchen\nA grey jumper\nThe kettle starts to whistle.',
      // The names are there on some lines: the others are not guessed.
      'Place: the kitchen\nA grey jumper',
    ]
    for (const answer of goesOn) expect(readScene(answer), answer).toEqual({ place: expect.stringMatching(/kitchen/i), outfit: null })
    // A line about something else is neither.
    expect(readScene('Changed: nothing\nPlace: the kitchen\nWearing: a grey jumper')).toEqual({ place: 'the kitchen', outfit: 'a grey jumper' })
    expect(readScene('Changed: the hoodie came off\nA white t-shirt')).toEqual({ place: null, outfit: null })
  })

  it('keeps what it knows when the model cannot tell one of the two', () => {
    expect(readScene('Place: the kitchen\nWearing: unknown')).toEqual({ place: 'the kitchen', outfit: null })
    expect(readScene('Place: unknown\nWearing: a red dress')).toEqual({ place: null, outfit: 'a red dress' })
    expect(readScene('Place: Not specified.\nWearing: Not described')).toEqual({ place: null, outfit: null })
    // Clothes that name no piece of clothing: made up, or nothing known (Gemma 4 e2b, on a scene that tells none).
    for (const vague of ['Casual clothes', 'casual clothing.', 'Her usual clothes', 'Clothes']) {
      expect(readScene(`Park bench\n${vague}`), vague).toEqual({ place: 'Park bench', outfit: null })
      expect(readScene(`Place: a park bench\nWearing: ${vague}`).outfit, vague).toBeNull()
    }
    expect(readScene('Place: the gym\nWearing: casual clothes, a red cap').outfit).toBe('casual clothes, a red cap')
  })

  it('takes wearing nothing for an answer, not for "I cannot tell"', () => {
    for (const bare of ['nothing', 'Nothing.', 'no clothes', 'naked', 'only a towel', 'none of her clothes, just a blanket', 'navy trousers']) {
      expect(readScene(`Place: the bathroom\nWearing: ${bare}`).outfit, bare).not.toBeNull()
    }
    // For a place, "none" and "nowhere" are a way of not knowing.
    for (const nowhere of ['none', 'Nowhere', 'No specific location']) expect(readScene(`Place: ${nowhere}\nWearing: a coat`).place, nowhere).toBeNull()
  })

  it('is nothing at all when the model did not answer, or went on with the story', () => {
    const answers = [
      '',
      '   \n ',
      'unknown',
      '[unknown]',
      'N/A',
      "I don't know where they are.",
      '...',
      '*Elara pours the tea and looks out of the window at the grey sea, saying nothing for a long while as the kettle ticks.*',
      `Wearing: ${'a very long list of things, '.repeat(12)}`,
    ]
    for (const answer of answers) expect(readScene(answer), answer).toEqual({ place: null, outfit: null })
  })

  it('is known to be there as soon as both lines are written, whatever the model adds', () => {
    const answer = 'Place: The kitchen of the flat\nWearing: A white t-shirt, black jeans, sneakers\nWhat do you think the gratin will taste like?'
    // Letter by letter, as it arrives: not before the second line has ended.
    const end = answer.indexOf('sneakers') + 'sneakers'.length
    for (let length = 0; length <= end; length++) expect(sceneAnswered(answer.slice(0, length)), String(length)).toBe(false)
    expect(sceneAnswered(answer.slice(0, end + 1))).toBe(true)
    expect(readScene(answer.slice(0, end + 1))).toEqual({ place: 'The kitchen of the flat', outfit: 'A white t-shirt, black jeans, sneakers' })
    expect(sceneAnswered(answer)).toBe(true)

    expect(sceneAnswered('**Wearing:** a red dress\n**Place:** the rooftop\n')).toBe(true)
    expect(sceneAnswered('Place: the kitchen\n\nWearing: a grey jumper\n')).toBe(true)
    // An answer that ends there by itself is read when the model stops.
    expect(sceneAnswered('Place: the kitchen\nWearing: a grey jumper')).toBe(false)
    // Without the names, there is no telling that it is done.
    expect(sceneAnswered('The kitchen\nA grey jumper\n')).toBe(false)
    expect(sceneAnswered('Wearing: a grey jumper\n')).toBe(false)
    expect(sceneAnswered('')).toBe(false)
  })

  it('tidies what the user typed', () => {
    expect(cleanNote('  the   kitchen ', 80)).toBe('the kitchen')
    expect(cleanNote('', 80)).toBeNull()
    expect(cleanNote(undefined, 80)).toBeNull()
    expect(cleanNote('x'.repeat(200), 80)).toHaveLength(80)
    expect(cleanNote('x'.repeat(200), 160)).toHaveLength(160)
  })
})

describe('what a reply is told', () => {
  const kept = { now: 'the sofa', before: 'the kitchen', messageId: 'reply-7' }

  it('is how things are after the last reply, for a new reply', () => {
    expect(whatToTell(kept, null)).toBe('the sofa')
    expect(whatToTell(null, null)).toBeNull()
    expect(whatToTell(undefined, 'reply-7')).toBeNull()
  })

  it('is how things were before the last reply, for another version of it', () => {
    // The reply jumped to the sofa; written again, it is told the kitchen.
    expect(whatToTell(kept, 'reply-7')).toBe('the kitchen')
    // The same for a skirt that became trousers.
    expect(whatToTell({ now: 'trousers', before: 'a navy skirt', messageId: 'reply-7' }, 'reply-7')).toBe('a navy skirt')
  })

  it('is what was last noted, when the reply written again is not the one it was noted after', () => {
    // The question was stopped to make way: what is kept is still how things were before this reply.
    expect(whatToTell(kept, 'reply-8')).toBe('the sofa')
  })
})
