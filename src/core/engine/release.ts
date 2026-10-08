// The app's own Ollama: which file to download for which computer.
//
// The app does not ship Ollama in its installer. When the user picks "On this computer"
// and no Ollama runs there, the app downloads this exact version from Ollama's GitHub
// releases, checks it against the checksum written here, and runs it (src/main/engine.ts).
//
// To move to a newer Ollama: change ENGINE_VERSION, then copy the sizes and the SHA-256
// of each file from that release (its `sha256sum.txt`). An engine already installed is
// kept and used as it is: nobody is made to download again.

export const ENGINE_VERSION = '0.40.0'

export type ArchiveFormat = 'tgz' | 'tar.zst' | 'zip'

export interface EnginePackage {
  version: string
  /** The name of the file in the release. */
  file: string
  url: string
  bytes: number
  sha256: string
  format: ArchiveFormat
  /** Where the program is once the archive is unpacked. */
  binary: string
}

interface Listed {
  file: string
  bytes: number
  sha256: string
  format: ArchiveFormat
  binary: string
}

// Ollama 0.40.0, released 25 September 2026.
const PACKAGES: Record<string, Listed> = {
  // One file for both kinds of Mac (Apple Silicon and Intel).
  darwin: {
    file: 'ollama-darwin.tgz',
    bytes: 167_494_179,
    sha256: 'b490b4925a95c5f3dfcd889e566cf3dcd727848d59057fb00b03f1d6630326dc',
    format: 'tgz',
    binary: 'ollama',
  },
  // Large because it carries what NVIDIA graphics cards need.
  'win32-x64': {
    file: 'ollama-windows-amd64.zip',
    bytes: 1_468_064_949,
    sha256: '3623e256762ca89bd6fa99b0cc4106401919ce9df926411673e632e3ea287bb5',
    format: 'zip',
    binary: 'ollama.exe',
  },
  'win32-arm64': {
    file: 'ollama-windows-arm64.zip',
    bytes: 209_960_906,
    sha256: '18eec8eeb6a1193b998b09c9aed2668b1b360663edf31ccf061c07a09f7bcb25',
    format: 'zip',
    binary: 'ollama.exe',
  },
  'linux-x64': {
    file: 'ollama-linux-amd64.tar.zst',
    bytes: 1_436_550_133,
    sha256: 'c94aa4156b3d13e64ebc2efe5ea53f015384c882be776e6695cfb37fb180d5ad',
    format: 'tar.zst',
    binary: 'bin/ollama',
  },
  'linux-arm64': {
    file: 'ollama-linux-arm64.tar.zst',
    bytes: 1_557_877_510,
    sha256: '4d27cb1d8f46176a3c0ce10aea2a16e4ad73dfe1599f2ed13468f29e5b8aba0d',
    format: 'tar.zst',
    binary: 'bin/ollama',
  },
}

/** The download for this kind of computer, or null when Ollama has none for it. */
export function enginePackage(platform: string, arch: string): EnginePackage | null {
  const listed = PACKAGES[platform === 'darwin' ? 'darwin' : `${platform}-${arch}`]
  if (!listed) return null
  return {
    ...listed,
    version: ENGINE_VERSION,
    url: `https://github.com/ollama/ollama/releases/download/v${ENGINE_VERSION}/${listed.file}`,
  }
}

/** "0.40.0" against "0.9.2": which is newer. Negative when `a` is older, zero when they are the same. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string): number[] => version.split(/[.\-+]/).map((part) => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
