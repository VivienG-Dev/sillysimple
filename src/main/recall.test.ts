import { describe, expect, it } from 'vitest'
import { createRecall, type OldMessage } from './recall'

/**
 * A model that knows a few words: each text is a point along the words it holds, so an
 * old message and a later line that share one are close.
 */
const WORDS = ['compass', 'kitten', 'lighthouse', 'homework', 'bread']
const vectorOf = (text: string): number[] => {
  const lower = text.toLowerCase()
  const vector = WORDS.map((word) => (lower.includes(word) ? 1 : 0))
  if (lower.includes('north')) vector[0] = 1 // what "means the same" stands for here
  return vector
}

function fakeSense(answer = true) {
  const asked: { texts: string[]; waitMs: number; use: string | undefined }[] = []
  return {
    asked,
    sense: {
      embed: async (texts: string[], waitMs: number, use?: 'lore' | 'recall') => {
        asked.push({ texts, waitMs, use })
        return answer ? texts.map(vectorOf) : null
      },
    },
  }
}

const OLD: OldMessage[] = [
  { role: 'user', name: 'Robin', content: "Take this. It was my grandfather's brass compass, it always works." },
  { role: 'assistant', name: 'Suzu', content: '*She holds it in both hands.* "I will keep it safe. I promise you that."' },
  { role: 'user', name: 'Robin', content: 'Look, a kitten behind the bins near the old clock tower.' },
  { role: 'assistant', name: 'Suzu', content: 'Let us meet at the lighthouse at eight on Saturday evening.' },
  { role: 'user', name: 'Robin', content: 'Did you finish the homework about the trains leaving the stations?' },
]

describe('old moments brought back', () => {
  it('brings back the old message the chat comes back to, word for word, and asks about each old message once', async () => {
    const { sense, asked } = fakeSense()
    const lines: string[] = []
    const recall = createRecall(sense, (line) => lines.push(line))

    const recalled = await recall(OLD, ['*She waves.*', 'Do you still have the thing that points north?'], 8192)
    // The message found, with the reply that answers it.
    expect(recalled).toEqual([
      { name: 'Robin', text: OLD[0]!.content },
      { name: 'Suzu', text: OLD[1]!.content },
    ])
    expect(asked[0]!.use).toBe('recall')
    expect(lines[0]).toMatch(/^\[recall\] #1 [\d.]+ of 5 old messages/)
    expect(lines[0]).not.toContain('north')

    const passagesAsked = asked[0]!.texts.length
    await recall(OLD, ['Where do we meet, the lighthouse?'], 8192)
    // Only the latest messages are asked about now.
    expect(asked[1]!.texts.length).toBeLessThan(passagesAsked)
    expect(asked[1]!.texts.some((text) => text.includes('clock tower'))).toBe(false)
  })

  it('brings back nothing when nothing is close, or when the model does not answer', async () => {
    const recall = createRecall(fakeSense().sense)
    expect(await recall(OLD, ['Pass me the umbrella, please.'], 8192)).toEqual([])
    expect(await recall([], ['compass?'], 8192)).toBeUndefined()
    expect(await createRecall(fakeSense(false).sense)(OLD, ['The compass?'], 8192)).toBeUndefined()
  })

  it('reads a long chat in the background, and brings back what is known meanwhile', async () => {
    const { sense, asked } = fakeSense()
    const recall = createRecall(sense)
    const many: OldMessage[] = [
      ...Array.from({ length: 60 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        name: 'Robin',
        content: `Message number ${index} about nothing much. It rained again today.`,
      })),
      ...OLD,
    ]
    await recall(many, ['Have you got my compass?'], 8192)
    // The reply did not wait for every old message: they were asked apart, with time to answer.
    expect(asked.some((call) => call.waitMs > 10_000)).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const recalled = await recall(many, ['Have you got my compass?'], 8192)
    expect(recalled?.[0]?.text).toContain('compass')
  })
})
