import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The lab: trials that need a real model, run by hand (`pnpm mood:lab`), never by
// `pnpm test`. vitest is only the way to run TypeScript that uses the app's own code.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@core': resolve('src/core'),
    },
  },
  test: {
    include: ['lab/**/*.lab.ts'],
    testTimeout: 45 * 60_000,
    hookTimeout: 45 * 60_000,
    // What it finds out is what it prints.
    silent: false,
    disableConsoleIntercept: true,
  },
})
