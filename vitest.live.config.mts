import { defineConfig } from "vitest/config"

// Checks against the real model (Groq). Only `npm run test:live` uses this config; `npm run test:api` and CI never do.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/live/**/*.live.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
})
