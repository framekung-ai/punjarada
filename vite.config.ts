import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

// `npm run demo` (mode "demo") swaps the Firebase data/auth layer for an in-memory mock,
// so the UI can be tried and tested without touching the real project or its quota.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: mode === 'demo'
      ? [
          { find: /^(\.\.?\/)+lib\/db$/, replacement: src('demo/db-mock.ts') },
          { find: /^\.\/db$/, replacement: src('demo/db-mock.ts') },
          { find: /^(\.\.?\/)+lib\/auth$/, replacement: src('demo/auth-mock.tsx') },
          { find: /^\.\/lib\/auth$/, replacement: src('demo/auth-mock.tsx') },
        ]
      : [],
  },
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ['src/**/*.test.ts'] },
}))
