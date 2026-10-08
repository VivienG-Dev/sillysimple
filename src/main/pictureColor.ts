import { stat } from 'node:fs/promises'
import { nativeImage } from 'electron'
import { mainColor, type PictureColor } from '@core/color/accent'

// The main colour of a character's picture, for the app to take its tint from
// (see src/core/color/accent.ts). Electron decodes and shrinks the picture; a picture is
// only read again when its file changes.

const known = new Map<string, PictureColor | null>()
/** A few hundred pixels say as much about a picture's colours as millions. */
const SIDE = 32

export async function colorOfPicture(file: string): Promise<PictureColor | null> {
  const info = await stat(file).catch(() => null)
  if (!info) return null

  const key = `${file}:${info.mtimeMs}:${info.size}`
  if (!known.has(key)) {
    const picture = nativeImage.createFromPath(file)
    // toBitmap() gives four bytes per pixel, blue first.
    const pixels = picture.isEmpty() ? null : picture.resize({ width: SIDE, height: SIDE, quality: 'good' }).toBitmap()
    known.set(key, pixels ? mainColor(pixels, 'bgra') : null)
  }
  return known.get(key) ?? null
}
