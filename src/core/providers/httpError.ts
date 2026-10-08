/** A server answered, but with an error status. `message` is the server's own explanation when it gave one. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The option the server complains about, when it names one. */
    readonly param?: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Reads the explanation out of an error response. Servers do not agree on its shape:
 *   OpenAI, OpenRouter   { "error": { "message": "…", "param": "…" } }
 *   Ollama               { "error": "…" }
 *   Mistral              { "message": "…" }  or  { "detail": [{ "msg": "…", "loc": ["body", "field"] }] }
 */
export async function readHttpError(response: Response): Promise<HttpError> {
  const fallback = `The server answered ${response.status} ${response.statusText}`.trim()
  const text = await response.text().catch(() => '')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return new HttpError(response.status, fallback)
  }
  if (!isRecord(parsed)) return new HttpError(response.status, fallback)

  const error = parsed['error']
  if (typeof error === 'string' && error) return new HttpError(response.status, error)
  if (isRecord(error) && typeof error['message'] === 'string' && error['message']) {
    return new HttpError(response.status, error['message'], typeof error['param'] === 'string' ? error['param'] : undefined)
  }

  const details = describeDetails(parsed['detail']) || describeDetails(isRecord(parsed['message']) ? parsed['message']['detail'] : null)
  if (details) return new HttpError(response.status, details)

  if (typeof parsed['message'] === 'string' && parsed['message']) {
    return new HttpError(response.status, parsed['message'], typeof parsed['param'] === 'string' ? parsed['param'] : undefined)
  }
  return new HttpError(response.status, fallback)
}

/** [{ msg: "Extra inputs are not permitted", loc: ["body", "reasoning_effort"] }] -> "reasoning_effort: Extra inputs are not permitted" */
function describeDetails(detail: unknown): string {
  if (!Array.isArray(detail)) return ''
  return detail
    .filter(isRecord)
    .map((item) => {
      const field = Array.isArray(item['loc']) ? item['loc'].filter((part) => part !== 'body').join('.') : ''
      const message = typeof item['msg'] === 'string' ? item['msg'] : ''
      return field && message ? `${field}: ${message}` : message || field
    })
    .filter(Boolean)
    .join('; ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
