# Changelog

What changes from one version of SillySimple to the next. The installers are on
[sillysimple.app](https://sillysimple.app); an installed app finds new versions by itself
(Settings › Data & Privacy › Check for new versions).

## 0.1.8 (not released yet)

### Better

- **Longer memory with large models.** The summary of a long chat used to stay under 700
  tokens whatever the model. It now grows with what the model can read: up to 2000 tokens
  with a 32k model, so a long story is summed up less tightly.
- **OpenAI models get their full context.** OpenAI does not say how much its models read,
  so the app fell back to 8k. It now knows the families (GPT-5, GPT-4.1, GPT-4o, o-series)
  and uses up to 32k with them, as with the other services.

### Fixed

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
