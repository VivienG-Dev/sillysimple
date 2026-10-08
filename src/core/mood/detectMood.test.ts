import { describe, expect, it } from 'vitest'
import { detectMood, MOODS, type Mood } from './detectMood'

describe('the mood of a reply', () => {
  const cases: [Mood, string][] = [
    ['joy', '*Elara throws her head back and laughs.* "You really came all this way for a map?"'],
    ['joy', '*Her eyes light up at the sight of the old compass.* "Where did you find this?"'],
    ['playful', '*She smirks, leaning on the railing.* "Careful. I might start to like you."'],
    ['love', '*She rests her head on your shoulder, and her heart skips.* "Stay a little longer."'],
    ['shy', '*Mara blushes and looks away.* "I... I did not mean it like that."'],
    ['shy', '"That is not..." *Her cheeks turn crimson.*'],
    ['anger', '*Quill slams his fist on the desk.* "For the last time, no!"'],
    ['anger', '*She glares at the door, clenching her jaw.*'],
    ['surprise', '*Her eyes widen.* "You are alive?"'],
    ['surprise', '"What?! Here? Now?"'],
    ['question', '*Juno tilts her head, puzzled.* "A lighthouse. In the desert."'],
    ['sad', '*Tears well up in her eyes, and her voice cracks.* "He promised he would come back."'],
    ['nervous', '*He fidgets with his sleeve and swallows hard.* "About the ledger..."'],
    ['sigh', '*Quill sighs and rolls his eyes.* "Fine. Sit down."'],
    ['fear', '*She recoils, terrified, her face draining of colour.* "Do not open it."'],
    ['sleepy', '*Elara yawns, rubbing her eyes.* "Is it morning already?"'],
    ['thinking', '*She strokes her chin, lost in thought.* "There may be another way in."'],
    // French
    ['joy', '*Elle éclate de rire.* « Tu es venu jusqu\'ici pour une carte ? »'],
    ['shy', '*Mara rougit et détourne le regard.* « Je... ce n\'est pas ce que je voulais dire. »'],
    ['anger', '*Il serre les poings, furieux.* « Pour la dernière fois, non ! »'],
    ['surprise', '*Elle écarquille les yeux.* « Tu es vivant ? »'],
    ['sad', '*Une larme roule sur sa joue.* « Il avait promis de revenir. »'],
    ['sigh', '*Quill soupire et lève les yeux au ciel.* « Bon. Assieds-toi. »'],
    ['question', '*Elle penche la tête, intriguée.*'],
    ['sleepy', '*Elle bâille longuement.*'],
  ]
  it.each(cases)('reads %s in: %s', (mood, text) => {
    expect(detectMood(text)).toBe(mood)
  })

  it('shows nothing when nothing in the text says how the character feels', () => {
    expect(detectMood('"The harbour is two streets down. Turn left at the fountain."')).toBeNull()
    expect(detectMood('*She opens the ledger and runs a finger down the column.* "Forty crates. All accounted for."')).toBeNull()
    expect(detectMood('')).toBeNull()
  })

  it('does not take a reply that ends on a question for a puzzled character', () => {
    expect(detectMood('"The storm is coming. Are you staying the night?"')).toBeNull()
  })

  it('goes by how the reply ends when the mood changes on the way', () => {
    expect(detectMood('*She laughs at first.* "Very funny." *Then her smile fades and she glares at him, furious.*')).toBe('anger')
    expect(detectMood('*She glares at him.* "You." *Then, slowly, she starts to giggle, and laughs until she cries with joy, grinning.*')).toBe('joy')
  })

  it('does not count what the character does not do', () => {
    expect(detectMood('*She does not smile.* "Sit."')).toBeNull()
    expect(detectMood('*Without blushing, she holds his gaze.*')).toBeNull()
    expect(detectMood('*Elle ne sourit pas.* « Assieds-toi. »')).toBeNull()
    expect(detectMood('*She cannot help but smile.*')).toBe('joy')
  })

  it('does not count what is said of the user', () => {
    expect(detectMood('*You laugh, and the sound fills the room.* "Careful," *she says evenly.*')).toBeNull()
    expect(detectMood('*Ren blushes.* "Careful," *she says evenly.*', { userName: 'Ren' })).toBeNull()
    expect(detectMood('*Ren blushes.* "Careful," *she says evenly.*')).toBe('shy') // Without knowing who Ren is.
    expect(detectMood('*She looks at you, blushing.*')).toBe('shy')
  })

  it('wants more than a shiver to call it fear', () => {
    expect(detectMood('*A shiver runs down her back as the cold wind comes in.*')).toBeNull()
    expect(detectMood('*She trembles, terrified.*')).toBe('fear')
  })

  it('reads a word whatever its form or its capitals, but not inside another word', () => {
    expect(detectMood('SHE SIGHS.')).toBe('sigh')
    expect(detectMood('*sighing, she sits*')).toBe('sigh')
    expect(detectMood('The village of Sadbury has a nice market.')).toBeNull() // "sad" is not a word here.
    expect(detectMood('He is from Angria.')).toBeNull()
  })

  it('has signs for every mood', () => {
    for (const mood of MOODS) expect(cases.some(([expected]) => expected === mood)).toBe(true)
  })
})
