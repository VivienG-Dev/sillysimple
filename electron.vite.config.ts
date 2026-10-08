import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'
import { VueRouterAutoImports } from 'vue-router/unplugin'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

// Three builds, one per Electron process:
//   main     -> src/main      (Node: windows, files, calls to the model)
//   preload  -> src/preload   (the only bridge between main and the UI)
//   renderer -> src/renderer  (the Vue app, organised like a Nuxt project)

/** The version in package.json, shown in the app (Settings › Help). */
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

const shared = {
  '@shared': resolve('src/shared'),
  '@core': resolve('src/core'),
}

export default defineConfig({
  main: {
    resolve: { alias: shared },
  },

  preload: {
    resolve: { alias: shared },
    build: {
      // The preload runs sandboxed, and a sandboxed preload must be CommonJS.
      rollupOptions: { output: { format: 'cjs' } },
    },
  },

  renderer: {
    root: 'src/renderer',
    define: { __APP_VERSION__: JSON.stringify(version) },
    resolve: {
      alias: { ...shared, '@': resolve('src/renderer') },
    },
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
    plugins: [
      // File-based routes, like Nuxt: pages/library.vue -> /library
      VueRouter({
        root: resolve('src/renderer'),
        routesFolder: 'pages',
        dts: 'types/typed-router.d.ts',
      }),
      vue(),
      // Auto-imports, like Nuxt: ref(), useRoute(), stores, composables, utils
      AutoImport({
        imports: ['vue', VueRouterAutoImports, 'pinia'],
        dirs: ['composables', 'stores', 'utils'].map((dir) => resolve('src/renderer', dir)),
        dts: resolve('src/renderer/types/auto-imports.d.ts'),
        vueTemplate: true,
      }),
      // Components in components/ are usable in templates without importing them
      Components({
        dirs: [resolve('src/renderer/components')],
        dts: resolve('src/renderer/types/components.d.ts'),
      }),
    ],
  },
})
