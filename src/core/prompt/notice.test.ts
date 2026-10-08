import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { estimateTokens } from './context'
import { lengthInstruction } from './replyLength'
import { memorySection } from './memory'
import {
  addTastes,
  cleanTag,
  dueForNotice,
  latestLines,
  MAX_NEW_TAGS,
  MAX_TAGS,
  NOTICE_AFTER,
  noticeRequest,
  readNotice,
  storySection,
  tastesSection,
} from './notice'

const lines = [
  { name: 'Elara', content: 'You are late.' },
  { name: 'Ren', content: 'Skip the lecture. What did you find?' },
]
const nothing = { likes: [], dislikes: [] }

describe('when the latest messages are read', () => {
  it('waits until the user has written enough since the last time', () => {
    const turns = (count: number) => Array.from({ length: count }, () => ['user', 'assistant'] as const).flat()
    expect(dueForNotice(turns(NOTICE_AFTER - 1))).toBe(false)
    expect(dueForNotice(turns(NOTICE_AFTER))).toBe(true)
    // The character going on by itself tells nothing about the user.
    expect(dueForNotice(Array.from({ length: 40 }, () => 'assistant' as const))).toBe(false)
    expect(dueForNotice([])).toBe(false)
  })

  it('reads the newest messages that fit, in their order', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ name: `N${index}`, content: 'word '.repeat(60).trim() }))
    const kept = latestLines(many, 1000)
    expect(kept.length).toBeGreaterThan(3)
    expect(kept.length).toBeLessThan(30)
    expect(kept.at(-1)?.name).toBe('N29')
    expect(kept.map((line) => line.name)).toEqual(many.slice(-kept.length).map((line) => line.name))
    expect(latestLines(many, 100000)).toHaveLength(30)
    expect(latestLines([], 1000)).toEqual([])
  })

  it('shortens a message that would take the whole room', () => {
    const [only] = latestLines([{ name: 'Elara', content: 'word '.repeat(5000) }], 1000)
    expect(only?.content.endsWith('[…]')).toBe(true)
    expect(estimateTokens(only?.content ?? '')).toBeLessThan(400)
  })
})

describe('the request', () => {
  const input = { lines, userName: 'Ren', wantStory: true, story: '', wantTastes: true, tastes: nothing, removed: [] }

  it('asks for the three sections, and says what a tag is and is not', () => {
    const [system, user] = noticeRequest(input)
    expect(system?.content).toContain('### STORY\n')
    expect(system?.content).toContain('### LIKES\n')
    expect(system?.content).toContain('### DISLIKES\n')
    expect(system?.content).toContain('Never about who Ren is in real life')
    expect(system?.content).toContain('never a fact of this one story')
    expect(user?.content).toBe(
      'The note on this story so far:\n(none yet)\nAlready noted as liked: (nothing yet)\nAlready noted as disliked: (nothing yet)\n' +
        'Taken out by Ren, never to be proposed again: (nothing yet)\n\n' +
        'Latest messages of the chat:\nElara: You are late.\n\nRen: Skip the lecture. What did you find?',
    )
  })

  it('gives what is already noted, and what the user took out', () => {
    const [, user] = noticeRequest({
      ...input,
      story: 'Ren wants answers about the lamp.',
      tastes: { likes: ['mystery', 'short replies'], dislikes: ['lectures'] },
      removed: ['romance'],
    })
    expect(user?.content).toContain('The note on this story so far:\nRen wants answers about the lamp.')
    expect(user?.content).toContain('Already noted as liked: mystery, short replies')
    expect(user?.content).toContain('Already noted as disliked: lectures')
    expect(user?.content).toContain('Taken out by Ren, never to be proposed again: romance')
  })

  it('only asks for what is turned on', () => {
    const [storyOnly, storyKnown] = noticeRequest({ ...input, wantTastes: false })
    expect(storyOnly?.content).toContain('### STORY')
    expect(storyOnly?.content).not.toMatch(/LIKES|tag/)
    expect(storyOnly?.content).toContain('this section, its heading on its own line')
    expect(storyKnown?.content).not.toContain('Already noted')

    const [tastesOnly, tastesKnown] = noticeRequest({ ...input, wantStory: false })
    expect(tastesOnly?.content).not.toContain('### STORY')
    expect(tastesOnly?.content).toContain('### DISLIKES')
    expect(tastesKnown?.content).not.toContain('The note on this story')
  })
})

describe("the model's answer", () => {
  it('is read section by section', () => {
    const noticed = readNotice(
      '### STORY\nRen is pushing Elara to say what she found. He seems to want the mystery to move faster.\n\n### LIKES\nmystery, short replies\n\n### DISLIKES\nlectures',
    )
    expect(noticed).toEqual({
      story: 'Ren is pushing Elara to say what she found. He seems to want the mystery to move faster.',
      likes: ['mystery', 'short replies'],
      dislikes: ['lectures'],
    })
  })

  it('copes with the ways models write headings and lists', () => {
    expect(readNotice('**STORY:** Heading for the cellar.\n**LIKES:** Mystery, "Dry humour".\n**DISLIKES:** none')).toEqual({
      story: 'Heading for the cellar.',
      likes: ['mystery', 'dry humour'],
      dislikes: [],
    })
    expect(readNotice('LIKES\n- slow burn\n- banter\nDISLIKES\n1. time skips\n2. Long monologues')).toEqual({
      story: '',
      likes: ['slow burn', 'banter'],
      dislikes: ['time skips', 'long monologues'],
    })
    expect(readNotice('```\n## Likes: mystery; banter\n```').likes).toEqual(['mystery', 'banter'])
  })

  it('does not take a sentence for a heading', () => {
    const noticed = readNotice('### STORY\nRen wants out.\nLikes of his are not the point here.\n### LIKES\nnone')
    expect(noticed.story).toBe('Ren wants out.\nLikes of his are not the point here.')
    expect(noticed.likes).toEqual([])
  })

  it('gives nothing when the answer is not what was asked', () => {
    expect(readNotice('I am sorry, I cannot help with that.')).toEqual({ story: '', likes: [], dislikes: [] })
    expect(readNotice('')).toEqual({ story: '', likes: [], dislikes: [] })
    expect(readNotice('### STORY\n(none yet)\n### LIKES\nNothing new').story).toBe('')
  })

  it('keeps the note short, and drops what is not a tag', () => {
    expect(readNotice(`### STORY\n${'word '.repeat(400)}`).story.length).toBeLessThanOrEqual(600)
    expect(readNotice('### LIKES\nmystery, mystery, Ren seems to enjoy it when Elara teases him about being late').likes).toEqual(['mystery'])
  })
})

describe('a tag', () => {
  it('is kept lowercase and bare', () => {
    expect(cleanTag('  “Slow Burn”. ')).toBe('slow burn')
    expect(cleanTag('- dry   humour')).toBe('dry humour')
    expect(cleanTag('3) banter')).toBe('banter')
    expect(cleanTag('humour noir')).toBe('humour noir')
  })

  it('is not a way of saying there is none, nor a sentence', () => {
    for (const none of ['none', 'None.', 'n/a', 'nothing new', 'aucun', '-', '', '   ']) expect(cleanTag(none)).toBe('')
    expect(cleanTag('scenes where the character slowly opens up')).toBe('')
    expect(cleanTag('x'.repeat(40))).toBe('')
  })
})

describe('adding what the model proposed', () => {
  it('adds new tags and says which', () => {
    const next = addTastes({ likes: ['mystery'], dislikes: [], removed: [] }, { likes: ['banter'], dislikes: ['time skips'] })
    expect(next.likes).toEqual(['mystery', 'banter'])
    expect(next.dislikes).toEqual(['time skips'])
    expect(next.added).toEqual({ likes: ['banter'], dislikes: ['time skips'] })
  })

  it('leaves alone what is already noted, on either side, whatever the capitals', () => {
    const next = addTastes({ likes: ['mystery'], dislikes: ['romance'], removed: [] }, { likes: ['Mystery', 'romance'], dislikes: ['mystery'] })
    expect(next.likes).toEqual(['mystery'])
    expect(next.dislikes).toEqual(['romance'])
    expect(next.added).toEqual(nothing)
  })

  it('never brings back a tag the user took out', () => {
    const next = addTastes({ likes: [], dislikes: [], removed: ['romance'] }, { likes: ['Romance', 'banter'], dislikes: ['romance'] })
    expect(next.likes).toEqual(['banter'])
    expect(next.dislikes).toEqual([])
  })

  it('does not note the same tag as liked and disliked at once', () => {
    const next = addTastes({ ...nothing, removed: [] }, { likes: ['banter'], dislikes: ['banter', 'gore'] })
    expect(next.likes).toEqual(['banter'])
    expect(next.dislikes).toEqual(['gore'])
  })

  it('learns little by little, and stops when a list is full', () => {
    const many = ['a', 'b', 'c', 'd', 'e']
    expect(addTastes({ ...nothing, removed: [] }, { likes: many, dislikes: [] }).added.likes).toHaveLength(MAX_NEW_TAGS)

    const full = Array.from({ length: MAX_TAGS - 1 }, (_, index) => `tag ${index}`)
    const next = addTastes({ likes: full, dislikes: [], removed: [] }, { likes: ['a', 'b'], dislikes: ['c'] })
    expect(next.likes).toHaveLength(MAX_TAGS)
    expect(next.added.likes).toEqual(['a'])
    expect(next.dislikes).toEqual(['c'])
  })

  it('does not change the lists it was given', () => {
    const current = { likes: ['mystery'], dislikes: [], removed: [] }
    addTastes(current, { likes: ['banter'], dislikes: ['gore'] })
    expect(current).toEqual({ likes: ['mystery'], dislikes: [], removed: [] })
  })
})

describe('what the characters are told', () => {
  const elara: Character = { ...EMPTY_CHARACTER, id: 'elara', name: 'Elara', description: '{{char}} keeps the light.', lorebook: null }
  const persona = { name: 'Ren', description: '' }
  const history = [{ role: 'user' as const, content: 'And then?' }]

  it('says how the user likes to play, as something to take into account', () => {
    expect(tastesSection({ likes: ['mystery', 'banter'], dislikes: ['time skips'] })).toBe(
      'How {{user}} likes to play, noticed over earlier chats. Take it into account without forcing it, and keep surprising them.\n' +
        'Enjoys: mystery, banter.\nDoes not enjoy: time skips.',
    )
    expect(tastesSection({ likes: [], dislikes: ['gore'] })).not.toContain('Enjoys')
    expect(tastesSection(nothing)).toBe('')
    expect(tastesSection(undefined)).toBe('')
  })

  it('says where the story seems to be heading, as a guess', () => {
    expect(storySection(' Ren wants answers. ')).toBe(
      'Where this story seems to be heading (a guess: if {{user}} goes another way, follow them):\nRen wants answers.',
    )
    expect(storySection('  ')).toBe('')
    expect(storySection(undefined)).toBe('')
  })

  it('puts both in the system message: after the memory, before the length', () => {
    const [system] = buildMessages({
      character: elara,
      persona,
      systemPrompt: 'Be {{char}}.',
      history,
      memory: 'Ren reached the lighthouse.',
      story: 'Ren wants answers.',
      tastes: { likes: ['mystery'], dislikes: [] },
      replyLength: 300,
    })
    expect(system?.content).toBe(
      [
        'Be Elara.',
        'Elara keeps the light.',
        memorySection('Ren reached the lighthouse.'),
        'Where this story seems to be heading (a guess: if Ren goes another way, follow them):\nRen wants answers.',
        'How Ren likes to play, noticed over earlier chats. Take it into account without forcing it, and keep surprising them.\nEnjoys: mystery.',
        lengthInstruction(300),
      ].join('\n\n'),
    )
  })

  it('adds nothing when there is nothing to say', () => {
    const [system] = buildMessages({ character: elara, persona, systemPrompt: 'Be {{char}}.', history, story: '', tastes: nothing })
    expect(system?.content).toBe('Be Elara.\n\nElara keeps the light.')
  })
})
