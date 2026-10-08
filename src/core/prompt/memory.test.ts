import { describe, expect, it } from 'vitest'
import { EMPTY_CHARACTER } from '@shared/defaults'
import type { Character } from '@shared/types'
import { buildMessages } from './buildMessages'
import { estimateTokens } from './context'
import { cleanMemory, foldBatches, memoryReplyTokens, memoryRequest, memorySection, memoryTokens, planFold } from './memory'

/** A message of about `tokens` tokens. */
const text = (tokens: number, word = 'word'): string => `${word} `.repeat(Math.round((tokens * 3.3) / (word.length + 1))).trim()

describe('how large a memory may be', () => {
  it('is a share of the context, within bounds', () => {
    expect(memoryTokens(8192)).toBe(700) // 15 % would be 1229: capped.
    expect(memoryTokens(4096)).toBe(614)
    expect(memoryTokens(2048)).toBe(307)
    expect(memoryTokens(1024)).toBe(200) // 15 % would be 154: never less than this.
    expect(memoryReplyTokens(4096)).toBeGreaterThan(memoryTokens(4096))
  })
})

describe('deciding what to fold', () => {
  it('folds nothing while everything fits', () => {
    expect(planFold([text(100), text(100), text(100)], 400)).toBe(0)
    expect(planFold([], 400)).toBe(0)
  })

  it('folds the oldest messages and keeps the newest, up to half the room', () => {
    const contents = Array.from({ length: 10 }, () => text(96)) // 100 tokens each with its overhead.
    // 1000 tokens for a room of 800: too much. Half the room is 400: four messages stay.
    expect(planFold(contents, 800)).toBe(6)
  })

  it('leaves room for many more messages after a fold', () => {
    const contents = Array.from({ length: 40 }, () => text(96))
    const folded = planFold(contents, 2000)
    const kept = contents.slice(folded)
    expect(kept.length * 100).toBeLessThanOrEqual(1000)
    expect(planFold(kept, 2000)).toBe(0)
    expect(planFold([...kept, ...Array.from({ length: 9 }, () => text(96))], 2000)).toBe(0) // Nine more messages before the next one.
  })

  it('always keeps the last two messages, however long they are', () => {
    expect(planFold([text(50), text(50), text(900), text(900)], 600)).toBe(2)
    expect(planFold([text(900), text(900)], 600)).toBe(0) // Nothing older to fold.
    expect(planFold([text(900)], 600)).toBe(0)
  })
})

describe('cutting what is folded into requests the model can read', () => {
  const line = (tokens: number, name = 'Ren') => ({ name, content: text(tokens) })

  it('makes one batch when everything fits in a request', () => {
    expect(foldBatches([line(100), line(100)], 1000)).toHaveLength(1)
  })

  it('starts a new batch when the next message would not fit, keeping the order', () => {
    const lines = Array.from({ length: 7 }, (_, index) => ({ name: `N${index}`, content: text(280) }))
    const batches = foldBatches(lines, 1000)
    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 1])
    expect(batches.flat().map((item) => item.name)).toEqual(lines.map((item) => item.name))
  })

  it('shortens a single message that is longer than a whole request', () => {
    const content = foldBatches([line(5000)], 1000)[0]?.[0]?.content ?? ''
    expect(content.endsWith('[…]')).toBe(true)
    expect(estimateTokens(content)).toBeLessThan(1100)
  })
})

describe('the request that updates the memory', () => {
  const lines = [
    { name: 'Elara', content: 'You are late.' },
    { name: 'Ren', content: 'The road was flooded.' },
  ]

  it('gives the memory so far, then the messages with their names', () => {
    const [system, user] = memoryRequest({ summary: 'Ren reached the lighthouse.', lines, contextSize: 8192 })
    expect(system?.content).toContain('460 words at most')
    expect(user?.content).toBe(
      'Memory so far:\nRen reached the lighthouse.\n\nNext messages of the chat:\nElara: You are late.\n\nRen: The road was flooded.\n\nWrite the memory anew.',
    )
  })

  it('says so when there is no memory yet', () => {
    const [, user] = memoryRequest({ summary: '  ', lines, contextSize: 2048 })
    expect(user?.content).toContain('Memory so far:\n(nothing yet: this is the beginning of the chat)')
  })

  it('asks for a shorter memory from a model that reads less', () => {
    expect(memoryRequest({ summary: '', lines, contextSize: 2048 })[0]?.content).toContain('200 words at most')
  })
})

describe('what the model wrote', () => {
  it('is kept as it is when it is just the memory', () => {
    expect(cleanMemory('  Ren reached the lighthouse.\n\nElara let him in.  ')).toBe('Ren reached the lighthouse.\n\nElara let him in.')
  })

  it('loses the label or the code fence some models put around it', () => {
    expect(cleanMemory('**Updated memory:**\n\nRen reached the lighthouse.')).toBe('Ren reached the lighthouse.')
    expect(cleanMemory('Memory:\nRen reached the lighthouse.')).toBe('Ren reached the lighthouse.')
    expect(cleanMemory('```\nRen reached the lighthouse.\n```')).toBe('Ren reached the lighthouse.')
    expect(cleanMemory('Memory of the sea haunted her.')).toBe('Memory of the sea haunted her.') // A sentence, not a label.
  })
})

describe('the memory in the prompt', () => {
  const elara: Character = { ...EMPTY_CHARACTER, id: 'elara', name: 'Elara', description: '{{char}} keeps the light.', lorebook: null }
  const persona = { name: 'Ren', description: '' }

  it('is given to the model in the system message, after the card', () => {
    const [system, ...conversation] = buildMessages({
      character: elara,
      persona,
      systemPrompt: 'Be {{char}}.',
      history: [{ role: 'user', content: 'And then?' }],
      memory: 'Ren reached the lighthouse in a storm.',
    })
    expect(system?.content).toBe(
      `Be Elara.\n\nElara keeps the light.\n\n${memorySection('Ren reached the lighthouse in a storm.')}`,
    )
    expect(conversation).toEqual([{ role: 'user', content: 'And then?' }])
  })

  it('adds nothing when there is no memory', () => {
    const [system] = buildMessages({ character: elara, persona, systemPrompt: 'Be {{char}}.', history: [], memory: '  ' })
    expect(system?.content).toBe('Be Elara.\n\nElara keeps the light.')
    expect(memorySection('')).toBe('')
  })
})
