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

// The command runs through a shell (Windows needs one for npm's .cmd files), which splits on spaces, so each
// argument is quoted for it: `-t "next Friday"` must reach Vitest as one argument.
const quoted = (arg) => {
  if (/^[\w@+=:,./-]+$/.test(arg)) return arg
  return process.platform === "win32" ? `"${arg.replace(/"/g, '""')}"` : `'${arg.replace(/'/g, "'\\''")}'`
}

const result = spawnSync(process.argv.slice(2).map(quoted).join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
})
process.exit(result.status ?? 1)
