import { spawnSync } from "node:child_process"
import nextEnv from "@next/env"
import { FAKE_GOOGLE_ENV } from "./fake-google.mjs"

// Groq is paid for, so the one run that calls it, `npm run test:live` (marked --real-groq), also needs
// ALLOW_REAL_GROQ=1 set for that one command. It's read before the .env files load: a line in .env.local doesn't count.
const allowRealGroq = process.env.ALLOW_REAL_GROQ === "1"

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

const args = process.argv.slice(2)
const realGroq = args[0] === "--real-groq"
if (realGroq) args.shift()

if (realGroq && !allowRealGroq) {
  console.error(
    [
      "This run calls the real model on Groq and uses the free day's allowance, which the live site shares.",
      "To run it, set ALLOW_REAL_GROQ=1 for this one command:",
      '  PowerShell: try { $env:ALLOW_REAL_GROQ = "1"; npm run test:live } finally { Remove-Item Env:ALLOW_REAL_GROQ }',
      "  bash:       ALLOW_REAL_GROQ=1 npm run test:live",
    ].join("\n")
  )
  process.exit(1)
}

// Every other run gets an empty Groq key. Empty rather than missing: Next's env loader only fills in missing
// variables, so nothing in the run can load the real key from .env.local again, and lib/agent/model.ts refuses
// an empty key before any request.
// Google sign-in always goes to the fake (scripts/fake-google.mjs), with fake credentials in place of the real ones.
const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, ...FAKE_GOOGLE_ENV }
delete env.ALLOW_REAL_GROQ
if (realGroq) env.ALLOW_REAL_GROQ = "1"
else env.GROQ_API_KEY = ""

// The command runs through a shell (Windows needs one for npm's .cmd files), which splits on spaces, so each
// argument is quoted for it: `-t "next Friday"` must reach Vitest as one argument.
const quoted = (arg) => {
  if (/^[\w@+=:,./-]+$/.test(arg)) return arg
  return process.platform === "win32" ? `"${arg.replace(/"/g, '""')}"` : `'${arg.replace(/'/g, "'\\''")}'`
}

const result = spawnSync(args.map(quoted).join(" "), { stdio: "inherit", shell: true, env })
process.exit(result.status ?? 1)
