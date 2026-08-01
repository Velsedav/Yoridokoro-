import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'electron/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve(process.cwd(), 'src'),
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), 'src/index.html'),
        output: {
          manualChunks(id) {
            const moduleId = id.replaceAll('\\', '/')
            if (moduleId.includes('/node_modules/lucide-react/')) return 'icons'
            if (
              moduleId.includes('/node_modules/react/') ||
              moduleId.includes('/node_modules/react-dom/') ||
              moduleId.includes('/node_modules/react-router/') ||
              moduleId.includes('/node_modules/react-router-dom/') ||
              moduleId.includes('/node_modules/scheduler/')
            ) return 'react-vendor'
            if (moduleId.endsWith('/src/lib/i18n.ts')) return 'translations'
          },
        },
      },
    },
    plugins: [react()],
  },
})
