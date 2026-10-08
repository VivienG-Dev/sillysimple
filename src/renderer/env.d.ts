/// <reference types="vite/client" />
/// <reference types="vue-router/auto-routes" />

import type { SillyApi } from '@shared/api'

declare global {
  /** The app's version, from package.json (see electron.vite.config.ts). */
  const __APP_VERSION__: string
  interface Window {
    /** Exposed by src/preload/index.ts */
    api: SillyApi
  }
}

export {}
