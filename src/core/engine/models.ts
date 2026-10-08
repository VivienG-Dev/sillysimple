import type { ModelInfo, ModelOffer, ModelTier } from '@shared/types'
import { sameOllamaModel } from '../providers/ollama'

// The app's own chat models: three sizes of the same family, so that everything the app
// asks of a model (writing a card, summing up a chat, staging a scene) is tuned once.
//
// The names are exact tags of Ollama's library, with the quantization written out
// (q4_K_M): the same file on every kind of computer, and a size known in advance. The
// short tags ("gemma4:26b") may resolve to another format from one computer to the next.
//
// To change a model, change its line here: nothing else names one.

export interface BuiltinModel {
  tier: ModelTier
  id: string
  name: string
  /** The exact model of the family, as those who know them call it: shown next to the name. */
  variant: string
  blurb: string
  /** What is downloaded, and kept on disk. */
  bytes: number
  /** Offered on computers with at least this much memory, in GiB. */
  needsMemory: number
}

export const BUILTIN_MODELS: readonly BuiltinModel[] = [
  {
    tier: 'small',
    id: 'gemma4:e2b-it-q4_K_M',
    name: 'Gemma 4 · Small',
    variant: 'E2B',
    blurb: 'Light and quick. Fine for a chat, weaker on long stories.',
    bytes: 4.6e9,
    needsMemory: 0,
  },
  {
    tier: 'medium',
    id: 'gemma4:12b-it-q4_K_M',
    name: 'Gemma 4 · Medium',
    variant: '12B',
    blurb: 'A good balance: stays in character and writes with care.',
    bytes: 8.0e9,
    // A "16 GB" computer reports a little less, more so when its graphics share that memory.
    needsMemory: 13.5,
  },
  {
    tier: 'large',
    id: 'gemma4:26b-a4b-it-q4_K_M',
    name: 'Gemma 4 · Large',
    variant: '26B A4B',
    blurb: 'The best writing of the three, and the heaviest.',
    bytes: 18e9,
    // A "32 GB" computer. On 24 GB the model alone would take all the memory graphics may use.
    needsMemory: 29,
  },
]

/**
 * The app's own model for what a text means (not for writing): EmbeddingGemma 2, its
 * text-only size. First use: the mood of a reply (src/core/mood/senseMood.ts). Like the
 * chat models, the tag says exactly which file.
 *
 * In Ollama it only runs on the MLX engine, which Ollama's downloads carry on a Mac with
 * an Apple chip and nowhere else (0.40.0: on Windows and Linux it is a separate archive,
 * for NVIDIA cards only). Elsewhere the app does without it.
 */
export const SENSE_MODEL = {
  id: 'embeddinggemma-2:270m-nvfp4-text',
  name: 'EmbeddingGemma 2',
  bytes: 378e6,
  /** The first Ollama that knows this model. */
  needsOllama: '0.40.0',
} as const

/** True where the app's Ollama can run `SENSE_MODEL`. */
export function senseSupported(platform: string, arch: string): boolean {
  return platform === 'darwin' && arch === 'arm64'
}

/**
 * True for a model that turns text into numbers and cannot write a reply: it has no
 * place in a list of chat models. Ollama's list does not say which is which; their names do.
 */
export function isEmbeddingModel(id: string): boolean {
  return /embed|(?:^|\/)(?:bge-|all-minilm|paraphrase-)/i.test(id)
}

const GIB = 2 ** 30

export interface Offers {
  offers: ModelOffer[]
  /** How many of the app's models this computer has too little memory for. */
  tooLarge: number
}

/**
 * The app's models for a computer with this much memory: every one that fits, smallest
 * first, so that someone with room has the choice. The largest that fits is the one
 * recommended. `installed`: the models Ollama already holds.
 */
export function offersFor(memoryBytes: number, installed: readonly Pick<ModelInfo, 'id'>[] = []): Offers {
  const memory = memoryBytes / GIB
  const fitting = BUILTIN_MODELS.filter((model) => memory >= model.needsMemory)
  const recommended = fitting.at(-1)

  return {
    offers: fitting.map(({ needsMemory: _needs, ...model }) => ({
      ...model,
      recommended: model.id === recommended?.id,
      installed: installed.some((item) => sameOllamaModel(item.id, model.id)),
    })),
    tooLarge: BUILTIN_MODELS.length - fitting.length,
  }
}

/** True for one of the app's own models, whatever this computer's memory. */
export function isBuiltinModel(id: string): boolean {
  return BUILTIN_MODELS.some((model) => sameOllamaModel(model.id, id))
}

/** About how much a model of the app's takes to download. Null for any other model: only Ollama knows. */
export function builtinModelBytes(id: string): number | null {
  return BUILTIN_MODELS.find((model) => sameOllamaModel(model.id, id))?.bytes ?? null
}

/**
 * The context the app's own Ollama loads models with. Ollama's default is 4,096 tokens
 * on most computers, which a roleplay chat fills in a few messages; a long context
 * costs memory, so it follows what the computer has.
 */
export function engineContextLength(memoryBytes: number): number {
  return memoryBytes / GIB >= 29 ? 16_384 : 8_192
}

/**
 * A model name typed by the user, made fit for Ollama, or null when it cannot be one.
 * What Ollama accepts: a name from its library ("qwen3:8b", "someone/model:tag") or a
 * GGUF repository on Hugging Face ("hf.co/someone/model-GGUF:Q4_K_M"). A whole command
 * copied from a web page ("ollama run …") is accepted too.
 */
export function cleanModelName(typed: string): string | null {
  const name = typed
    .trim()
    .replace(/^ollama\s+(run|pull)\s+/i, '')
    .replace(/^https?:\/\/(huggingface\.co|hf\.co)\//i, 'hf.co/')
    .replace(/^https?:\/\/ollama\.com\/(library\/)?/i, '')
    .trim()
  if (name.length === 0 || name.length > 200) return null
  // Letters, digits and . _ - within each part; one optional ":tag" at the end.
  const part = '[A-Za-z0-9][A-Za-z0-9._-]*'
  // "model" or "someone/model" in Ollama's library, or "hf.co/someone/repository". A name
  // of three parts starts with the server to ask: no other server than those is accepted.
  const library = new RegExp(`^${part}(/${part})?(:${part})?$`)
  const huggingFace = new RegExp(`^(hf\\.co|huggingface\\.co)/${part}/${part}(:${part})?$`, 'i')
  return library.test(name) || huggingFace.test(name) ? name : null
}
