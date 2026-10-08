// Two small functions taken from the app, so that the stories read here as they do there.

/** Puts names in a story's text: {{char}} is the character, {{user}} the person who plays. */
export function applyMacros(text: string, names: { char: string; user: string }): string {
  return text.replace(/\{\{\s*(char|user)\s*\}\}/gi, (_match, key: string) => names[key.toLowerCase() as 'char' | 'user'])
}

/**
 * Turns roleplay text into safe HTML: *actions* become italics, blank lines become paragraphs.
 * The text is escaped first, so nothing in it can inject markup.
 * (src/renderer/utils/format.ts in the app.)
 */
export function formatMessage(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  return escaped
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>')}</p>`)
    .join('')
}
