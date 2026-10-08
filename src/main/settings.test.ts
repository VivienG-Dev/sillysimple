import { describe, expect, it } from 'vitest'
import { activePersona, DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT, EARLIER_SYSTEM_PROMPTS } from '@shared/defaults'
import { merge, upgrade } from './settings'

describe('settings', () => {
  it('turns the single persona of an earlier version into the first of the list', () => {
    const stored = { onboardingDone: true, persona: { name: 'Ren', description: 'A tired sailor.' } }
    const settings = merge(DEFAULT_SETTINGS, upgrade(stored))

    expect(settings.personas).toEqual([{ id: 'default', name: 'Ren', description: 'A tired sailor.' }])
    expect(activePersona(settings).name).toBe('Ren')
    expect(settings).not.toHaveProperty('persona')
    // Settings added since then take their default.
    expect(settings.generation.autoContext).toBe(true)
  })

  it('leaves a file that already has a list of personas alone', () => {
    const personas = [{ id: 'a', name: 'Ren', description: '' }, { id: 'b', name: 'Mira', description: '' }]
    const settings = merge(DEFAULT_SETTINGS, upgrade({ personas, activePersonaId: 'b', persona: { name: 'Stale' } }))
    expect(activePersona(settings).name).toBe('Mira')
  })

  it('replaces the list of personas whole, and keeps the one in use valid', () => {
    const two = merge(DEFAULT_SETTINGS, {
      personas: [{ id: 'a', name: 'Ren', description: '' }, { id: 'b', name: 'Mira', description: '' }],
      activePersonaId: 'b',
    })
    expect(activePersona(two).name).toBe('Mira')

    // Mira is deleted while in use: the first one takes over.
    const one = merge(two, { personas: [{ id: 'a', name: 'Ren', description: '' }] })
    expect(one.activePersonaId).toBe('a')

    // There is always someone: an empty list is not accepted.
    expect(merge(one, { personas: [] }).personas).toHaveLength(1)
  })

  it('follows the default system prompt as it improves, unless the user wrote their own', () => {
    const untouched = { generation: { systemPrompt: EARLIER_SYSTEM_PROMPTS[0]!, temperature: 1.1 } }
    const settings = merge(DEFAULT_SETTINGS, upgrade(untouched))
    expect(settings.generation.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(settings.generation.temperature).toBe(1.1)
    expect(untouched.generation.systemPrompt).toBe(EARLIER_SYSTEM_PROMPTS[0]) // What was read is not changed in place.

    const own = merge(DEFAULT_SETTINGS, upgrade({ generation: { systemPrompt: 'Be {{char}}. Short replies.' } }))
    expect(own.generation.systemPrompt).toBe('Be {{char}}. Short replies.')
    expect(merge(DEFAULT_SETTINGS, upgrade({ generation: { systemPrompt: '' } })).generation.systemPrompt).toBe('')

    expect(EARLIER_SYSTEM_PROMPTS).not.toContain(DEFAULT_SYSTEM_PROMPT)
    expect(DEFAULT_SYSTEM_PROMPT).toContain('a question to {{user}} at the end is the exception')
  })

  it('adapts to the user only when asked to, and keeps their tags when a switch changes', () => {
    expect(DEFAULT_SETTINGS.adapt).toEqual({ learnTastes: false, followStory: false, likes: [], dislikes: [], removed: [], inCards: true })
    // A settings file from before these options: they are off.
    expect(merge(DEFAULT_SETTINGS, upgrade({ onboardingDone: true })).adapt.learnTastes).toBe(false)

    const tagged = merge(DEFAULT_SETTINGS, { adapt: { learnTastes: true, likes: ['mystery'], removed: ['romance'] } })
    const off = merge(tagged, { adapt: { learnTastes: false } })
    expect(off.adapt).toEqual({ learnTastes: false, followStory: false, likes: ['mystery'], dislikes: [], removed: ['romance'], inCards: true })
    // A list is replaced whole.
    expect(merge(off, { adapt: { likes: ['banter'] } }).adapt.likes).toEqual(['banter'])
  })

  it('reads nothing aloud until a voice is chosen, and keeps each service’s choices apart', () => {
    expect(DEFAULT_SETTINGS.voice).toMatchObject({ engine: 'off', autoRead: false, read: 'all', elevenlabsVoice: null, serverVoice: null, elevenlabsNarrator: null, serverNarrator: null })

    const chosen = merge(DEFAULT_SETTINGS, { voice: { engine: 'elevenlabs', elevenlabsVoice: { id: 'v1', name: 'Rachel' } } })
    const switched = merge(chosen, { voice: { engine: 'server', serverVoice: { id: 'alloy', name: 'Alloy' } } })
    expect(switched.voice).toMatchObject({ engine: 'server', elevenlabsVoice: { id: 'v1', name: 'Rachel' }, serverVoice: { id: 'alloy', name: 'Alloy' }, baseUrl: 'https://api.openai.com/v1' })
    // A settings file from before voices existed gets the defaults.
    expect(merge(DEFAULT_SETTINGS, {}).voice).toEqual(DEFAULT_SETTINGS.voice)
  })

  it('puts the picture of the character behind the chat unless told otherwise', () => {
    expect(DEFAULT_SETTINGS.appearance).toMatchObject({ background: 'character', backgroundStrength: 50, backgroundVersion: 0 })
    // A settings file from before this option keeps its own choices and takes the default for this one.
    const older = merge(DEFAULT_SETTINGS, upgrade({ appearance: { characterColors: false, moods: true } } as never))
    expect(older.appearance).toMatchObject({ characterColors: false, background: 'character', backgroundStrength: 50 })
    expect(merge(older, { appearance: { background: 'none' } }).appearance).toMatchObject({ background: 'none', backgroundStrength: 50, characterColors: false })
  })

  it('merges a section key by key', () => {
    const settings = merge(DEFAULT_SETTINGS, { generation: { temperature: 1.1 } })
    expect(settings.generation).toMatchObject({ temperature: 1.1, maxTokens: 300, contextSize: 8192 })
  })
})
