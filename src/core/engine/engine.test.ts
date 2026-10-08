import { describe, expect, it } from 'vitest'
import { createPullTracker, sameOllamaModel } from '../providers/ollama'
import { describeEngineDownloadError, describePullError, EngineMissingError, isAbort } from './errors'
import { BUILTIN_MODELS, builtinModelBytes, cleanModelName, engineContextLength, isBuiltinModel, offersFor, SENSE_MODEL, SENSE_MODEL_ANYWHERE, senseModel, senseSupported } from './models'
import { compareVersions, ENGINE_VERSION, enginePackage } from './release'

const GIB = 2 ** 30

describe('the models offered for a computer', () => {
  const tiers = (memory: number): string[] => offersFor(memory * GIB).offers.map((offer) => offer.tier)
  const recommended = (memory: number): string | undefined => offersFor(memory * GIB).offers.find((offer) => offer.recommended)?.tier

  it('offers every size that fits, so that a computer with room has the choice', () => {
    expect(tiers(8)).toEqual(['small'])
    expect(tiers(16)).toEqual(['small', 'medium'])
    expect(tiers(24)).toEqual(['small', 'medium'])
    expect(tiers(32)).toEqual(['small', 'medium', 'large'])
    expect(tiers(64)).toEqual(['small', 'medium', 'large'])
  })

  it('recommends the largest that fits', () => {
    expect(recommended(8)).toBe('small')
    expect(recommended(16)).toBe('medium')
    expect(recommended(24)).toBe('medium')
    expect(recommended(32)).toBe('large')
    expect(offersFor(32 * GIB).offers.filter((offer) => offer.recommended)).toHaveLength(1)
  })

  it('takes a computer for what it is sold as, not for the little less it reports', () => {
    // A "16 GB" PC whose graphics share the memory, a "32 GB" one.
    expect(tiers(13.8)).toEqual(['small', 'medium'])
    expect(tiers(31.2)).toEqual(['small', 'medium', 'large'])
    expect(tiers(12)).toEqual(['small'])
  })

  it('always has something to offer, and says how many models are out of reach', () => {
    expect(tiers(4)).toEqual(['small'])
    expect(offersFor(4 * GIB).tooLarge).toBe(2)
    expect(offersFor(16 * GIB).tooLarge).toBe(1)
    expect(offersFor(32 * GIB).tooLarge).toBe(0)
  })

  it('knows which ones are installed already, whatever the case Ollama writes them in', () => {
    const { offers } = offersFor(32 * GIB, [{ id: 'GEMMA4:12b-it-q4_k_m' }, { id: 'qwen3:8b' }])
    expect(offers.map((offer) => offer.installed)).toEqual([false, true, false])
  })

  it('offers three models of one family, smallest first, each with a size', () => {
    expect(BUILTIN_MODELS.map((model) => model.tier)).toEqual(['small', 'medium', 'large'])
    // Each says which exact model it is, and that is the one its tag names.
    expect(BUILTIN_MODELS.map((model) => model.variant)).toEqual(['E2B', '12B', '26B A4B'])
    for (const model of BUILTIN_MODELS) expect(model.id.toLowerCase()).toContain(model.variant.toLowerCase().replace(' ', '-'))
    const sizes = BUILTIN_MODELS.map((model) => model.bytes)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    for (const model of BUILTIN_MODELS) {
      expect(model.id).toMatch(/^gemma4:[a-z0-9-]+-q4_K_M$/)
      expect(cleanModelName(model.id)).toBe(model.id)
      expect(isBuiltinModel(model.id)).toBe(true)
      expect(builtinModelBytes(model.id)).toBe(model.bytes)
    }
    expect(isBuiltinModel('qwen3:8b')).toBe(false)
    expect(builtinModelBytes('qwen3:8b')).toBeNull()
  })

  it('reads moods by meaning on every computer: the MLX file on a Mac with an Apple chip, the plain one elsewhere', () => {
    expect(senseModel('darwin', 'arm64')).toBe(SENSE_MODEL)
    expect(senseModel('darwin', 'x64')).toBe(SENSE_MODEL_ANYWHERE)
    expect(senseModel('win32', 'x64')).toBe(SENSE_MODEL_ANYWHERE)
    expect(senseModel('linux', 'x64')).toBe(SENSE_MODEL_ANYWHERE)
    // Not Ollama's short tag ("270m"), which is the MLX file.
    expect(SENSE_MODEL_ANYWHERE.id).toBe('embeddinggemma-2:270m-bf16-text')
    for (const platform of ['darwin', 'win32', 'linux']) expect(senseSupported(platform, 'x64')).toBe(true)
    expect(senseSupported('freebsd', 'x64')).toBe(false)
  })

  it('gives more context to a computer with more memory', () => {
    expect(engineContextLength(8 * GIB)).toBe(8192)
    expect(engineContextLength(16 * GIB)).toBe(8192)
    expect(engineContextLength(32 * GIB)).toBe(16384)
  })
})

describe('a model name typed by the user', () => {
  it('accepts what Ollama accepts', () => {
    expect(cleanModelName('qwen3:8b')).toBe('qwen3:8b')
    expect(cleanModelName('  gemma4  ')).toBe('gemma4')
    expect(cleanModelName('huihui_ai/gemma-4-abliterated:26b')).toBe('huihui_ai/gemma-4-abliterated:26b')
    expect(cleanModelName('hf.co/mradermacher/anime-girl-1.5B-GGUF:Q4_K_M')).toBe('hf.co/mradermacher/anime-girl-1.5B-GGUF:Q4_K_M')
  })

  it('accepts a command or an address copied from a web page', () => {
    expect(cleanModelName('ollama run gemma4:12b')).toBe('gemma4:12b')
    expect(cleanModelName('ollama pull hf.co/bartowski/Some-Model-GGUF:Q4_K_M')).toBe('hf.co/bartowski/Some-Model-GGUF:Q4_K_M')
    expect(cleanModelName('https://huggingface.co/mradermacher/anime-girl-1.5B-GGUF')).toBe('hf.co/mradermacher/anime-girl-1.5B-GGUF')
    expect(cleanModelName('https://ollama.com/library/gemma4:e4b')).toBe('gemma4:e4b')
    expect(cleanModelName('https://ollama.com/huihui_ai/gemma-4-abliterated')).toBe('huihui_ai/gemma-4-abliterated')
  })

  it('only lets a name point at Ollama\'s library or at Hugging Face', () => {
    // A name of three parts starts with the server Ollama would ask.
    for (const typed of ['registry.example.com/someone/model:tag', '127.0.0.1/a/b', 'localhost/a/b', 'hf.co/a/b/c', 'a/b/c/d']) {
      expect(cleanModelName(typed), typed).toBeNull()
    }
    expect(cleanModelName('HuggingFace.co/Someone/Model-GGUF')).toBe('HuggingFace.co/Someone/Model-GGUF')
  })

  it('refuses what cannot be a model name', () => {
    for (const typed of ['', '   ', 'two words', 'a:b:c', '../../etc/passwd', 'model;rm -rf', '-flag', 'name:', '/leading', 'x'.repeat(201), 'émoji🙂']) {
      expect(cleanModelName(typed), typed).toBeNull()
    }
  })
})

describe('the download of the engine', () => {
  it('has a file for each kind of computer the app is built for', () => {
    expect(enginePackage('darwin', 'arm64')).toMatchObject({ file: 'ollama-darwin.tgz', format: 'tgz', binary: 'ollama' })
    // One file for both kinds of Mac.
    expect(enginePackage('darwin', 'x64')).toEqual(enginePackage('darwin', 'arm64'))
    expect(enginePackage('win32', 'x64')).toMatchObject({ file: 'ollama-windows-amd64.zip', format: 'zip', binary: 'ollama.exe' })
    expect(enginePackage('win32', 'arm64')).toMatchObject({ file: 'ollama-windows-arm64.zip' })
    expect(enginePackage('linux', 'x64')).toMatchObject({ file: 'ollama-linux-amd64.tar.zst', format: 'tar.zst', binary: 'bin/ollama' })
    expect(enginePackage('linux', 'arm64')).toMatchObject({ file: 'ollama-linux-arm64.tar.zst' })
    expect(enginePackage('freebsd', 'x64')).toBeNull()
    expect(enginePackage('win32', 'ia32')).toBeNull()
  })

  it('comes from the release of the version the app names, with a checksum', () => {
    for (const [platform, arch] of [['darwin', 'arm64'], ['win32', 'x64'], ['win32', 'arm64'], ['linux', 'x64'], ['linux', 'arm64']] as const) {
      const engine = enginePackage(platform, arch)!
      expect(engine.version).toBe(ENGINE_VERSION)
      expect(engine.url).toBe(`https://github.com/ollama/ollama/releases/download/v${ENGINE_VERSION}/${engine.file}`)
      expect(engine.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(engine.bytes).toBeGreaterThan(100e6)
    }
  })

  it('tells an older version from a newer one', () => {
    expect(compareVersions('0.40.0', '0.9.2')).toBeGreaterThan(0)
    expect(compareVersions('0.40.0', '0.40.0')).toBe(0)
    expect(compareVersions('0.40.0', '0.40.1')).toBeLessThan(0)
    expect(compareVersions('1.0', '0.99.9')).toBeGreaterThan(0)
    expect(['0.9.2', '0.40.0', '0.12.11'].sort(compareVersions)).toEqual(['0.9.2', '0.12.11', '0.40.0'])
  })
})

describe('the progress of a model download', () => {
  it('adds up the files of the model as Ollama announces them', () => {
    const tracker = createPullTracker()
    expect(tracker.read({ status: 'pulling manifest' })).toEqual({ phase: 'preparing', doneBytes: 0, totalBytes: 0 })
    expect(tracker.read({ status: 'pulling aaaa', digest: 'sha256:aaaa', total: 4000 })).toEqual({ phase: 'downloading', doneBytes: 0, totalBytes: 4000 })
    expect(tracker.read({ status: 'pulling aaaa', digest: 'sha256:aaaa', total: 4000, completed: 1000 }).doneBytes).toBe(1000)
    expect(tracker.read({ status: 'pulling aaaa', digest: 'sha256:aaaa', total: 4000, completed: 4000 }).doneBytes).toBe(4000)
    // A second file: the total grows, what is done stays.
    expect(tracker.read({ status: 'pulling bbbb', digest: 'sha256:bbbb', total: 1000, completed: 500 })).toEqual({ phase: 'downloading', doneBytes: 4500, totalBytes: 5000 })
    expect(tracker.read({ status: 'verifying sha256 digest' }).phase).toBe('finishing')
    expect(tracker.read({ status: 'success' })).toEqual({ phase: 'finishing', doneBytes: 4500, totalBytes: 5000 })
  })

  it('never goes backwards, and never past the end', () => {
    const tracker = createPullTracker()
    tracker.read({ digest: 'sha256:aaaa', total: 4000, completed: 3000 })
    // Ollama starts a piece again: its count drops for a moment.
    expect(tracker.read({ digest: 'sha256:aaaa', total: 4000, completed: 2000 }).doneBytes).toBe(3000)
    expect(tracker.read({ digest: 'sha256:aaaa', total: 4000, completed: 9000 }).doneBytes).toBe(4000)
  })

  it('ignores what is not a line of progress', () => {
    const tracker = createPullTracker()
    for (const line of [null, 'text', 42, {}, { digest: 'sha256:aaaa' }, { digest: 'sha256:aaaa', total: 0 }]) tracker.read(line)
    expect(tracker.progress()).toEqual({ phase: 'preparing', doneBytes: 0, totalBytes: 0 })
    // "writing manifest" before any file is not the end of a download.
    expect(tracker.read({ status: 'writing manifest' }).phase).toBe('preparing')
  })
})

describe('what went wrong, in plain words', () => {
  it('explains a model that does not exist', () => {
    expect(describePullError(new Error('pull model manifest: file does not exist'), 'gemma9:1b')).toBe("Ollama's library has no model called “gemma9:1b”. Check the name.")
  })

  it('explains a library that cannot be reached', () => {
    const texts = [
      'pull model manifest: Get "https://registry.ollama.ai/v2/library/gemma4/manifests/e2b-it-q4_K_M": Forbidden',
      'pull model manifest: Get "https://registry.ollama.ai/v2/library/gemma4/manifests/12b": dial tcp: lookup registry.ollama.ai: no such host',
      'max retries exceeded: Get "https://dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com/…": net/http: TLS handshake timeout',
    ]
    for (const text of texts) expect(describePullError(new Error(text), 'gemma4:12b'), text).toMatch(/library could not be reached/)
  })

  it('explains a full disk, an Ollama too old, a download that stopped', () => {
    expect(describePullError(new Error('write /Users/x/.ollama/models/blobs/sha256-1-partial: no space left on device'), 'm')).toMatch(/disk is full/)
    expect(describePullError(new Error('The model you are attempting to pull requires a newer version of Ollama.'), 'm')).toMatch(/needs a newer Ollama/)
    expect(describePullError(new Error('The download stopped before the end.'), 'm')).toMatch(/goes on from where it stopped/)
    expect(describePullError(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }), 'm')).toMatch(/library could not be reached/)
  })

  it('passes on what it does not recognise', () => {
    expect(describePullError(new Error('something new'), 'm')).toBe('something new')
    expect(describeEngineDownloadError(new Error('something new'))).toBe('something new')
  })

  it('explains a failed download of the engine', () => {
    expect(describeEngineDownloadError(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }))).toMatch(/internet connection/)
    expect(describeEngineDownloadError(new TypeError('terminated'))).toMatch(/internet connection/)
    expect(describeEngineDownloadError(new Error("ENOSPC: no space left on device, write"))).toMatch(/disk is full/)
  })

  it('tells a stop asked by the user from a failure', () => {
    const stopped = new Error('Stopped.')
    stopped.name = 'AbortError'
    expect(isAbort(stopped)).toBe(true)
    expect(isAbort(new Error('no'))).toBe(false)
    expect(new EngineMissingError().message).toMatch(/Settings > Connection/)
  })
})

describe('the name of a model in Ollama', () => {
  it('is the same with or without ":latest", in any case', () => {
    expect(sameOllamaModel('gemma4', 'gemma4:latest')).toBe(true)
    expect(sameOllamaModel('gemma4:12b-it-q4_K_M', 'gemma4:12b-it-q4_k_m')).toBe(true)
    expect(sameOllamaModel('gemma4:12b', 'gemma4:26b')).toBe(false)
    expect(sameOllamaModel(undefined, 'gemma4')).toBe(false)
  })
})
