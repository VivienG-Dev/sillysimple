import type { GraphicsCard, ModelInfo, ModelOffer, ModelTier } from '@shared/types'
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
  /**
   * Offered on computers with at least this much memory, in GiB. On a Mac, its memory
   * (shared with the chip that runs the model). On a PC, its memory and its graphics
   * card's together: the model is split between the two, most of it on the card.
   */
  needsMemory: number
  /**
   * On a PC: the memory of the graphics card it runs well with, in GiB. A little short of
   * the model's whole size is fine: Ollama puts the last few layers on the processor, and
   * replies stay quick. Far short, and most of the model runs on the processor.
   */
  needsGraphics: number
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
    // A 6 GB card.
    needsGraphics: 5.5,
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
    // An 8 GB card, the most common: it holds nearly all of the model.
    needsGraphics: 7.5,
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
    // A 16 GB card. Only 4B of its 26B are at work for each word, so a part on the processor costs less than for another model.
    needsGraphics: 15,
  },
]

export interface SenseModel {
  id: string
  name: string
  bytes: number
  /** The first Ollama that knows this model. */
  needsOllama: string
}

/**
 * The app's own model for what a text means (not for writing): EmbeddingGemma 2, its
 * text-only size. First use: the mood of a reply (src/core/mood/senseMood.ts). Like the
 * chat models, the tag says exactly which file.
 *
 * Two files of the same model. This one, compressed (nvfp4), runs on Ollama's MLX engine,
 * which Ollama's downloads carry on a Mac with an Apple chip only.
 */
export const SENSE_MODEL: SenseModel = {
  id: 'embeddinggemma-2:270m-nvfp4-text',
  name: 'EmbeddingGemma 2',
  bytes: 378e6,
  needsOllama: '0.40.0',
}

/**
 * The same model, not compressed (bf16): it runs on Ollama's usual engine, so everywhere
 * (Windows, Linux, a Mac with an Intel chip). Beware: Ollama's short tags ("270m",
 * "latest") are the MLX files. Measured with the mood lab on 8 October 2026, with the same
 * thresholds: 79 of the 142 replies read right, against 82 for the compressed one, and no
 * mood shown where there is none for either; about 15 ms a reply.
 */
export const SENSE_MODEL_ANYWHERE: SenseModel = {
  id: 'embeddinggemma-2:270m-bf16-text',
  name: 'EmbeddingGemma 2',
  bytes: 574e6,
  needsOllama: '0.40.0',
}

/** Which file of the model the app uses on this kind of computer. */
export function senseModel(platform: string, arch: string): SenseModel {
  return platform === 'darwin' && arch === 'arm64' ? SENSE_MODEL : SENSE_MODEL_ANYWHERE
}

/** True where the app's Ollama can run one of the two (see `senseModel`): every computer it is made for. */
export function senseSupported(platform: string, _arch?: string): boolean {
  return platform === 'darwin' || platform === 'win32' || platform === 'linux'
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
 * first, so that someone with room has the choice. `installed`: the models Ollama already holds.
 *
 * What fits: on a Mac, in its memory. On a PC, in its memory and its graphics card's
 * together, as Ollama puts on the card what it can and the rest in memory: 16 GB of
 * memory and a 16 GB card run the large model (Vivien, 15 October).
 *
 * Which one is recommended:
 * - on a Mac (`graphics` undefined): the largest that fits, its memory being shared;
 * - on a PC: the largest that fits on its graphics card, and the smallest when it has none
 *   or none fits. The others are still offered (they run, partly on the processor, slower),
 *   and each says whether it fits on the card.
 */
export function offersFor(memoryBytes: number, installed: readonly Pick<ModelInfo, 'id'>[] = [], graphics?: GraphicsCard | null): Offers {
  const memory = (memoryBytes + (graphics?.memoryBytes ?? 0)) / GIB
  const fitting = BUILTIN_MODELS.filter((model) => memory >= model.needsMemory)
  const onCard = (model: BuiltinModel): boolean => !!graphics && graphics.memoryBytes / GIB >= model.needsGraphics
  const recommended = graphics === undefined ? fitting.at(-1) : (fitting.filter(onCard).at(-1) ?? fitting[0])

  return {
    offers: fitting.map((builtin) => {
      const { needsMemory: _memory, needsGraphics: _card, ...model } = builtin
      return {
        ...model,
        recommended: model.id === recommended?.id,
        installed: installed.some((item) => sameOllamaModel(item.id, model.id)),
        fitsGraphics: graphics === undefined ? null : onCard(builtin),
      }
    }),
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
export function engineContextLength(memoryBytes: number, graphics?: GraphicsCard | null): number {
  // On a PC the context sits on the graphics card, next to the model.
  if (graphics !== undefined) return graphics && graphics.memoryBytes / GIB >= 15 ? 16_384 : 8_192
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
