import type { CloudProviderId, ConnectionSettings, VoiceSettings } from './types'

// The online services the app can talk to. All of them accept the OpenAI chat
// format, so one client serves them all (src/core/providers); what differs
// between them is written in src/core/providers/dialects.ts.

export interface CloudProvider {
  id: CloudProviderId
  name: string
  /** One line under the name in the picker. */
  description: string
  baseUrl: string
  /** The page where the user creates an API key. */
  keyUrl: string
  /** What a key of this service looks like, as a placeholder. */
  keyPlaceholder: string
}

export const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'One key for hundreds of models, some of them free.',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-…',
  },
  {
    id: 'anthropic',
    name: 'Claude',
    description: 'The Claude models, from Anthropic.',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'The GPT models.',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/settings/organization/api-keys',
    keyPlaceholder: 'sk-…',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'The Mistral models. Has a free tier.',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai',
    keyPlaceholder: 'Your Mistral API key',
  },
]

export function cloudProvider(id: CloudProviderId | undefined): CloudProvider | null {
  return CLOUD_PROVIDERS.find((provider) => provider.id === id) ?? null
}

/**
 * The name an API key is saved under.
 * - an online service: its id ("openrouter")
 * - a custom server: "custom:" + the server's origin, so a key typed for one
 *   server is never sent to another one
 * - Ollama, or an address that is not a URL: none
 */
export function keySlot(connection: Pick<ConnectionSettings, 'kind' | 'baseUrl' | 'provider'>): string | null {
  if (connection.kind === 'cloud') return cloudProvider(connection.provider)?.id ?? null
  if (connection.kind !== 'custom') return null
  try {
    return `custom:${new URL(connection.baseUrl).origin}`
  } catch {
    return null
  }
}

/** True for an address on this computer (localhost, 127.x.x.x, ::1). */
export function isLocalAddress(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '::1' || /^127(\.\d+){3}$/.test(host)
  } catch {
    return false
  }
}

// --- Voice services ---------------------------------------------------------------

export const ELEVENLABS = {
  name: 'ElevenLabs',
  baseUrl: 'https://api.elevenlabs.io',
  /** The page where the user creates an API key. */
  keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
  keyPlaceholder: 'sk_…',
}

/**
 * The name the API key of a voice service is saved under. Apart from the chat keys on
 * purpose: a key typed for speech is never sent to a chat server, nor the other way round.
 * - ElevenLabs: "voice:elevenlabs"
 * - a speech server: "voice:custom:" + its origin
 * - no voice, or an address that is not a URL: none
 */
export function voiceKeySlot(voice: Pick<VoiceSettings, 'engine' | 'baseUrl'>): string | null {
  if (voice.engine === 'elevenlabs') return 'voice:elevenlabs'
  if (voice.engine !== 'server') return null
  try {
    return `voice:custom:${new URL(voice.baseUrl).origin}`
  } catch {
    return null
  }
}

/**
 * Who receives the text that is read aloud: "ElevenLabs", the host of a speech server
 * on the internet, or null when it stays on this computer (no voice, or a local server).
 */
export function voiceDestination(voice: Pick<VoiceSettings, 'engine' | 'baseUrl'>): string | null {
  if (voice.engine === 'elevenlabs') return ELEVENLABS.name
  if (voice.engine !== 'server' || isLocalAddress(voice.baseUrl)) return null
  try {
    return new URL(voice.baseUrl).host
  } catch {
    return 'that server'
  }
}
