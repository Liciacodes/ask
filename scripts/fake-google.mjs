import { createHash } from "node:crypto"
import { createServer } from "node:http"

// A stand-in for Google's sign-in, so no test ever reaches the real one. Every test run gets FAKE_GOOGLE_ENV
// (scripts/with-test-db.mjs for Vitest, playwright.config.ts for the browser tests' server). The API tests start
// it with startFakeGoogle().

const FAKE_GOOGLE_PORT = 3300
const origin = `http://127.0.0.1:${FAKE_GOOGLE_PORT}`

const FAKE_GOOGLE_ENV = {
  AUTH_GOOGLE_ID: "fake-client-id",
  AUTH_GOOGLE_SECRET: "fake-client-secret",
  GOOGLE_AUTH_URL: `${origin}/authorize`,
  GOOGLE_TOKEN_URL: `${origin}/token`,
  ASK_FAKE_GOOGLE: "1",
}

// The person the fake signs in.
const FAKE_PERSON = { sub: "fake-google-user", email: "ada@example.com", email_verified: true, name: "Ada Lovelace" }

const base64url = (value) => Buffer.from(value).toString("base64url")

// An ID token shaped like Google's. Its signature is junk: Ask doesn't check signatures, only the claims.
function idToken(claims) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: "https://accounts.google.com", aud: FAKE_GOOGLE_ENV.AUTH_GOOGLE_ID, iat: now, exp: now + 3600, ...claims }
  return [base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })), base64url(JSON.stringify(payload)), "fake-signature"].join(".")
}

// `fake.claims` changes what the next ID tokens say, on top of FAKE_PERSON.
function startFakeGoogle(port = FAKE_GOOGLE_PORT) {
  const fake = { claims: {}, server: null }
  // Each code's PKCE challenge, so /token can check the verifier the way Google does.
  const challenges = new Map()

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, origin)
    if (url.pathname === "/authorize") {
      const code = crypto.randomUUID()
      challenges.set(code, url.searchParams.get("code_challenge"))
      const back = new URL(url.searchParams.get("redirect_uri"))
      back.searchParams.set("code", code)
      back.searchParams.set("state", url.searchParams.get("state") ?? "")
      response.writeHead(302, { location: back.href }).end()
      return
    }
    if (url.pathname === "/token" && request.method === "POST") {
      let body = ""
      for await (const chunk of request) body += chunk
      const form = new URLSearchParams(body)
      const credentials = Buffer.from(`${FAKE_GOOGLE_ENV.AUTH_GOOGLE_ID}:${FAKE_GOOGLE_ENV.AUTH_GOOGLE_SECRET}`).toString("base64")
      const challenge = challenges.get(form.get("code"))
      challenges.delete(form.get("code"))
      const verifier = form.get("code_verifier") ?? ""
      const ok =
        request.headers.authorization === `Basic ${credentials}` &&
        challenge !== undefined &&
        createHash("sha256").update(verifier).digest("base64url") === challenge
      response.writeHead(ok ? 200 : 400, { "content-type": "application/json" })
      response.end(JSON.stringify(ok ? { access_token: "fake", token_type: "Bearer", expires_in: 3600, id_token: idToken({ ...FAKE_PERSON, ...fake.claims }) } : { error: "invalid_grant" }))
      return
    }
    response.writeHead(404).end()
  })
  fake.server = server
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(fake)))
}

export { FAKE_GOOGLE_ENV, FAKE_GOOGLE_PORT, FAKE_PERSON, idToken, startFakeGoogle }
