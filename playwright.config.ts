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
  },
})
