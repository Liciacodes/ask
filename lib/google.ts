import { CodeChallengeMethod, decodeIdToken, generateCodeVerifier, generateState, OAuth2Client } from "arctic"

// Signing in with Google: openid, email and profile only. Arctic does the OAuth steps (state, PKCE, swapping the
// code); this file picks the endpoints and checks what Google says about the person.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPES = ["openid", "email", "profile"]
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"]

const CALLBACK_PATH = "/api/auth/callback/google"

type GoogleProfile = { sub: string; email: string; name: string | null; picture: string | null }

const isGoogle = (url: string) => /(^|\.)(google\.com|googleapis\.com)$/.test(new URL(url).hostname)

// Google's own endpoints, unless GOOGLE_AUTH_URL and GOOGLE_TOKEN_URL name a fake one. Tests always do, and inside
// Vitest or the browser tests' server (ASK_FAKE_GOOGLE=1) a real Google endpoint is refused before any request.
function endpoints() {
  const auth = process.env.GOOGLE_AUTH_URL || GOOGLE_AUTH_URL
  const token = process.env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN_URL
  if ((process.env.VITEST || process.env.ASK_FAKE_GOOGLE === "1") && (isGoogle(auth) || isGoogle(token))) {
    throw new Error("Tests must sign in with a fake Google: set GOOGLE_AUTH_URL and GOOGLE_TOKEN_URL to it.")
  }
  return { auth, token }
}

function client(origin: string) {
  const id = process.env.AUTH_GOOGLE_ID
  const secret = process.env.AUTH_GOOGLE_SECRET
  if (!id || !secret) throw new Error("AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set to sign in with Google.")
  return { id, oauth: new OAuth2Client(id, secret, origin + CALLBACK_PATH) }
}

// Where to send the browser to sign in, and the state and PKCE verifier the callback must be given back.
function signInStart(origin: string) {
  const state = generateState()
  const verifier = generateCodeVerifier()
  const url = client(origin).oauth.createAuthorizationURLWithPKCE(endpoints().auth, state, CodeChallengeMethod.S256, verifier, SCOPES)
  url.searchParams.set("prompt", "select_account")
  return { url, state, verifier }
}

// Swaps the code for an ID token and reads the person from it, or null when the token isn't for us, isn't from
// Google, has expired, or the email isn't verified. The token comes straight from Google's token endpoint over
// TLS, so its signature isn't checked, but its claims are.
async function signInFinish(origin: string, code: string, verifier: string): Promise<GoogleProfile | null> {
  const { id, oauth } = client(origin)
  const tokens = await oauth.validateAuthorizationCode(endpoints().token, code, verifier)
  return profileFrom(decodeIdToken(tokens.idToken()) as Record<string, unknown>, id)
}

function profileFrom(claims: Record<string, unknown>, clientId: string, now = Date.now()): GoogleProfile | null {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audience.includes(clientId)) return null
  if (typeof claims.iss !== "string" || !ISSUERS.includes(claims.iss)) return null
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null
  if (claims.email_verified !== true) return null
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email) return null
  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === "string" ? claims.name : null,
    picture: typeof claims.picture === "string" ? claims.picture : null,
  }
}

export { CALLBACK_PATH, endpoints, signInFinish, signInStart, type GoogleProfile }
