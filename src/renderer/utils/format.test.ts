import { describe, expect, it } from 'vitest'
import { formatMessage } from './format'

describe('formatMessage', () => {
  it('makes paragraphs and italics, and escapes the rest', () => {
    expect(formatMessage('*waves* Hi <b>you</b>\n\nBye')).toBe('<p><em>waves</em> Hi &lt;b&gt;you&lt;/b&gt;</p><p>Bye</p>')
  })

  it('shows a Markdown picture and an HTML sound, rebuilt from their address alone', () => {
    const html = formatMessage(
      'Before\n\n<audio controls src="https://files.example/song.mp3" style="filter: invert(1)" onplay="alert(1)">\n\n![](https://img.example/a.png)',
    )
    expect(html).toBe(
      '<p>Before</p>' +
        '<p><audio class="media-sound" controls preload="none" src="card://web/https%3A%2F%2Ffiles.example%2Fsong.mp3"></audio></p>' +
        '<p><img class="media-picture" src="card://web/https%3A%2F%2Fimg.example%2Fa.png" alt="" loading="lazy" referrerpolicy="no-referrer" /></p>',
    )
  })

  it('reads an <img> tag and its alt', () => {
    expect(formatMessage(`<img alt="Park" src='https://img.example/p.jpg'>`)).toContain('src="card://web/https%3A%2F%2Fimg.example%2Fp.jpg" alt="Park"')
  })

  it('never loads anything but https, and never lets a quote out of the address', () => {
    expect(formatMessage('![](http://img.example/a.png) ok')).toBe('<p>ok</p>')
    expect(formatMessage('<img src="javascript:alert(1)">ok')).toBe('<p>ok</p>')
    expect(formatMessage('<img src=https://a.example/x.png"onerror="alert(1)>')).not.toContain('onerror="')
  })

  it('leaves pictures and sounds out when they are turned off', () => {
    expect(formatMessage('Hi\n\n![](https://img.example/a.png)', { media: false })).toBe('<p>Hi</p>')
  })
})
