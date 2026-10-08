import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { KeysStatus } from '@shared/types'

// API keys of online services. They are encrypted by the operating system
// (Keychain on macOS, DPAPI on Windows) through Electron's `safeStorage`, and saved
// in keys.json in the app's data folder. That file is useless on another computer
// or to another user of this one.
//
// A key is only ever read here, in the main process, to be put in a request.
// The Vue app can save or remove one, and ask which exist: never read one back.

/** The part of Electron's `safeStorage` this file needs. Tests pass their own. */
export interface Cipher {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface KeyStore {
  /** The key saved under `slot`, or null. */
  get(slot: string): Promise<string | null>
  set(slot: string, key: string): Promise<void>
  remove(slot: string): Promise<void>
  status(): Promise<KeysStatus>
  /** Removes every key, and the file they were saved in. */
  clear(): Promise<void>
}

export function createKeyStore(file: string, cipher: Cipher): KeyStore {
  /** slot -> encrypted key, in base64. What is in the file. */
  let stored: Record<string, string> | null = null
  /** Keys kept only while the app runs, when this computer cannot encrypt. */
  const unsaved = new Map<string, string>()

  async function load(): Promise<Record<string, string>> {
    if (stored) return stored
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
      stored = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
    } catch {
      stored = {} // No key saved yet, or an unreadable file.
    }
    return stored
  }

  async function save(): Promise<void> {
    const temporary = `${file}.tmp`
    await mkdir(dirname(file), { recursive: true })
    // 0o600: on macOS and Linux, only the user's own account can open the file.
    await writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
  }

  return {
    async get(slot) {
      if (unsaved.has(slot)) return unsaved.get(slot)!

      const encrypted = (await load())[slot]
      if (typeof encrypted !== 'string' || !cipher.isEncryptionAvailable()) return null
      try {
        return cipher.decryptString(Buffer.from(encrypted, 'base64'))
      } catch {
        return null // Encrypted on another computer or by another account: it cannot be read here.
      }
    },

    async set(slot, key) {
      const value = key.trim()
      if (!value) return

      if (!cipher.isEncryptionAvailable()) {
        unsaved.set(slot, value) // Never written to disk unencrypted.
        return
      }
      unsaved.delete(slot)
      const keys = await load()
      keys[slot] = cipher.encryptString(value).toString('base64')
      await save()
    },

    async remove(slot) {
      unsaved.delete(slot)
      const keys = await load()
      if (!(slot in keys)) return
      delete keys[slot]
      await save()
    },

    async status() {
      const persistent = cipher.isEncryptionAvailable()
      const slots = new Set(unsaved.keys())
      if (persistent) for (const slot of Object.keys(await load())) slots.add(slot)
      return { slots: [...slots].sort(), persistent }
    },

    async clear() {
      unsaved.clear()
      stored = {}
      await rm(file, { force: true })
    },
  }
}
