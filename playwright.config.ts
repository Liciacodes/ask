import { defineConfig, devices } from "@playwright/test"

const ci = Boolean(process.env.CI)
const url = `http://localhost:${process.env.PORT ?? 3000}`

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
    command: ci ? "npm run build && npm run start" : "npm run dev",
    url,
    reuseExistingServer: !ci,
    timeout: 180_000,
    // The server Playwright starts gets no Groq key: empty, so Next can't fill it in from .env.local. A dev server
    // it reuses has yours, which is why every page also blocks /api/agent unless the test fakes it (e2e/helpers.ts).
    env: { GROQ_API_KEY: "" },
  },
})
