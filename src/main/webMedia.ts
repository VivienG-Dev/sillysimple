import { net } from 'electron'

// Pictures and sounds that messages bring from the web (see formatMessage in the renderer).
// The page does not fetch them itself: it asks for card://web/<address>, and the main
// process fetches it here. So the page only ever loads the app's own addresses (its
// Content-Security-Policy stays closed), the hosts see an ordinary request rather than
// one from "localhost" (some refuse those), turning them off in Settings › Appearance
// stops every request at the source, and only pictures, sounds and videos get through.

const MEDIA_TYPE = /^(image|audio|video)\//i
/** Kept from the host's answer: what the page needs to show the file and to seek in a sound. */
const PASSED_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']

/** The https address a card://web/… address stands for, or null. */
export function webAddressOf(path: string): string | null {
  let address: string
  try {
    address = decodeURIComponent(path.replace(/^\/+/, ''))
  } catch {
    return null
  }
  return /^https:\/\/[^\s"'<>]+$/i.test(address) ? address : null
}

/** Fetches a picture or a sound for the page. `range`: the part of it asked for, when seeking in a sound. */
export async function fetchWebMedia(address: string, range: string | null): Promise<Response> {
  try {
    const answer = await net.fetch(address, {
      headers: range ? { Range: range } : {},
      redirect: 'follow',
    })
    const type = answer.headers.get('content-type') ?? ''
    if (!answer.ok || !MEDIA_TYPE.test(type)) {
      console.warn(`[media] ${address}: ${answer.status} ${type || 'no type'}`)
      void answer.body?.cancel()
      return new Response(null, { status: answer.ok ? 415 : answer.status })
    }
    const headers = new Headers()
    for (const name of PASSED_HEADERS) {
      const value = answer.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('cache-control', 'max-age=86400')
    return new Response(answer.body, { status: answer.status, headers })
  } catch (error) {
    console.warn(`[media] ${address}:`, error instanceof Error ? error.message : error)
    return new Response(null, { status: 502 })
  }
}
