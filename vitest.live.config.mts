import { defineConfig } from "vitest/config"

// Checks against the real model (Groq). Only `npm run test:live` uses this config; `npm run test:api` and CI never do.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/live/**/*.live.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    // Prints what the model did with every sentence, passed or not.
    silent: false,
    // A sentence can wait for room under Groq's per-minute limit before each of its calls.
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
})
