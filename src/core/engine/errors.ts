// What went wrong while getting the engine or a model, in words a non-technical user
// can act on. Ollama's own messages are written for a terminal.

/** Thrown when "on this computer" is asked for and there is no Ollama to answer, the app's own included. */
export class EngineMissingError extends Error {
  constructor() {
    super('No model is set up on this computer yet. Download one in Settings > Connection.')
    this.name = 'EngineMissingError'
  }
}

/** True when the user stopped it themselves: nothing to report. */
export function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** A failure to download the app's own Ollama from GitHub. */
export function describeEngineDownloadError(error: unknown): string {
  const text = messageOf(error)
  if (isNetwork(error, text)) return 'The download could not start, or stopped on the way. Check your internet connection, then try again: it goes on from where it stopped.'
  if (/ENOSPC|no space left/i.test(text)) return 'The disk is full. Free some space, then try again.'
  if (/EACCES|EPERM/i.test(text)) return `The app could not write to its own folder: ${text}`
  return text
}

/** A failure of Ollama to download a model. `model` is the name that was asked for. */
export function describePullError(error: unknown, model: string): string {
  const text = messageOf(error)
  if (/file does not exist|not found|manifest unknown|invalid model name|repository.*not.*found/i.test(text)) {
    return `Ollama's library has no model called “${model}”. Check the name.`
  }
  if (/no space left|ENOSPC|not enough (disk )?space/i.test(text)) {
    return 'The disk is full. Free some space, then try again: the download goes on from where it stopped.'
  }
  if (/newer version of ollama/i.test(text)) {
    return 'This model needs a newer Ollama than the one in use. Update Ollama, then try again.'
  }
  // Ollama could not reach its library: `pull model manifest: Get "https://registry.ollama.ai/…": dial tcp…`
  if (/Get "https?:\/\/|dial tcp|no such host|i\/o timeout|handshake|connection (reset|refused)|network is unreachable|EOF$/i.test(text) || isNetwork(error, text)) {
    return 'The model library could not be reached. Check your internet connection, then try again: the download goes on from where it stopped.'
  }
  if (/stopped before the end/i.test(text)) return 'The download stopped on the way. Try again: it goes on from where it stopped.'
  return text
}

function isNetwork(error: unknown, text: string): boolean {
  // Node's fetch wraps the real cause: TypeError('fetch failed', { cause: { code } })
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined
  const code = typeof cause?.code === 'string' ? cause.code : ''
  return (
    /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|EPIPE|UND_ERR_)/.test(code) ||
    /fetch failed|terminated|socket hang up/i.test(text)
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
