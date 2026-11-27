import { afterEach, expect, test, vi } from "vitest"
import { qstashSettings } from "@/lib/notifications/config"
import { assertSendable } from "@/lib/notifications/send"

// Tests never reach the real Upstash or a real push service, and the code itself refuses inside Vitest, as it does
// for Groq (tests/no-real-groq.test.ts). Don't weaken these.

afterEach(() => {
  vi.unstubAllEnvs()
})

test("every test run gets the fake QStash on 127.0.0.1", () => {
  expect(new URL(process.env.QSTASH_URL!).hostname).toBe("127.0.0.1")
  expect(process.env.ASK_FAKE_NOTIFY).toBe("1")
})

test("publishing to the real QStash is refused inside Vitest", () => {
  vi.stubEnv("QSTASH_URL", "https://qstash.upstash.io")
  expect(() => qstashSettings()).toThrow("Tests never reach the real QStash")

  vi.stubEnv("QSTASH_URL", "")
  expect(() => qstashSettings()).toThrow("Tests never reach the real QStash")
})

test("sending to a real push service is refused inside Vitest, even one on the allowed list", () => {
  expect(() => assertSendable("https://fcm.googleapis.com/fcm/send/abc")).toThrow("Tests never reach real push services")
  expect(() => assertSendable("https://web.push.apple.com/abc")).toThrow("Tests never reach real push services")
  expect(() => assertSendable("http://127.0.0.1:3311/push/laptop")).not.toThrow()
})
