import { createHash, createHmac, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { generateVAPIDKeys } from "web-push"

// Stand-ins for Upstash QStash and the browsers' push services, so no test ever reaches the real ones. Every test run
// gets FAKE_NOTIFY_ENV (scripts/with-test-db.mjs for Vitest, playwright.config.ts for the browser tests' server):
// fake keys, and a QStash address on 127.0.0.1. The API tests start the fakes with startFakeQStash() and
// startFakePush(), and sign requests the way QStash does with signLikeQStash().

const FAKE_QSTASH_PORT = 3310
const FAKE_PUSH_PORT = 3311

// A key pair made for this run only: the fake push service doesn't check signatures, but web-push needs real keys.
const vapid = generateVAPIDKeys()

const FAKE_NOTIFY_ENV = {
  ASK_FAKE_NOTIFY: "1",
  ASK_SITE_URL: "http://ask.test",
  QSTASH_URL: `http://127.0.0.1:${FAKE_QSTASH_PORT}`,
  QSTASH_TOKEN: "fake-qstash-token",
  QSTASH_CURRENT_SIGNING_KEY: "sig_fake_current_signing_key",
  QSTASH_NEXT_SIGNING_KEY: "sig_fake_next_signing_key",
  // Never read: a real QStash dev-mode switch must not make the receiver trust the dev server's keys.
  QSTASH_DEV: "",
  CRON_SECRET: "fake-cron-secret",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => resolve())
  })
}

const readBody = (request) =>
  new Promise((resolve) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks)))
  })

// A fake QStash: it records every message published, with when it's to be delivered and its deduplication id.
// `down` makes it refuse, like QStash being unreachable.
async function startFakeQStash() {
  /** @type {{ published: { url: string; notBefore: number; deduplicationId: string | undefined; token: string | undefined; body: { id: string; due_at: string } }[]; down: boolean }} */
  const state = { published: [], down: false }
  const server = createServer(async (request, response) => {
    const body = (await readBody(request)).toString()
    const match = request.url.match(/^\/v2\/publish\/(.+)$/)
    if (state.down || request.method !== "POST" || !match) {
      response.writeHead(state.down ? 503 : 404, { "content-type": "application/json" })
      return response.end(JSON.stringify({ error: state.down ? "Service unavailable" : "Not found" }))
    }
    state.published.push({
      url: decodeURIComponent(match[1]),
      notBefore: Number(request.headers["upstash-not-before"]),
      deduplicationId: request.headers["upstash-deduplication-id"],
      token: request.headers.authorization,
      body: JSON.parse(body),
    })
    response.writeHead(201, { "content-type": "application/json" })
    response.end(JSON.stringify({ messageId: `msg_fake_${state.published.length}` }))
  })
  await listen(server, FAKE_QSTASH_PORT)
  return { state, close: () => new Promise((resolve) => server.close(() => resolve())) }
}

// A fake push service. A subscription's endpoint is fakePushEndpoint(name); `answers` sets the status a name gets
// (201 unless said otherwise, 410 for a subscription that's gone). It records what each push carried.
async function startFakePush() {
  /** @type {{ received: { name: string; ttl: string | undefined; urgency: string | undefined; encoding: string | undefined; authorization: string | undefined; bytes: number }[]; answers: Map<string, number> }} */
  const state = { received: [], answers: new Map() }
  const server = createServer(async (request, response) => {
    const body = await readBody(request)
    const name = decodeURIComponent(request.url.replace(/^\/push\//, ""))
    state.received.push({
      name,
      ttl: request.headers.ttl,
      urgency: request.headers.urgency,
      encoding: request.headers["content-encoding"],
      authorization: request.headers.authorization,
      bytes: body.length,
    })
    response.writeHead(state.answers.get(name) ?? 201)
    response.end()
  })
  await listen(server, FAKE_PUSH_PORT)
  return { state, close: () => new Promise((resolve) => server.close(() => resolve())) }
}

const fakePushEndpoint = (name) => `http://127.0.0.1:${FAKE_PUSH_PORT}/push/${encodeURIComponent(name)}`

const base64url = (value) => Buffer.from(value).toString("base64url")

// An Upstash-Signature for `body` sent to `url`, signed the way QStash signs: an HS256 token from the signing key,
// naming the URL and the body's SHA-256.
function signLikeQStash(body, url, key = FAKE_NOTIFY_ENV.QSTASH_CURRENT_SIGNING_KEY, { expiresIn = 300 } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const claims = {
    iss: "Upstash",
    sub: url,
    iat: now,
    nbf: now,
    exp: now + expiresIn,
    jti: randomUUID(),
    body: createHash("sha256").update(body).digest("base64url"),
  }
  const payload = base64url(JSON.stringify(claims))
  const signature = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url")
  return `${header}.${payload}.${signature}`
}

export { FAKE_NOTIFY_ENV, fakePushEndpoint, signLikeQStash, startFakePush, startFakeQStash }
