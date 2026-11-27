import { defineConfig, devices } from "@playwright/test"
import { FAKE_GOOGLE_ENV } from "./scripts/fake-google.mjs"
import { FAKE_NOTIFY_ENV } from "./scripts/fake-notify.mjs"

const ci = Boolean(process.env.CI)
// The browser tests always get a server of their own, on a port of their own: never your dev server, which has
// your Groq key and your database. A second `next dev` can't run beside yours (Next locks .next/dev), but a production
// build can, so locally and in CI alike they build, then start it here. If the port is taken, the run stops.
// The build goes into a folder of its own, .next-e2e (next.config.ts), so it never replaces `npm run check:server`'s.
// Both the build and the server run through scripts/with-test-db.mjs, so the only database they can reach is the
// test database, and it refuses to start if TEST_DATABASE_URL is the real one.
const PORT = 3100
const testDb = "node scripts/with-test-db.mjs"
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
    command: `${testDb} npm run build && ${testDb} next start --port ${PORT}`,
    url,
    reuseExistingServer: false,
    timeout: 240_000,
    // No Groq key: empty, so Next can't fill it in from .env.local (scripts/with-test-db.mjs empties it too). Every
    // page also blocks /api/agent unless the test fakes it (e2e/helpers.ts), so no browser test reaches the agent
    // route at all.
    // Google sign-in points at the fake, with fake credentials, so the real ones in .env.local are never loaded.
    // Notifications get fake keys and a QStash on 127.0.0.1 (scripts/fake-notify.mjs); the browser tests also fake the
    // browser's push subscription, so Chromium never registers with a real push service.
    env: { GROQ_API_KEY: "", ASK_BUILD_DIR: ".next-e2e", ...FAKE_GOOGLE_ENV, ...FAKE_NOTIFY_ENV },
  },
})
