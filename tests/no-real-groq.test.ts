import { afterEach, expect, test, vi } from "vitest"
import { agentModel } from "@/lib/agent/model"

// The locks in scripts/with-test-db.mjs and lib/agent/model.ts, tried for real: this file has no fake model,
// and still nothing in a test run can reach Groq.

afterEach(() => {
  vi.unstubAllEnvs()
})

test("test runs get an empty Groq key", () => {
  // A yes or no, so a failure never prints a real key.
  expect(process.env.GROQ_API_KEY === "").toBe(true)
  expect(process.env.ALLOW_REAL_GROQ).toBeUndefined()
})

test("the real model can't be made inside a test run", () => {
  expect(() => agentModel()).toThrow("A test reached the real model")
})

test("even when allowed, an empty key stops before any request", () => {
  vi.stubEnv("ALLOW_REAL_GROQ", "1")
  vi.stubEnv("GROQ_API_KEY", "")
  expect(() => agentModel()).toThrow("GROQ_API_KEY is empty")
})
