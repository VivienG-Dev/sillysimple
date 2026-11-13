# Changelog

What changes from one version of SillySimple to the next. The installers are on
[sillysimple.app](https://sillysimple.app); an installed app finds new versions by itself
(Settings › Data & Privacy › Check for new versions).

## 0.1.8 (not released yet)

### New

- **Change a character in a few words.** In the editor of a character you have, *Change it*
  takes what should be different (another gender, another era, shyer, a new name) and the
  model rewrites only the parts of the card that this touches: description, greetings,
  lorebook notes and the rest, keeping everything else word for word. The parts change in
  the editor as they are written; nothing is saved until you save, and *Undo* puts the
  card back as it was.
- **Save as new character.** The editor of a character you have can now save what is in it
  as another character, picture and lorebook included, and leave the original as it was:
  a changed version next to the first one, by hand or with *Change it*. Under the same name
  it becomes "Mara 2", and its card in the library says *Version*.
- **Characters from the same story.** A new character can now be written from one you
  already have: their mother, their rival, the friend they keep mentioning. *New character
  from …'s story*, in the right panel (or the person-plus button on a card in the library),
  opens *Describe your character* with that story attached; *From another character's
  story…* picks one there. The model reads
  that character's card first and keeps its facts: names, places, the past, and who you are
  in it. The new card says who they are to each other and gets a lorebook note about them.

### Better

- **A better way to add a character to a chat.** *Add a character* used to open a bare list
  of names. It now opens a panel with each character's picture and the start of who they
  are, a search field when the list is long, and the places left in the chat. Arrow keys
  and Enter work too.
- **Longer memory with large models.** The summary of a long chat used to stay under 700
  tokens whatever the model. It now grows with what the model can read: up to 2000 tokens
  with a 32k model, so a long story is summed up less tightly.
- **OpenAI models get their full context.** OpenAI does not say how much its models read,
  so the app fell back to 8k. It now knows the families (GPT-5, GPT-4.1, GPT-4o, o-series)
  and uses up to 32k with them, as with the other services.
- **Room for a detailed character idea.** *Describe your character* took 2,000 characters
  at most; it now takes 8,000, with a count that shows up near the limit. The box grows as
  you write and can be pulled taller by its corner, then folds back to two lines when you
  move on to the card, so the editor below keeps its room. Shift + Enter goes to a new line.
- **Taller boxes in the character editor.** Description, personality, greetings and the
  other long fields can now be pulled taller by their corner.

### Fixed

- **A stressed word in a line of dialogue looks stressed.** In `"I'm *growing up* fast"`, the
  word between asterisks took the dim colour of actions and seemed to drop out of the line.
  Inside quotes it now keeps the colour of speech, in italics.
- **A line break inside quotes no longer splits what is said.** In `"Too` / `what."`, the
  second line lost the colour of speech, and the voice read it as narration. Quotes now
  hold across a line break (not across a blank line, which starts a new paragraph).
- **Hidden notes in cards stay hidden.** Some cards hold notes for the model between
  `<!--` and `-->`. They showed in the chat, pictures inside them included. As in
  SillyTavern, they are now only for the model: not shown, not read aloud, not taken for
  the character's mood.
- **No more Ollama processes left behind.** The app's own Ollama could leave processes
  running after the app was closed, each holding a model in memory, and they piled up.
  It is now ended as a whole, and anything left by an earlier run is ended when it starts.

## 0.1.7

### New

- **The small model with online replies too.** With replies from another server or an
  online service, the app's small model (moods by meaning, lorebook notes by meaning, old
  moments of long chats) used to stay off. Settings › Connection can now run it on your
  computer anyway. Off by default, since it takes a download (the size is shown first);
  nothing more leaves your computer for it.

### Fixed

- **Choosing a model from a long list no longer blanks the window.** With OpenRouter,
  picking a model far down its list made the whole app slide out of the window, leaving
  an empty screen.

## 0.1.6

### New

- **Rewrite a reply.** A character's last reply can be written again the way you want it:
  *Shorter*, *Longer*, *More feeling*, *More dialogue*, or in your own words. The moment
  stays the same, only the telling changes.
- **Light that follows the mood.** Soft patches of colour drift behind the chat and take
  the mood of the character's last reply: warm when they smile, blue when they are sad,
  red when they are angry. On by default; Settings › Appearance turns it off.
- **Set dialogue apart.** What a character says between quotes takes a touch of their
  colour, so it stands out from the narration. In a chat with several characters, each
  one speaks in their own colour. Settings › Appearance.
- **Waiting lines.** While a character thinks, a short line in their mood says so,
  instead of three dots.

### Better

- **A real title bar.** One thin bar across the top of the window, on every screen, as in
  Discord or VS Code. On Windows the three window buttons now sit in it, in the app's
  colours, instead of floating over the character's picture. On a Mac the traffic lights
  sit in the same bar.
- **Easier to read.** Long narrative paragraphs and short actions are told apart, so a
  reply reads as a page of a story rather than one block of text.
