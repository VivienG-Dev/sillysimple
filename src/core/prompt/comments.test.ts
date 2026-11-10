import { describe, expect, it } from 'vitest'
import { withoutComments } from './comments'

describe('withoutComments', () => {
  it('leaves out what is between <!-- and -->, on one line or several', () => {
    expect(withoutComments('She smiles. <!-- a note for the model --> Then she waves.')).toBe('She smiles.  Then she waves.')
    expect(withoutComments('Hello.\n\n<!-- OOC:\nkeep track of the day\n![x](https://example.com/a.png)\n-->')).toBe('Hello.\n\n')
  })

  it('runs an unclosed comment to the end of the text', () => {
    expect(withoutComments('Hello. <!-- never closed\n![x](https://example.com/a.png)')).toBe('Hello. ')
  })

  it('leaves a text without comments as it is', () => {
    expect(withoutComments('a -> b, c < d')).toBe('a -> b, c < d')
  })
})
