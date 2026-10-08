import { describe, expect, it } from 'vitest'
import { FIRST_CHUNK, NEXT_CHUNK, speechChunks, speechParts, speechText } from './speechText'

describe('what a voice says for a message', () => {
  const message = '*She looks up from the ledger, lamp in hand.* "You are dripping on the maps." *A pause.* "Sit down, **Ren**."'

  it('reads everything, without the signs meant for the eye', () => {
    expect(speechText(message)).toBe('She looks up from the ledger, lamp in hand. You are dripping on the maps. A pause. Sit down, Ren.')
    expect(speechText('“Curly quotes,” she said. «Des guillemets», aussi.')).toBe('Curly quotes, she said. Des guillemets, aussi.')
  })

  it('or only what is said aloud', () => {
    expect(speechText(message, 'speech')).toBe('You are dripping on the maps. Sit down, Ren.')
    expect(speechText('*He nods.* “Fine” *He leaves.* « On y va »', 'speech')).toBe('Fine. On y va.')
    expect(speechText('"Wait!" *She runs.* "Is that you?"', 'speech')).toBe('Wait! Is that you?')
  })

  it('takes a message without quotes as speech, minus what is between asterisks', () => {
    expect(speechText('*She shrugs.* Fine, have it your way. *She leaves.*', 'speech')).toBe('Fine, have it your way.')
    expect(speechText('*She shrugs and leaves.*', 'speech')).toBe('')
    expect(speechText('', 'all')).toBe('')
    expect(speechText('   \n ', 'speech')).toBe('')
  })

  it('never reads out code, addresses or unfilled macros', () => {
    expect(speechText('See [the map](https://example.com/map) or https://example.com now, {{user}}.')).toBe('See the map or now,.')
    expect(speechText('Before\n```js\nconst x = 1\n```\nAfter `inline` code')).toBe('Before\nAfter inline code')
    expect(speechText('# Title\n- one\n- two\n> quoted')).toBe('Title\none\ntwo\nquoted')
  })

  it('keeps apostrophes and what is inside words', () => {
    expect(speechText("*It's* Ren's snake_case — don't touch.")).toBe("It's Ren's snakecase — don't touch.")
  })
})

describe('a message read with two voices', () => {
  it('gives the character what is in quotes and the narrator everything else, in order', () => {
    expect(speechParts('*She looks up from the ledger, lamp in hand.* "You are dripping on the maps." *A pause.* "Sit down, **Ren**"')).toEqual([
      { by: 'narrator', text: 'She looks up from the ledger, lamp in hand.' },
      { by: 'character', text: 'You are dripping on the maps.' },
      { by: 'narrator', text: 'A pause.' },
      { by: 'character', text: 'Sit down, Ren.' },
    ])
  })

  it('reads narration that is not between asterisks as narration too', () => {
    expect(speechParts('“Yes,” she said, wiping her hands. «On y va», added Ren.')).toEqual([
      { by: 'character', text: 'Yes,' },
      { by: 'narrator', text: 'she said, wiping her hands.' },
      { by: 'character', text: 'On y va.' },
      { by: 'narrator', text: 'added Ren.' },
    ])
  })

  it('joins lines that follow each other in the same voice, and drops what has no word in it', () => {
    expect(speechParts('"One." "Two," — "Three!" *...* *She leaves.* *The door shuts.*')).toEqual([
      { by: 'character', text: 'One. Two, Three!' },
      { by: 'narrator', text: 'She leaves. The door shuts.' },
    ])
  })

  it('without any quotes: the narrator has what is between asterisks, the character the rest', () => {
    expect(speechParts('*She shrugs.* Fine, have it your way. *She leaves.*')).toEqual([
      { by: 'narrator', text: 'She shrugs.' },
      { by: 'character', text: 'Fine, have it your way.' },
      { by: 'narrator', text: 'She leaves.' },
    ])
    expect(speechParts('*She shrugs and leaves.*')).toEqual([{ by: 'narrator', text: 'She shrugs and leaves.' }])
    expect(speechParts('Just words.')).toEqual([{ by: 'character', text: 'Just words.' }])
  })

  it('loses nothing of what one voice alone would read, and gives nothing for an empty message', () => {
    const message = '*Elara sets the lamp down.* "The storm took the east jetty." *She turns.* "Go on. Look."'
    expect(speechParts(message).map((part) => part.text).join(' ')).toBe(speechText(message))
    expect(speechParts('')).toEqual([])
    expect(speechParts(' *…* ')).toEqual([])
    expect(speechParts('See https://example.com `code` {{user}}')).toEqual([{ by: 'character', text: 'See code' }])
  })

  it('gives the same parts twice in a row', () => {
    const message = '*A.* "B."'
    expect(speechParts(message)).toEqual(speechParts(message))
    expect(speechParts('*no quotes*')).toEqual([{ by: 'narrator', text: 'no quotes' }])
    expect(speechParts(message)).toHaveLength(2)
  })
})

describe('the pieces asked of the voice', () => {
  const sentence = 'The tide bell rings twice over the drowned quarter. '

  it('is one piece when the text is short', () => {
    expect(speechChunks('You are late.')).toEqual(['You are late.'])
    expect(speechChunks('')).toEqual([])
    expect(speechChunks('  \n ')).toEqual([])
  })

  it('starts with a short piece, so the first sound comes quickly, then longer ones', () => {
    const chunks = speechChunks(sentence.repeat(40).trim())
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[0]!.length).toBeLessThanOrEqual(FIRST_CHUNK)
    for (const chunk of chunks.slice(1)) expect(chunk.length).toBeLessThanOrEqual(NEXT_CHUNK)
    expect(chunks[1]!.length).toBeGreaterThan(FIRST_CHUNK)
  })

  it('cuts at the end of sentences and loses nothing', () => {
    const text = sentence.repeat(40).trim()
    const chunks = speechChunks(text)
    for (const chunk of chunks) expect(chunk.endsWith('.')).toBe(true)
    expect(chunks.join(' ')).toBe(text)
  })

  it('cuts at a comma, then at a space, when no sentence ends in reach', () => {
    const list = Array.from({ length: 80 }, (_, index) => `item ${index}`).join(', ')
    const byComma = speechChunks(list)
    expect(byComma[0]!.endsWith(',')).toBe(true)
    expect(byComma.join(' ')).toBe(list)

    const words = 'word '.repeat(200).trim()
    const bySpace = speechChunks(words)
    expect(bySpace.every((chunk) => chunk.split(' ').every((word) => word === 'word'))).toBe(true)
    expect(bySpace.join(' ')).toBe(words)
  })

  it('still cuts a text with no space at all', () => {
    const chunks = speechChunks('x'.repeat(1000))
    expect(chunks.join('')).toBe('x'.repeat(1000))
    expect(chunks[0]).toHaveLength(FIRST_CHUNK)
  })

  it('reads paragraphs one after the other', () => {
    expect(speechChunks('One.\n\nTwo.')).toEqual(['One. Two.'])
  })
})
