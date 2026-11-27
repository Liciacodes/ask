import { createHash, randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import type { GoogleProfile } from "@/lib/google"
import { scheduleOwnerWeek } from "@/lib/notifications/schedule"
import { deleteSubscription } from "@/lib/notifications/subscriptions"
import { moveGuestToAccount } from "@/lib/owner-move"
import { cookieIn, visitorFrom } from "@/lib/visitor"

// Signing in is optional. A signed-in browser carries a session cookie with a random token; the sessions table
// keeps only the token's SHA-256, so a copy of the table can't sign anyone in.

// Like the visitor cookie: __Host- on HTTPS, the plain name on http://localhost.
const SECURE_SESSION_COOKIE = "__Host-ask-session"
const LOCAL_SESSION_COOKIE = "ask-session"
// The state and PKCE verifier between sending someone to Google and Google sending them back.
const SECURE_SIGNIN_COOKIE = "__Host-ask-google-signin"
const LOCAL_SIGNIN_COOKIE = "ask-google-signin"

const SESSION_DAYS = 30
const SIGNIN_MINUTES = 10

const TOKEN = /^[A-Za-z0-9_-]{43}$/

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

function sessionToken(request: Request) {
  const header = request.headers.get("cookie")
  return [SECURE_SESSION_COOKIE, LOCAL_SESSION_COOKIE].map((name) => cookieIn(header, name)).find((value) => value !== undefined && TOKEN.test(value))
}

// The signed-in user for this request, or null when there's no live session.
async function userFrom(request: Request) {
  const token = sessionToken(request)
  if (!token) return null
  const session = await db.session.findUnique({ where: { id: hash(token) }, include: { user: true } })
  if (!session || session.expiresAt <= new Date()) return null
  return session.user
}

// Whose reminders this request reads and changes: the signed-in user's, or else this browser's visitor id. Null
// when there's neither, and then the route refuses with noVisitor().
async function ownerFrom(request: Request) {
  return (await userFrom(request))?.id ?? visitorFrom(request)
}

// Signs `profile` in: finds or makes their account, moves this browser's guest reminders and push subscriptions
// into it (lib/owner-move.ts), and starts a session, all at once. Returns the token for the cookie.
async function signIn(profile: GoogleProfile, visitor: string | null) {
  const token = randomBytes(32).toString("base64url")
  const userId = await db.$transaction(async (tx) => {
    const { sub, ...details } = profile
    const user = await tx.user.upsert({ where: { googleSub: sub }, create: { googleSub: sub, ...details }, update: details })
    if (visitor) await moveGuestToAccount(tx, visitor, user.id)
    await tx.session.create({ data: { id: hash(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } })
    return user.id
  })
  // The guest's reminders may now belong to an account with reminders turned on elsewhere: schedule them now,
  // rather than at the next daily cron. A failure here never fails the sign-in.
  if (visitor) await scheduleOwnerWeek(userId).catch((error: unknown) => console.warn("Couldn't schedule after sign-in:", error))
  return token
}

// Ends this browser's session. With `endpoint`, this browser's push subscription goes too, so a shared computer
// stops showing the account's reminders.
async function signOut(request: Request, endpoint?: string) {
  const user = endpoint ? await userFrom(request) : null
  if (user && endpoint) await deleteSubscription(user.id, endpoint)
  const token = sessionToken(request)
  if (token) await db.session.deleteMany({ where: { id: hash(token) } })
}

const cookieBase = (protocol: string) => ({ httpOnly: true, secure: protocol === "https:", sameSite: "lax" as const, path: "/" })

// `token` null clears the cookie.
function sessionCookie(protocol: string, token: string | null) {
  return {
    name: protocol === "https:" ? SECURE_SESSION_COOKIE : LOCAL_SESSION_COOKIE,
    value: token ?? "",
    ...cookieBase(protocol),
    maxAge: token ? SESSION_DAYS * 86_400 : 0,
  }
}

// `value` null clears it.
function signInCookie(protocol: string, value: string | null) {
  return {
    name: protocol === "https:" ? SECURE_SIGNIN_COOKIE : LOCAL_SIGNIN_COOKIE,
    value: value ?? "",
    ...cookieBase(protocol),
    maxAge: value ? SIGNIN_MINUTES * 60 : 0,
  }
}

function signInCookieFrom(request: Request) {
  const header = request.headers.get("cookie")
  return [SECURE_SIGNIN_COOKIE, LOCAL_SIGNIN_COOKIE].map((name) => cookieIn(header, name)).find((value) => value)
}

export {
  LOCAL_SESSION_COOKIE,
  LOCAL_SIGNIN_COOKIE,
  ownerFrom,
  sessionCookie,
  signIn,
  signInCookie,
  signInCookieFrom,
  signOut,
  userFrom,
}
