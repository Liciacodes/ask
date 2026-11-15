import { spawnSync } from "node:child_process"
import nextEnv from "@next/env"

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error: console.error })

const { DATABASE_URL, TEST_DATABASE_URL } = process.env

// Neon's pooled and direct strings differ only by "-pooler" in the host, but they reach the same database.
const database = (url) => {
  const { hostname, pathname } = new URL(url)
  return hostname.replace("-pooler", "") + pathname
}

if (!TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is not set. Add it to .env.local (see .env.example).")
  process.exit(1)
}
if (DATABASE_URL && database(DATABASE_URL) === database(TEST_DATABASE_URL)) {
  console.error("TEST_DATABASE_URL points at the same database as DATABASE_URL. Refusing to run.")
  process.exit(1)
}

const result = spawnSync(process.argv.slice(2).join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
})
process.exit(result.status ?? 1)
