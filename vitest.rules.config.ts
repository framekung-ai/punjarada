import { defineConfig } from 'vitest/config'

// Security-rules tests. Run with: npm run test:rules  (starts the local Firestore emulator; no quota used)
export default defineConfig({
  test: { include: ['tests/**/*.rules.test.ts'], testTimeout: 20000, fileParallelism: false },
})
