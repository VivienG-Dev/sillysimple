// What is said, and what is told.
//
// Many players write their turn like a story: "Elena wanted it to never stop, in fact she
// loved it." That is narration, no one says it out loud. Left alone, a model often takes
// any line of the user's as speech and answers it ("Never stop?"), as if the user's
// character had said it (Vivien, 16 October). So the model is told how a turn is written:
// the words between quotes are spoken; the rest is narration, which characters may see
// the effects of but never hear. And narration about {{char}} (what they feel, want or do)
// is the player steering the story: it is played, not answered.
//
// Players who write their speech without quotes are not taken for narrators: a line in
// the first or second person ("I'm here", "you look tired") is still speech.

export const NARRATION_NOTE =
  "How {{user}}'s turns are written: words between quotes are what {{user}} says out loud. " +
  'Narration (what happens, what someone does, feels or thinks, told in the third person like a story) is never spoken: ' +
  "characters may notice what is done, but they do not hear narration and never repeat or answer it as if {{user}} had said it. " +
  "When the narration tells what {{char}} feels, wants or does, take it as how the story goes and play {{char}} that way. " +
  "Without quotes, a line in the first or second person is {{user}} speaking."
