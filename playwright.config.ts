import { defineConfig, devices } from "@playwright/test"
import { FAKE_GOOGLE_ENV } from "./scripts/fake-google.mjs"

const ci = Boolean(process.env.CI)
// The browser tests always get a server of their own, on a port of their own: never your dev server, which has
// your Groq key and your database. A second `next dev` can't run beside yours (Next locks .next/dev), but a production
// build can, so locally and in CI alike they build, then start it here. If the port is taken, the run stops.
const PORT = 3100
const url = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: ci,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: url,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url,
    reuseExistingServer: false,
    timeout: 240_000,
    // No Groq key: empty, so Next can't fill it in from .env.local. Every page also blocks /api/agent unless the test
    // fakes it (e2e/helpers.ts), so no browser test reaches the agent route at all.
    // Google sign-in points at the fake, with fake credentials, so the real ones in .env.local are never loaded.
    env: { GROQ_API_KEY: "", ...FAKE_GOOGLE_ENV },
  },
})
