// HTML comments in a card or a message: <!-- … -->. Card authors use them for notes meant
// for the model only (out-of-character instructions, hidden state). As in SillyTavern,
// the model reads them and the user does not: they are left out wherever the app shows,
// reads aloud or reads the mood of a text, and kept in what is sent to the model.
// A comment that is never closed runs to the end of the text, as it would in a browser.

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g

/** `text` without its HTML comments. */
export function withoutComments(text: string): string {
  return text.includes('<!--') ? text.replace(COMMENT, '') : text
}
