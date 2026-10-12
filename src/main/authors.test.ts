import { describe, expect, it } from 'vitest'
import { authorId, parseAuthors } from './authors'

describe('partner authors', () => {
  it('makes an address from a name', () => {
    expect(authorId('SzainX')).toBe('szainx')
    expect(authorId('Lady Ash ✿')).toBe('lady-ash')
    expect(authorId('Élodie')).toBe('elodie')
  })

  it('needs a name, and keeps only https links and a picture file of its folder', () => {
    const authors = parseAuthors([
      { name: 'SzainX', about: ' Writes idols. ', links: ['https://chub.ai/users/szainx', { label: 'Ko-fi', url: 'https://ko-fi.com/x' }, 'http://old.example', 'javascript:alert(1)'], picture: 'szainx.png' },
      { about: 'no name' },
      { name: 'szainx' },
      { name: 'Ash', picture: '../secret.png' },
    ])
    expect(authors).toEqual([
      {
        name: 'SzainX',
        about: 'Writes idols.',
        links: [
          { label: 'chub.ai', url: 'https://chub.ai/users/szainx' },
          { label: 'Ko-fi', url: 'https://ko-fi.com/x' },
        ],
        picture: 'szainx.png',
      },
      { name: 'Ash', about: '', links: [] },
    ])
  })
})
