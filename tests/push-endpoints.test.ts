import { afterEach, describe, expect, test, vi } from "vitest"
import { isPushEndpoint } from "@/lib/notifications/subscriptions"

// Ask only stores, and only ever POSTs to, an endpoint on a real push service, so a visitor can't make the server
// send requests wherever they like.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isPushEndpoint", () => {
  test.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("a push service's endpoint is accepted: %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true)
  })

  test.each([
    ["not https", "http://fcm.googleapis.com/fcm/send/abc"],
    ["another site", "https://evil.example/push"],
    ["a push host as a subdomain of another site", "https://fcm.googleapis.com.evil.example/x"],
    ["a look-alike domain", "https://evilpush.apple.com/x"],
    ["a push host as user info", "https://fcm.googleapis.com@evil.example/x"],
    ["user info on a push host", "https://user:pw@fcm.googleapis.com/x"],
    ["an odd port", "https://fcm.googleapis.com:8443/x"],
    ["an IP address", "https://203.0.113.5/push"],
    ["localhost", "https://localhost/push"],
    ["not a URL", "fcm.googleapis.com/x"],
  ])("refused: %s", (_, endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false)
  })

  test("the fake push service on 127.0.0.1 is allowed only under the test fakes", () => {
    const fake = "http://127.0.0.1:3311/push/laptop"

    vi.stubEnv("ASK_FAKE_NOTIFY", "")
    expect(isPushEndpoint(fake)).toBe(false)
    vi.stubEnv("ASK_FAKE_NOTIFY", "1")
    expect(isPushEndpoint(fake)).toBe(true)
    // Even under the fakes, only plain http on 127.0.0.1, nowhere else.
    expect(isPushEndpoint("http://localhost:3311/push/laptop")).toBe(false)
    expect(isPushEndpoint("http://10.0.0.1/push")).toBe(false)
  })
})
