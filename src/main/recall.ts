import { lorePieces, rawSentences } from '@core/prompt/loreMeaning'
import { nameBonuses, pickRecalls, RECALL, RECALL_WORDS, recallExcerpt, recallExchange, recallPassages, type Recalled } from '@core/prompt/recall'
import type { SenseService } from './sense'

// Which old moments of a chat to bring back for the reply about to be written (the
// arithmetic is in src/core/prompt/recall.ts). The model is the one that reads moods
// (sense.ts): nothing more to download.
//
// An old message is asked about once: its vectors are kept, as long as its text does not
// change. A long chat seen for the first time (or after the app restarts) has many: the
// ones that fit in a reply's patience are asked at once, the rest in the background, and
// the replies meanwhile bring back what is known so far. It never holds a reply up for
// long: past `PATIENCE_MS`, the reply is written without old moments.

/** How long a reply waits for the meaning. */
const PATIENCE_MS = 1200
/** At most this many passages are asked about while a reply waits; more go to the background. */
const ASK_NOW = 32
/** Passages asked at once in the background, and how long each such question may take. */
const BACKGROUND_BATCH = 64
const BACKGROUND_MS = 60_000
/** Passage vectors kept, all chats together (about 3 kB each). */
const KEPT = 6000

export interface OldMessage {
  role: 'user' | 'assistant'
  name: string
  content: string
}

/** `ownNames`: the names of the chat's own people, which a name said again does not count. */
export type Recall = (
  old: readonly OldMessage[],
  latest: readonly string[],
  contextSize: number,
  ownNames?: readonly string[],
) => Promise<Recalled[] | undefined>

export function createRecall(sense: Pick<SenseService, 'embed'>, log: (line: string) => void = () => {}): Recall {
  const kept = new Map<string, Float32Array>()
  const queued = new Set<string>()
  let filling: Promise<void> | null = null

  const keep = (text: string, vector: readonly number[]): void => {
    kept.delete(text)
    kept.set(text, Float32Array.from(vector))
    while (kept.size > KEPT) kept.delete(kept.keys().next().value!)
  }

  /** Asks about the queued passages, a batch at a time, until none is left. */
  const fill = (): void => {
    if (filling || queued.size === 0) return
    filling = (async () => {
      while (queued.size > 0) {
        const batch = [...queued].slice(0, BACKGROUND_BATCH)
        const answer = await sense.embed(batch, BACKGROUND_MS, 'recall')
        batch.forEach((text) => queued.delete(text))
        if (!answer) break // Not ready or too slow: the next reply asks again.
        batch.forEach((text, index) => keep(text, answer[index]!))
      }
    })()
      .catch(() => {})
      .finally(() => {
        filling = null
      })
  }

  return async (old, latest, contextSize, ownNames = []) => {
    if (old.length === 0) return undefined
    const contents = old.map((message) => message.content)
    const passages = recallPassages(contents, RECALL.form)
    const pieces = lorePieces(latest, RECALL.depth).map((piece) => piece.text)
    if (passages.length === 0 || pieces.length === 0) return undefined

    // The newest old messages first: they are the ones most likely to be asked about soon.
    const missing = [...new Set(passages.filter((passage) => !kept.has(passage.text)).map((passage) => passage.text))].reverse()
    const now = missing.length <= ASK_NOW ? missing : []
    for (const text of missing.slice(now.length)) queued.add(text)
    fill()

    const started = Date.now()
    const answer = await sense.embed([...now, ...pieces], PATIENCE_MS, 'recall')
    if (!answer) return undefined
    now.forEach((text, index) => keep(text, answer[index]!))

    const known = passages.filter((passage) => kept.has(passage.text))
    if (known.length === 0) return undefined
    const knownVectors = known.map((passage) => kept.get(passage.text)!)
    const pieceVectors = answer.slice(now.length)
    const bonus = nameBonuses(contents, latest.slice(-RECALL.depth), ownNames)
    const calls = pickRecalls(known, knownVectors, pieceVectors, RECALL, contextSize, bonus)

    // One line per reply: which old messages and their scores, never a word of the chat.
    const closest = pickRecalls(known, knownVectors, pieceVectors, { ...RECALL, threshold: -Infinity, most: calls.length + 1 }, Infinity, bonus).at(-1)
    const next =
      closest && !calls.some((call) => call.message === closest.message)
        ? ` (next: #${closest.message + 1} ${closest.score.toFixed(3)}, from ${RECALL.threshold})`
        : ''
    const waiting = passages.length - known.length
    log(
      `[recall] ${calls.map((call) => `#${call.message + 1} ${call.score.toFixed(3)}`).join(', ') || 'nothing'} of ${old.length} old messages${next}` +
        `${waiting ? ` (${waiting} passages still being read)` : ''} · ${Date.now() - started} ms`,
    )

    // Each old message found comes with the other message of its exchange, shorter.
    const roles = old.map((message) => message.role)
    const given = new Map<number, string>()
    for (const call of calls) {
      for (const at of recallExchange(call.message, roles)) {
        if (given.has(at)) continue
        const content = contents[at]!
        const ends = rawSentences(content).length
        const text =
          at === call.message
            ? recallExcerpt(content, call.passage)
            : recallExcerpt(content, at < call.message ? { from: ends - 1, to: ends } : { from: 0, to: 1 }, Math.round(RECALL_WORDS / 2))
        given.set(at, text)
      }
    }
    return [...given.entries()].sort(([a], [b]) => a - b).map(([at, text]) => ({ name: old[at]!.name, text }))
  }
}
