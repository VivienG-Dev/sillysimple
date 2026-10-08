import type { CharacterDraft, Persona, Settings } from './types'

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1'

export const DEFAULT_SYSTEM_PROMPT =
  'You are {{char}}. Stay in character, write vivid prose, and never speak or act for {{user}}. ' +
  'End your replies in varied ways, on an action, a statement or a silence: a question to {{user}} at the end is the exception, not the habit.'

/**
 * What DEFAULT_SYSTEM_PROMPT was in earlier versions of the app. Settings that still hold
 * one of these were never changed by the user: they follow the default as it improves.
 */
export const EARLIER_SYSTEM_PROMPTS: readonly string[] = [
  'You are {{char}}. Stay in character, write vivid prose, and never speak or act for {{user}}.',
]

export const DEFAULT_SETTINGS: Settings = {
  onboardingDone: false,
  tourDone: false,
  connection: {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    model: null,
  },
  generation: {
    temperature: 0.8,
    maxTokens: 300,
    autoContext: true,
    contextSize: 8192,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    thinking: false,
    useCardPrompts: true,
    memory: true,
    keepPlace: true,
  },
  appearance: {
    characterColors: true,
    moods: true,
    moodsByMeaning: true,
    background: 'character',
    backgroundStrength: 50,
    backgroundVersion: 0,
  },
  adapt: {
    learnTastes: false,
    followStory: false,
    likes: [],
    dislikes: [],
    removed: [],
    inCards: true,
  },
  voice: {
    engine: 'off',
    baseUrl: 'https://api.openai.com/v1',
    elevenlabsModel: '',
    serverModel: 'gpt-4o-mini-tts',
    elevenlabsVoice: null,
    serverVoice: null,
    autoRead: false,
    read: 'all',
    elevenlabsNarrator: null,
    serverNarrator: null,
  },
  personas: [{ id: 'default', name: 'You', description: '' }],
  activePersonaId: 'default',
}

/** The persona in use. There is always one: the first of the list if the saved id is gone. */
export function activePersona(settings: Pick<Settings, 'personas' | 'activePersonaId'>): Persona {
  return (
    settings.personas.find((persona) => persona.id === settings.activePersonaId) ??
    settings.personas[0] ??
    DEFAULT_SETTINGS.personas[0]!
  )
}

/** A blank character, the starting point of "New character". */
export const EMPTY_CHARACTER: CharacterDraft = {
  name: '',
  tagline: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  alternateGreetings: [],
  exampleMessages: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  tags: [],
}
