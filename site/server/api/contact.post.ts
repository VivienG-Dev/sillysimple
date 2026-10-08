import nodemailer from 'nodemailer'

// The contact form (pages/contact.vue): the message goes by email to the publisher, from the
// site's own mailbox, with the visitor's address to answer to. Nothing is kept here.
//
// The mailbox is given in Coolify's environment, never in the code:
//   NUXT_SMTP_USER   contact@sillysimple.app
//   NUXT_SMTP_PASS   its password (an app password, if the account has two-step sign-in)
//
// Against robots, without a puzzle for people: a field hidden from people that a robot fills
// in, a form sent back faster than anyone can type, and three messages per address in ten
// minutes at most. A robot caught by the first two is told it worked, so that it does not
// try again in another way.

const WINDOW = 10 * 60_000
const MOST = 3
const FASTEST = 3_000

/** When each address last sent something, to keep a robot from sending a hundred. */
const recent = new Map<string, number[]>()

const ABOUT: Record<string, string> = {
  question: 'A question',
  problem: 'Something does not work',
  idea: 'An idea',
  other: 'Something else',
}

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/

/** A line of text from the form, in one piece, at most `most` characters. */
function line(value: unknown, most: number): string {
  return typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, most) : ''
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'Nothing was sent.' })

  // A robot: it filled in what people do not see, or answered faster than anyone types.
  const started = Number(body.started)
  if (line(body.website, 200) || !Number.isFinite(started) || Date.now() - started < FASTEST) return { ok: true }

  const name = line(body.name, 100)
  const email = line(body.email, 200)
  const about = ABOUT[line(body.about, 20)] ?? ABOUT.other!
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!EMAIL.test(email)) throw createError({ statusCode: 400, statusMessage: 'email' })
  if (message.length < 10 || message.length > 5000) throw createError({ statusCode: 400, statusMessage: 'message' })

  const now = Date.now()
  const from = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const times = (recent.get(from) ?? []).filter((time) => now - time < WINDOW)
  if (times.length >= MOST) throw createError({ statusCode: 429, statusMessage: 'too many' })
  recent.set(from, [...times, now])
  // The list does not grow forever: addresses not seen for ten minutes are forgotten.
  if (recent.size > 500) for (const [key, list] of recent) if (list.every((time) => now - time >= WINDOW)) recent.delete(key)

  const config = useRuntimeConfig(event)
  if (!config.smtpUser || !config.smtpPass) throw createError({ statusCode: 503, statusMessage: 'not set up' })

  const port = Number(config.smtpPort)
  const mailer = nodemailer.createTransport({
    host: config.smtpHost,
    port,
    secure: port === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  })
  try {
    await mailer.sendMail({
      from: { name: 'SillySimple website', address: config.smtpUser },
      to: config.contactTo || config.smtpUser,
      replyTo: { name: name || email, address: email },
      subject: `[Site] ${about}${name ? `, from ${name}` : ''}`,
      text: `${about}\nFrom: ${name ? `${name} <${email}>` : email}\n\n${message}\n`,
    })
  } catch (error) {
    // What went wrong with the mailbox, never what was written.
    console.error('[contact] not sent:', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 502, statusMessage: 'not sent' })
  }
  return { ok: true }
})
