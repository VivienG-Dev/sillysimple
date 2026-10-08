import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests cover src/core and the parts of src/main that do not need Electron
// (card files, database): plain TypeScript running in Node.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@core': resolve('src/core'),
    },
  },
  test: {
    include: ['src/core/**/*.test.ts', 'src/main/**/*.test.ts'],
  },
})
