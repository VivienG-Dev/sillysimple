import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { directionCue, DIRECTIONS, EVENT_CHOICES, EVENTS, GO_ON_CUE, isDirection, OPEN_CUE, pickEvents } from './direction'
import { CONTINUE_CUE } from './replyLength'

const character = (id: string, name: string): Character => ({ ...EMPTY_CHARACTER, id, name, lorebook: null })
const elara = character('elara', 'Elara')
const quill = character('quill', 'Quill')
const persona = { name: 'Ren', description: '' }
const filled = (text: string): string => text.replaceAll('{{char}}', 'Elara').replaceAll('{{user}}', 'Ren')

const said = (role: 'user' | 'assistant', content: string, characterId?: string) => ({ role, content, characterId })
const build = (history: ReturnType<typeof said>[], more: Partial<Parameters<typeof buildMessages>[0]> = {}) =>
  buildMessages({ character: elara, persona, systemPrompt: 'Be {{char}}.', history, ...more }).slice(1)

describe('the directions', () => {
  it('each have something to tell the model, about the character and never about the user', () => {
    expect(DIRECTIONS).toEqual(['event', 'place', 'time'])
    for (const direction of DIRECTIONS) {
      const cue = directionCue(direction)
      expect(cue.startsWith('[Stage direction: ')).toBe(true)
      expect(cue.endsWith("Do not write {{user}}'s words or actions, and do not mention this note.]")).toBe(true)
      expect(cue).toContain('{{char}}')
    }
    expect(new Set(DIRECTIONS.map((direction) => directionCue(direction))).size).toBe(3)
  })
})

describe('what a request may carry', () => {
  it('tells a direction apart from anything else', () => {
    expect(isDirection('place')).toBe(true)
    for (const other of ['more', '', 'PLACE', undefined, null, 3, {}]) expect(isDirection(other)).toBe(false)
  })
})

describe('"Something happens"', () => {
  it('is given two kinds of thing to choose from, drawn by the app: left free, a model does the same thing each time', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(EVENTS).size).toBe(EVENTS.length)
    const cue = directionCue('event', { events: [0, 4] })
    expect(cue).toContain(`It is one of these, whichever fits this scene and this story better: either ${EVENTS[0]}; or ${EVENTS[4]}.`)
    expect(cue).toContain('where the scene is')
    expect(cue).toContain('in a way that makes sense here')
    expect(cue.endsWith("Do not write {{user}}'s words or actions, and do not mention this note.]")).toBe(true)
    // One kind alone is said plainly; none at all leaves the model free, with no list of examples to take the first of.
    expect(directionCue('event', { events: [3] })).toContain(`What happens is this: ${EVENTS[3]}.`)
    expect(directionCue('event')).not.toMatch(/one of these|What happens is this|someone arrives/)
  })

  it('names nothing a story may not have: the kinds make sense in a bedroom as in outer space', () => {
    for (const event of EVENTS) expect(event).not.toMatch(/animal|weather turns|door|letter|phone/i)
  })

  it('brings someone in for one kind only, and says so when that kind is not among the two', () => {
    const arrival = EVENTS.findIndex((event) => /someone arrives/.test(event))
    expect(EVENTS.filter((event) => /someone arrives/.test(event))).toHaveLength(1)
    expect(directionCue('event', { events: [0, 4] })).toContain('No one new comes into the scene.')
    expect(directionCue('event', { events: [arrival, 4] })).not.toContain('No one new')
  })

  it('draws two different kinds, none of them offered the time before, and all of them over time', () => {
    let previous: number[] = []
    const seen = new Set<number>()
    for (let turn = 0; turn < 300; turn++) {
      const kinds = pickEvents(previous)
      expect(kinds).toHaveLength(EVENT_CHOICES)
      expect(new Set(kinds).size).toBe(EVENT_CHOICES)
      for (const kind of kinds) {
        expect(previous).not.toContain(kind)
        expect(EVENTS[kind]).toBeDefined()
        seen.add(kind)
      }
      previous = kinds
    }
    expect(seen.size).toBe(EVENTS.length)
    // The ends of the draw.
    expect(pickEvents([], () => 0)).toEqual([0, 1])
    expect(pickEvents([0, 1], () => 0)).toEqual([2, 3])
    expect(pickEvents([], () => 0.999999)).toEqual([EVENTS.length - 1, EVENTS.length - 2])
  })

  it('leans towards what the user enjoys, when the app knows it and told the model', () => {
    const plain = build([said('user', 'I wait.')], { direction: 'event', events: [0, 4] }).at(-1)!.content
    expect(plain).not.toContain('enjoys in a story')
    // Tastes that are on but still empty tell the model nothing: nothing to lean on.
    expect(build([said('user', 'I wait.')], { direction: 'event', events: [0, 4], tastes: { likes: [], dislikes: [] } }).at(-1)!.content).toBe(plain)

    const known = build([said('user', 'I wait.')], { direction: 'event', events: [0, 4], tastes: { likes: ['slow burn'], dislikes: ['gore'] } })
    expect(known.at(-1)!.content).toContain('Make it the kind of turn Ren enjoys in a story, going by what is noted above of how they like to play.')
    // The other directions say nothing of it.
    expect(build([said('user', 'I wait.')], { direction: 'place', tastes: { likes: ['slow burn'], dislikes: [] } }).at(-1)!.content).not.toContain('enjoys in a story')
  })

  it('goes at the end of what the user wrote, with the names filled in', () => {
    const [message] = build([said('user', 'I open the door.')], { direction: 'event', events: [4, 7] })
    expect(message!.content).toContain('I open the door.\n\n[Stage direction: something unexpected happens now')
    expect(message!.content).toContain('either Elara notices something that was there all along')
    expect(message!.content).toContain('; or a small accident or mishap happens to Elara.')
    expect(message!.content).not.toContain('{{char}}')
  })
})

describe('the character goes on by itself ("More…")', () => {
  it('is given a note to answer when it spoke last', () => {
    expect(build([said('user', 'Hello.'), said('assistant', 'You are late.')])).toEqual([
      { role: 'user', content: 'Hello.' },
      { role: 'assistant', content: 'You are late.' },
      { role: 'user', content: filled(GO_ON_CUE) },
    ])
    expect(filled(GO_ON_CUE)).toContain('Continue the scene as Elara')
  })

  it('adds nothing when the user spoke last: their message is what it answers', () => {
    expect(build([said('assistant', 'You are late.'), said('user', 'Sorry.')])).toEqual([
      { role: 'assistant', content: 'You are late.' },
      { role: 'user', content: 'Sorry.' },
    ])
  })

  it('opens the scene when nothing has been said yet', () => {
    expect(build([])).toEqual([{ role: 'user', content: '[Open the scene as Elara.]' }])
    expect(OPEN_CUE).toBe('[Open the scene as {{char}}.]')
  })

  it('reads its own messages in a row as one, so that turns still alternate', () => {
    const history = [said('assistant', 'You are late.'), said('assistant', 'Sit down.'), said('user', 'Fine.'), said('user', 'I sit.')]
    expect(build(history)).toEqual([
      { role: 'assistant', content: 'You are late.\n\nSit down.' },
      { role: 'user', content: 'Fine.\n\nI sit.' },
    ])
    expect(build([...history, said('assistant', 'Good.'), said('assistant', 'Now listen.')]).map((message) => message.role)).toEqual([
      'assistant',
      'user',
      'assistant',
      'user',
    ])
  })

  it('goes the same way in a chat with several characters', () => {
    const scene = [said('assistant', 'You are late.', 'elara'), said('assistant', 'Typical.', 'quill'), said('assistant', 'Sit down.', 'elara')]
    const conversation = build(scene, { others: [quill] })
    expect(conversation.map((message) => message.role)).toEqual(['assistant', 'user', 'assistant', 'user'])
    expect(conversation.at(-1)?.content).toBe(filled(GO_ON_CUE))
    // Quill did not speak last: the others' lines are what he answers.
    expect(build(scene, { character: quill, others: [elara] }).at(-1)).toEqual({ role: 'user', content: 'Elara: Sit down.' })
    expect(build([], { others: [quill] })).toEqual([{ role: 'user', content: '[Open the scene as Elara.]' }])
  })
})

describe('a stage direction', () => {
  it('is what the character answers when it spoke last', () => {
    const conversation = build([said('user', 'Hello.'), said('assistant', 'You are late.')], { direction: 'event' })
    expect(conversation.at(-1)).toEqual({ role: 'user', content: filled(directionCue('event')) })
    expect(conversation).toHaveLength(3)
  })

  it("goes at the end of the user's message when they wrote one", () => {
    const conversation = build([said('assistant', 'You are late.'), said('user', 'I open the door.')], { direction: 'place' })
    expect(conversation).toHaveLength(2)
    expect(conversation.at(-1)?.content).toBe(`I open the door.\n\n${filled(directionCue('place'))}`)
  })

  it('is given once in a chat with several characters, whoever spoke last', () => {
    const scene = [said('assistant', 'You are late.', 'elara'), said('assistant', 'Typical.', 'quill')]
    const afterQuill = build(scene, { others: [quill], direction: 'time' })
    expect(afterQuill.at(-1)?.content).toBe(`Quill: Typical.\n\n${filled(directionCue('time'))}`)
    const afterItself = build(scene.slice(0, 1), { others: [quill], direction: 'time' })
    expect(afterItself.at(-1)?.content).toBe(filled(directionCue('time')))
    for (const conversation of [afterQuill, afterItself]) {
      expect(conversation.filter((message) => message.content.includes('Stage direction'))).toHaveLength(1)
    }
  })

  it('opens the scene when nothing has been said yet', () => {
    expect(build([], { direction: 'event' })).toEqual([{ role: 'user', content: filled(directionCue('event')) }])
  })

  it('gives way to the rest of a reply that was cut short', () => {
    const conversation = build([said('user', 'Hello.'), said('assistant', 'You are')], { direction: 'event', continuing: true })
    expect(conversation.at(-1)?.content).toBe(CONTINUE_CUE)
  })

  it("comes before the card's own reminder, which the model reads last", () => {
    const strict = { ...elara, postHistoryInstructions: 'Stay in character.' }
    const conversation = build([said('assistant', 'You are late.')], { character: strict, direction: 'event' })
    expect(conversation.at(-1)?.content).toBe(`${filled(directionCue('event'))}\n\nStay in character.`)
  })
})
