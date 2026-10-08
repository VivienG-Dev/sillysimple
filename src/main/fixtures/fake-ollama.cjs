#!/usr/bin/env node
// A stand-in for the `ollama` program, for the tests of src/main/engine.ts and for trying
// the app without a real model. It answers the few addresses the app uses:
//
//   ollama serve          listens where OLLAMA_HOST says (127.0.0.1:11434 by default)
//
// Like the real one, it keeps its models in OLLAMA_MODELS (a file "models.json" there),
// so two of them given the same folder hold the same models. What it was started with
// is written to "started-<port>.json" in that folder, for the tests to read.
//
// Model names that behave in a special way when downloaded:
//   nothing:here     Ollama's library has no such model
//   no:network       Ollama cannot reach its library
// POST /api/embed answers made-up vectors: two texts that share words get close vectors,
// which is enough to try everything around a real embedding model (not what it understands).
// FAKE_PULL_MS: how long each step of a download takes (default 5).
// FAKE_PULL_FAILS: this many downloads fail first, as with no network (default 0).
// FAKE_SCALE: a model weighs 5000 bytes times this (default 1).
// FAKE_FAIL=1: the program ends at once with an error, as one that cannot start.
// FAKE_START_MS: how long it takes before it answers (default 0).
// FAKE_VERSION: the version it says it is (default 9.9.9-fake).
// Asked where the scene is and what the character wears (src/core/prompt/place.ts), it answers with the
// latest place between [[ ]] and the latest clothes between << >> in what it reads ("[[the kitchen]]",
// "<<a red dress>>"), or FAKE_PLACE and FAKE_OUTFIT, or "unknown". Each request is written to requests.jsonl.
// FAKE_SCENE_MORE: what it goes on writing after those two lines, a word every 40 ms, as a small model does;
// whether the app left before the end is written to scene-more.jsonl.
// FAKE_REPLY: what it writes in a chat, instead of saying which model it is. Several, between "||": one after the other.
// FAKE_EMBED_FAIL=1: it cannot embed anything, as an Ollama without the engine for it.
// FAKE_EMBED_MS: how long a question about a few texts takes (default 0); the anchors, many at once, are not slowed.
// FAKE_LOAD=1: GET /api/ps lists only the models used since it started, as the real one lists the models
// in memory. Without it, every model it holds is listed, as if all were in memory.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

/** The models used since it started: what the real one would hold in memory. */
const loaded = new Set()

if (process.argv[2] !== 'serve') {
  console.log('ollama version is 9.9.9-fake')
  process.exit(0)
}
if (process.env.FAKE_FAIL) {
  console.error('Error: listen tcp 127.0.0.1:11434: bind: address already in use')
  process.exit(1)
}

const [host, port] = (process.env.OLLAMA_HOST || '127.0.0.1:11434').split(':')
const folder = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama-fake')
const store = path.join(folder, 'models.json')
const stepMs = Number(process.env.FAKE_PULL_MS || 5)
const scale = Number(process.env.FAKE_SCALE || 1)
fs.mkdirSync(folder, { recursive: true })

let failsLeft = Number(process.env.FAKE_PULL_FAILS || 0)
let replies = 0

const models = () => {
  try {
    return JSON.parse(fs.readFileSync(store, 'utf8'))
  } catch {
    return []
  }
}
const save = (list) => fs.writeFileSync(store, JSON.stringify(list))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const body = (request) =>
  new Promise((resolve) => {
    let text = ''
    request.on('data', (chunk) => (text += chunk))
    request.on('end', () => {
      try {
        resolve(JSON.parse(text || '{}'))
      } catch {
        resolve({})
      }
    })
  })
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

// A text as a point: each of its words (their first five letters, so "laughs" and
// "laughing" are one) adds to one of 96 directions, and a word that tells a mood also
// adds to that mood's own direction. Little words are left out.
const LITTLE = new Set('the a an and or of to in on at is are was it its her his their she he they with for from not that this what how you your i me my'.split(' '))
const TELLING = [
  'laugh happ delight grin cheer overjoy wonderful excit bright',
  'smirk teas mischie wink joke cheeky playful tongue catch game',
  'tender affection kiss love warmth devotion cherish',
  'blush embarrass fluster stammer bashful cheeks',
  'glar furious rage slam shout temper scowl irritat anger dare enough',
  'gasp taken shock impossible startl astonish sudden',
  'tilt puzzl confus mean curious perplex eyebrow understand follow',
  'cries tear heartbroken grief sorrow hurts miss lonely miserabl sadness',
  'fidget anxious sweat swallow awkward uneasy hesitat tense worried sure',
  'sigh roll tired exasperat patience whatever unimpress weary resign give',
  'trembl terror terrif panic dread danger cower horrif',
  'yawn awake doze eyelids drows sleepy asleep exhaust rest bed',
  'chin thought ponder think consider idea weigh hmm',
].map((line) => line.split(' '))
function embed(text) {
  const vector = new Array(96 + TELLING.length).fill(0)
  const words = text.replace(/^task: [^|]*\| query: /, '').toLowerCase().match(/\p{L}{3,}/gu) || []
  for (const word of words) {
    if (LITTLE.has(word)) continue
    let hash = 7
    for (const letter of word.slice(0, 5)) hash = (hash * 31 + letter.codePointAt(0)) % 9973
    vector[hash % 96] += 1
    TELLING.forEach((stems, mood) => {
      if (stems.some((stem) => word.startsWith(stem))) vector[96 + mood] += 1.5
    })
  }
  const length = Math.hypot(...vector) || 1
  return vector.map((value) => value / length)
}

const server = http.createServer(async (request, response) => {
  const route = `${request.method} ${request.url.split('?')[0]}`

  if (route === 'GET /api/version' || route === 'HEAD /api/version') return json(response, 200, { version: process.env.FAKE_VERSION || '9.9.9-fake' })
  if (route === 'GET /api/tags') return json(response, 200, { models: models() })
  if (route === 'GET /api/ps') {
    const context = Number(process.env.OLLAMA_CONTEXT_LENGTH || 4096)
    const inMemory = models().filter((model) => !process.env.FAKE_LOAD || loaded.has(model.name))
    return json(response, 200, { models: inMemory.map((model) => ({ name: model.name, model: model.name, context_length: context })) })
  }
  if (route === 'POST /api/generate') {
    const { model } = await body(request)
    if (model) loaded.add(model)
    return json(response, 200, { done: true })
  }

  if (route === 'POST /api/pull') {
    const { model } = await body(request)
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    const say = (line) => response.write(`${JSON.stringify(line)}\n`)
    let gone = false
    response.on('close', () => (gone = true))

    say({ status: 'pulling manifest' })
    await sleep(stepMs)
    if (model === 'nothing:here') return response.end(`${JSON.stringify({ error: 'pull model manifest: file does not exist' })}\n`)
    if (model === 'no:network' || failsLeft-- > 0) {
      return response.end(`${JSON.stringify({ error: 'pull model manifest: Get "https://registry.ollama.ai/v2/library/no/manifests/network": dial tcp: lookup registry.ollama.ai: no such host' })}\n`)
    }
    // Two files, like a real model: the weights, then something small.
    const files = [
      { digest: 'sha256:aaaa', total: 4000 * scale },
      { digest: 'sha256:bbbb', total: 1000 * scale },
    ]
    for (const file of files) {
      for (let completed = 0; completed <= file.total; completed += file.total / 4) {
        if (gone) return
        say({ status: `pulling ${file.digest.slice(7)}`, digest: file.digest, total: file.total, completed })
        await sleep(stepMs)
      }
    }
    say({ status: 'verifying sha256 digest' })
    await sleep(stepMs)
    say({ status: 'writing manifest' })
    if (gone) return
    save([...models().filter((item) => item.name !== model), { name: model, model, size: 5000 * scale }])
    say({ status: 'success' })
    return response.end()
  }

  if (route === 'POST /api/embed') {
    const { model, input } = await body(request)
    if (process.env.FAKE_EMBED_FAIL) return json(response, 500, { error: 'mlx runner is not available on this platform' })
    if (!models().some((item) => item.name === model)) return json(response, 404, { error: `model "${model}" not found, try pulling it first` })
    const texts = Array.isArray(input) ? input : [input]
    if (process.env.FAKE_EMBED_MS && texts.length < 20) await sleep(Number(process.env.FAKE_EMBED_MS))
    return json(response, 200, { model, embeddings: texts.map((text) => embed(String(text))) })
  }

  if (route === 'DELETE /api/delete') {
    const { model } = await body(request)
    if (!models().some((item) => item.name === model)) return json(response, 404, { error: `model '${model}' not found` })
    save(models().filter((item) => item.name !== model))
    return json(response, 200, {})
  }

  if (route === 'GET /v1/models') return json(response, 200, { data: models().map((model) => ({ id: model.name })) })

  if (route === 'POST /v1/chat/completions') {
    const asked = await body(request)
    const { model, stream } = asked
    if (!models().some((item) => item.name === model)) return json(response, 404, { error: { message: `model '${model}' not found` } })
    loaded.add(model)
    fs.appendFileSync(path.join(folder, 'requests.jsonl'), `${JSON.stringify({ messages: asked.messages, max_tokens: asked.max_tokens })}\n`)
    const last = asked.messages?.at(-1)?.content ?? ''
    if (typeof last === 'string' && last.includes('Pause the story for two questions')) {
      // The latest place between [[ ]] and the latest clothes between << >> in what it reads.
      const latest = (pattern) => [...(asked.messages || [])].reverse().map((message) => pattern.exec(String(message.content))?.[1]).find(Boolean)
      const answer = `Place: ${latest(/\[\[([^\]]+)\]\]/) || process.env.FAKE_PLACE || 'unknown'}\nWearing: ${latest(/<<([^>]+)>>/) || process.env.FAKE_OUTFIT || 'unknown'}`
      if (!stream) return json(response, 200, { choices: [{ message: { role: 'assistant', content: answer }, finish_reason: 'stop' }] })
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\n`)
      // A small model goes on after its two lines. Whether it was left to is written to scene-more.jsonl.
      const more = (process.env.FAKE_SCENE_MORE || '').split(' ').filter(Boolean)
      let left = false
      response.on('close', () => (left = true))
      for (const [index, word] of more.entries()) {
        if (left) break
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (index ? ' ' : '\n') + word } }] })}\n\n`)
        await sleep(40)
      }
      if (more.length) fs.appendFileSync(path.join(folder, 'scene-more.jsonl'), `${JSON.stringify({ stopped: left })}\n`)
      if (left) return
      response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
      return response.end('data: [DONE]\n\n')
    }
    const scripted = (process.env.FAKE_REPLY || '').split('||').filter(Boolean)
    const words = (scripted.length ? scripted[replies++ % scripted.length] : `Hello from ${model} on port ${port}.`).split(' ')
    if (!stream) return json(response, 200, { choices: [{ message: { role: 'assistant', content: words.join(' ') }, finish_reason: 'stop' }] })
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const [index, word] of words.entries()) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (index ? ' ' : '') + word } }] })}\n\n`)
      await sleep(stepMs)
    }
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
    return response.end('data: [DONE]\n\n')
  }

  json(response, 404, { error: 'not found' })
})

server.on('error', (error) => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
setTimeout(() => server.listen(Number(port), host, () => {
  fs.writeFileSync(
    path.join(folder, `started-${port}.json`),
    JSON.stringify({
      pid: process.pid,
      context: process.env.OLLAMA_CONTEXT_LENGTH,
      keepAlive: process.env.OLLAMA_KEEP_ALIVE,
      noCloud: process.env.OLLAMA_NO_CLOUD,
    }),
  )
  console.log(`time=now level=INFO msg="Listening on ${host}:${port} (version 9.9.9-fake)"`)
}), Number(process.env.FAKE_START_MS || 0))

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0))
