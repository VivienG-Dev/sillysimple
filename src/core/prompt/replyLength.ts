// How long a reply is, and what to do when one is cut short.
//
// A model does not know the limit it writes under: left alone, it writes until the
// server cuts it, in the middle of a sentence. So "Reply length" is given to the model
// as a length to aim for, and the hard limit sent to the server sits above it
// (see replyTokens in context.ts). A reply that still runs into the limit can be continued.

/** Roughly how many words fit in a number of tokens, on the low side so the reply fits. */
const WORDS_PER_TOKEN = 0.65

/** The length to aim for, in words, for a "Reply length" setting in tokens. */
export function replyWords(maxTokens: number): number {
  return Math.max(20, Math.round((maxTokens * WORDS_PER_TOKEN) / 10) * 10)
}

/** The line of the system prompt that tells the model how long to write. */
export function lengthInstruction(maxTokens: number): string {
  return `Aim for about ${replyWords(maxTokens)} words per reply, not much more, and always end on a complete sentence.`
}

/**
 * Sent after a reply that was cut short, to have the model write the rest of it.
 * The chat APIs have no common way to resume a message, so it is asked in words.
 */
export const CONTINUE_CUE =
  '[Your last reply was cut off before it ended. Continue it from exactly where it stopped, without repeating anything already written, and bring it to an end.]'

/** What goes between a reply that was cut short and its continuation: a space, or nothing. */
export function joinContinuation(before: string, after: string): string {
  if (!before || !after) return ''
  if (/\s$/.test(before) || /^\s/.test(after)) return ''
  if (/^[.,;:!?…)\]}%’']/.test(after)) return '' // Closing punctuation, or the end of a word ("Red" + "'s").
  if (/[(\[{“‘—–-]$/.test(before)) return '' // Just opened: a bracket, a quote, a dash.
  return ' '
}
