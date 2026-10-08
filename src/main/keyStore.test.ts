import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createKeyStore, type Cipher } from './keyStore'

// Stands in for the operating system's encryption: enough to check that what
// reaches the disk is what the cipher returned, and never the key itself.
function fakeCipher(available = true, secret = 7): Cipher {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(Buffer.from(text, 'utf8').map((byte) => byte ^ secret)),
    decryptString: (encrypted) => {
      const text = Buffer.from(encrypted.map((byte) => byte ^ secret)).toString('utf8')
      if (!text.startsWith('sk-')) throw new Error('Not encrypted on this computer.')
      return text
    },
  }
}

const scratchFile = (): string => join(mkdtempSync(join(tmpdir(), 'silly-keys-')), 'keys.json')

describe('key store', () => {
  it('saves a key encrypted, and finds it again after a restart', async () => {
    const file = scratchFile()
    const store = createKeyStore(file, fakeCipher())

    await store.set('openrouter', '  sk-or-v1-abcdef  ')

    expect(await store.get('openrouter')).toBe('sk-or-v1-abcdef')
    expect(readFileSync(file, 'utf8')).not.toContain('sk-or')
    expect(await store.status()).toEqual({ slots: ['openrouter'], persistent: true })

    const afterRestart = createKeyStore(file, fakeCipher())
    expect(await afterRestart.get('openrouter')).toBe('sk-or-v1-abcdef')
    expect(await afterRestart.get('openai')).toBeNull()
  })

  it('keeps each key in its own slot, and removes one without touching the others', async () => {
    const store = createKeyStore(scratchFile(), fakeCipher())
    await store.set('openai', 'sk-one')
    await store.set('custom:https://example.test', 'sk-two')
    await store.set('openai', 'sk-three') // Replaces the first.
    await store.set('mistral', '   ') // Nothing to save.

    await store.remove('custom:https://example.test')

    expect(await store.get('openai')).toBe('sk-three')
    expect(await store.get('custom:https://example.test')).toBeNull()
    expect((await store.status()).slots).toEqual(['openai'])
  })

  it('never writes a key to disk when the computer cannot encrypt', async () => {
    const file = scratchFile()
    const store = createKeyStore(file, fakeCipher(false))

    await store.set('mistral', 'sk-plain')

    expect(await store.get('mistral')).toBe('sk-plain') // Usable until the app quits.
    expect(await store.status()).toEqual({ slots: ['mistral'], persistent: false })
    expect(existsSync(file)).toBe(false)
    expect(await createKeyStore(file, fakeCipher(false)).get('mistral')).toBeNull()
  })

  it('treats a key it cannot decrypt as missing, instead of failing', async () => {
    const file = scratchFile()
    await createKeyStore(file, fakeCipher(true, 7)).set('openai', 'sk-one')

    // The same file, read on another computer (another secret).
    expect(await createKeyStore(file, fakeCipher(true, 99)).get('openai')).toBeNull()
  })
})
