// The settings notifications need, read when they're needed. Anything missing turns that part off rather than
// failing a save: without ASK_SITE_URL and QSTASH_TOKEN nothing is scheduled, and without the VAPID keys nothing
// is sent.

const NOTIFY_PATH = "/api/notify"

// Under the test fakes (scripts/fake-notify.mjs) a push service on 127.0.0.1 is allowed.
const faking = () => process.env.ASK_FAKE_NOTIFY === "1"
const inVitest = () => process.env.VITEST !== undefined

// The address QStash calls back. A signature is checked against exactly this URL.
function notifyUrl() {
  const site = process.env.ASK_SITE_URL?.trim()
  return site ? new URL(NOTIFY_PATH, site).toString() : null
}

function qstashSettings() {
  const token = process.env.QSTASH_TOKEN?.trim()
  const url = notifyUrl()
  if (!token || !url) return null
  const baseUrl = process.env.QSTASH_URL?.trim() || undefined
  // Tests never reach the real Upstash: inside Vitest only the fake QStash on 127.0.0.1 will do.
  if (inVitest() && (!baseUrl || new URL(baseUrl).hostname !== "127.0.0.1")) {
    throw new Error("Tests never reach the real QStash: QSTASH_URL must be the fake on 127.0.0.1")
  }
  return { token, baseUrl, notifyUrl: url }
}

function signingKeys() {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
  const next = process.env.QSTASH_NEXT_SIGNING_KEY?.trim()
  return current && next ? { current, next } : null
}

function vapidKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  return publicKey && privateKey ? { publicKey, privateKey } : null
}

export { faking, inVitest, NOTIFY_PATH, notifyUrl, qstashSettings, signingKeys, vapidKeys }
