/** Card pictures are shown at a few hundred pixels: anything larger only makes the file heavy. */
const MAX_SIDE = 1536

/**
 * Turns a picture the user picked (JPEG, WebP, PNG…) into a PNG, the only format
 * a character card can live in, scaled down if it is very large.
 * Returns the PNG's bytes, and an address to show it with (to release with URL.revokeObjectURL).
 */
export async function pictureToPng(file: File): Promise<{ bytes: Uint8Array; url: string }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This file is not a picture the app can read.')
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob) }
}

/** A chat background fills the window: more than this is only weight. */
const MAX_BACKGROUND_SIDE = 2560

/**
 * Turns a picture the user picked into the one format the app keeps a chat background
 * in: a WebP, scaled down if it is very large. Returns its bytes.
 */
export async function pictureToBackground(file: File): Promise<Uint8Array> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This file is not a picture the app can read.')
  }

  const scale = Math.min(1, MAX_BACKGROUND_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
  return new Uint8Array(await blob.arrayBuffer())
}
