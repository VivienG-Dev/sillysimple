export interface MacroContext {
  char: string
  user: string
  persona?: string
}

/**
 * Replaces SillyTavern-style placeholders in card and prompt text.
 * Handles {{char}}, {{user}}, {{persona}} and the older <USER>, <BOT>, <CHAR>.
 */
export function applyMacros(text: string, context: MacroContext): string {
  const values: Record<string, string> = {
    char: context.char,
    bot: context.char,
    user: context.user,
    persona: context.persona ?? '',
  }

  return text
    .replace(/\{\{\s*(char|user|persona)\s*\}\}/gi, (_match, key: string) => values[key.toLowerCase()] ?? '')
    .replace(/<(USER|BOT|CHAR)>/g, (_match, key: string) => values[key.toLowerCase()] ?? '')
}
