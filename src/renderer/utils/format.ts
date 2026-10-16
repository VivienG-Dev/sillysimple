import { replyWords } from '@core/prompt/replyLength'
import { PORTRAIT_SCHEME } from '@shared/ipc'
import type { Character } from '@shared/types'

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Pictures and sounds in a message. Cards often bring them in their greetings (a picture
// of the scene, a song): as Markdown, ![](address), or as an HTML tag, <img src="…">,
// <audio src="…">. Only those are kept, rebuilt by the app from their address alone:
// any other attribute (a style, an event) is dropped, and only https addresses load,
// through the main process (card://web/…, see src/main/webMedia.ts).
const MEDIA =
  /!\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"\n]*")?\s*\)|<(img|audio|video)\b([^>]*)>(?:[^<]*<\/\3\s*>)?/gi
const SOURCE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const ALT = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i
/** Stands for a picture or a sound while the rest of the text is escaped. Nothing a model writes contains it. */
const MARK = (index: number): string => `\u0000${index}\u0000`

/** A picture or a sound as the app writes it, or null when its address is not an https one. */
function mediaHtml(markdownAlt: string | undefined, markdownSource: string | undefined, tag: string | undefined, attributes = ''): string | null {
  const kind = (tag ?? 'img').toLowerCase()
  const found = markdownSource ?? attributes.match(SOURCE)?.slice(1).find((value) => value !== undefined)
  const source = found?.trim()
  if (!source || !/^https:\/\/[^\s"'<>]+$/i.test(source)) return null
  // Fetched by the main process, not by the page (see src/main/webMedia.ts).
  const address = escapeHtml(`${PORTRAIT_SCHEME}://web/${encodeURIComponent(source)}`)
  if (kind === 'audio') return `<audio class="media-sound" controls preload="none" src="${address}"></audio>`
  if (kind === 'video') return `<video class="media-video" controls preload="metadata" src="${address}"></video>`
  const alt = markdownAlt ?? attributes.match(ALT)?.slice(1).find((value) => value !== undefined) ?? ''
  return `<img class="media-picture" src="${address}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" />`
}

/** A paragraph that is all one action: between asterisks from start to end. */
const WHOLE_ACTION = /^\*([^*\n]+)\*$/
/** From this many characters on, such a paragraph is narration, not an action. */
const TOLD_LENGTH = 80

// What is said out loud, between quotes: "…", “…” or « … ». On one line, the quotes kept.
// (Escaped first, so a straight quote reads &quot; here.)
const SPOKEN = /&quot;[^\n]*?&quot;|“[^”\n]*”|«[^»\n]*»/g

/**
 * Turns roleplay text into safe HTML: *actions* become italics, **words** bold, blank lines
 * paragraphs, and what is said between quotes is marked (`say`) so it can be told apart
 * from the telling, unless `styled` is false (Settings › Appearance).
 * The text is escaped first, so nothing a model writes can inject markup; pictures and
 * sounds (see MEDIA) are rebuilt by the app, and left out when `media` is false.
 * (To be replaced by a real Markdown renderer when messages need more than this.)
 */
export function formatMessage(text: string, options: { media?: boolean; styled?: boolean } = {}): string {
  const media: string[] = []
  const marked = text
    .replace(/\u0000/g, '')
    .replace(MEDIA, (_whole, markdownAlt?: string, markdownSource?: string, tag?: string, attributes?: string) => {
      // Turned off, or an address that is not https: nothing is shown, not even the code.
      const html = options.media === false ? null : mediaHtml(markdownAlt, markdownSource, tag, attributes)
      if (html === null) return ''
      media.push(html)
      return MARK(media.length - 1)
    })

  return escapeHtml(marked)
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const withBold = paragraph.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      // A whole paragraph between asterisks is not an action slipped into a line: it is how
      // that model writes its narration. In italics and dimmed it tires the eye over a long
      // reply (Vivien, 16 October), so it is shown as plain telling. A short one ("*nods*")
      // stays an action.
      const told = withBold.match(WHOLE_ACTION)
      const withActions = told && told[1]!.length >= TOLD_LENGTH ? told[1]! : withBold.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      const withSpeech = options.styled === false ? withActions : withActions.replace(SPOKEN, '<span class="say">$&</span>')
      const withMedia = withSpeech.replace(/\u0000(\d+)\u0000/g, (_, index: string) => media[Number(index)] ?? '')
      return `<p>${withMedia.replace(/\n/g, '<br>')}</p>`
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
