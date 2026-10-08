import { describe, expect, it } from 'vitest'
import type { LlmMessage } from './buildMessages'
import { effectiveContextSize, estimateTokens, fitToContext, replyTokens } from './context'

const system: LlmMessage = { role: 'system', content: 'You are Elara.' }

/** A message of about `tokens` tokens (plus the per-message overhead). */
const message = (role: 'user' | 'assistant', label: string, tokens: number): LlmMessage => ({
  role,
  content: label.padEnd(Math.floor(tokens * 3.3), '.'),
})

describe('estimateTokens', () => {
  it('counts about one token per 3.3 characters of alphabetic text', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('a'.repeat(330))).toBe(100)
  })

  it('counts each CJK character as more than one token', () => {
    expect(estimateTokens('こんにちは')).toBe(6)
    expect(estimateTokens('こんにちは')).toBeGreaterThan(estimateTokens('hello'))
  })
})

describe('fitToContext', () => {
  it('keeps everything when it fits', () => {
    const messages = [system, message('assistant', 'A', 50), message('user', 'B', 50)]
    const fit = fitToContext(messages, { contextSize: 4096, replyTokens: 300 })

    expect(fit.messages).toEqual(messages)
    expect(fit.droppedCount).toBe(0)
    expect(fit.usedTokens).toBeLessThan(fit.budgetTokens)
  })

  it('leaves out the oldest messages first, never the system message', () => {
    const conversation = Array.from({ length: 10 }, (_, index) =>
      message(index % 2 ? 'user' : 'assistant', `#${index}`, 100),
    )
    // Budget: 1000 * 0.95 - 300 = 650 tokens, enough for the system message and 6 messages of ~104.
    const fit = fitToContext([system, ...conversation], { contextSize: 1000, replyTokens: 300 })

    expect(fit.budgetTokens).toBe(650)
    expect(fit.messages[0]).toBe(system)
    expect(fit.messages.slice(1).map((item) => item.content.slice(0, 2))).toEqual(['#4', '#5', '#6', '#7', '#8', '#9'])
    expect(fit.droppedCount).toBe(4)
    expect(fit.usedTokens).toBeLessThanOrEqual(fit.budgetTokens)
  })

  it('drops a run of old messages, never one from the middle', () => {
    // #1 is huge. #0 is small and would fit, but keeping it would leave a hole in the story.
    const conversation = [message('user', '#0', 10), message('assistant', '#1', 900), message('user', '#2', 100)]
    const fit = fitToContext([system, ...conversation], { contextSize: 1000, replyTokens: 300 })

    expect(fit.messages.slice(1).map((item) => item.content.slice(0, 2))).toEqual(['#2'])
    expect(fit.droppedCount).toBe(2)
  })

  it('always keeps the newest message, even when it is too long on its own', () => {
    const fit = fitToContext([system, message('user', 'huge', 5000)], { contextSize: 1000, replyTokens: 300 })

    expect(fit.messages).toHaveLength(2)
    expect(fit.droppedCount).toBe(0)
    expect(fit.usedTokens).toBeGreaterThan(fit.budgetTokens)
  })

  it('never returns a negative budget', () => {
    expect(fitToContext([system], { contextSize: 200, replyTokens: 800 }).budgetTokens).toBe(0)
  })
})

describe('replyTokens', () => {
  it('leaves headroom above the length aimed for, so a reply can end on its own', () => {
    expect(replyTokens({ maxTokens: 300, thinking: false })).toBe(450)
    expect(replyTokens({ maxTokens: 80, thinking: false })).toBe(120)
  })

  it('adds room to think only when thinking is on', () => {
    expect(replyTokens({ maxTokens: 300, thinking: true })).toBe(2450)
  })
})

describe('effectiveContextSize', () => {
  const auto = { autoContext: true, contextSize: 8192 }

  it('uses what the model server reports when the setting is automatic', () => {
    expect(effectiveContextSize(auto, 16384)).toBe(16384)
    expect(effectiveContextSize(auto, 4096)).toBe(4096)
  })

  it('does not follow a model into a context of hundreds of thousands of tokens', () => {
    expect(effectiveContextSize(auto, 1_000_000)).toBe(32768)
  })

  it('falls back on the size set by hand when the server does not say', () => {
    expect(effectiveContextSize(auto, null)).toBe(8192)
    expect(effectiveContextSize(auto, 0)).toBe(8192)
  })

  it('ignores the server when the size is set by hand', () => {
    expect(effectiveContextSize({ autoContext: false, contextSize: 65536 }, 4096)).toBe(65536)
  })
})
