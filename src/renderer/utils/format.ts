import { replyWords } from '@core/prompt/replyLength'
import type { Character } from '@shared/types'

/**
 * Turns roleplay text into safe HTML: *actions* become italics, blank lines become paragraphs.
 * The text is escaped first, so nothing a model writes can inject markup.
 * (To be replaced by a real Markdown renderer when messages need more than this.)
 */
export function formatMessage(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return escaped
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => {
      const withActions = paragraph.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      return `<p>${withActions.replace(/\n/g, '<br>')}</p>`
    })
    .join('')
}

/**
 * The "Reply length" setting as the user reads it: 300 -> "Medium · ~200 words".
 * The number of words is the one the model is asked to aim for.
 */
export function formatReplyLength(tokens: number): string {
  const size = tokens < 200 ? 'Short' : tokens <= 450 ? 'Medium' : 'Long'
  return `${size} · ~${replyWords(tokens)} words`
}

/** 4912345678 -> "4.9 GB" */
export function formatBytes(bytes: number): string {
  const gigabytes = bytes / 1e9
  if (gigabytes >= 1) return `${gigabytes.toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

/** 3120 -> "3.1 s" */
export function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`
}

// `undefined` = the computer's own language and 12h/24h habits.
const dateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 1791190351000 -> "Oct 5, 2:32 PM" or "5 oct., 14:32", depending on the computer */
export function formatDateTime(timestamp: number): string {
  return dateTime.format(timestamp)
}

/** 950 -> "950", 3276 -> "3.2k", 8192 -> "8k" */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  const thousands = tokens / 1024
  return `${thousands >= 100 ? Math.round(thousands) : Number(thousands.toFixed(1))}k`
}

/** A model's context length as its maker writes it: 131072 -> "128k", 200000 -> "200k", 1000000 -> "1M" */
export function formatContextLength(tokens: number): string {
  // Some makers count in powers of two (32768 = "32k"), others in round thousands.
  const thousands = tokens % 1024 === 0 ? tokens / 1024 : tokens / 1000
  if (thousands >= 1000) return `${Number((thousands / 1000).toFixed(1))}M`
  return `${Math.round(thousands)}k`
}

/**
 * Deep copy without Vue's reactivity. Use it for anything sent to `window.api`:
 * reactive objects cannot cross the bridge to the main process.
 */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** "3 greetings · Lorebook of 12 entries": what a card brings beyond its description. Empty when nothing. */
export function cardExtras(character: Pick<Character, 'firstMessage' | 'alternateGreetings' | 'lorebook' | 'systemPrompt'>): string {
  const parts: string[] = []
  const greetings = character.alternateGreetings.length + (character.firstMessage.trim() ? 1 : 0)
  if (greetings > 1) parts.push(`${greetings} greetings`)
  const entries = character.lorebook?.entries.length ?? 0
  if (entries > 0) parts.push(`Lorebook of ${entries} ${entries === 1 ? 'entry' : 'entries'}`)
  if (character.systemPrompt.trim()) parts.push('Own instructions')
  return parts.join(' · ')
}

/** A computer's memory as it is sold: 34359738368 -> "32 GB" */
export function formatMemory(bytes: number): string {
  return `${Math.round(bytes / 2 ** 30)} GB`
}

/** Progress of a download: (2100000000, 8000000000) -> "2.1 of 8.0 GB", (45e6, 167e6) -> "45 of 167 MB" */
export function formatProgress(doneBytes: number, totalBytes: number): string {
  if (totalBytes >= 1e9) return `${(doneBytes / 1e9).toFixed(1)} of ${(totalBytes / 1e9).toFixed(1)} GB`
  return `${Math.round(doneBytes / 1e6)} of ${Math.max(1, Math.round(totalBytes / 1e6))} MB`
}
