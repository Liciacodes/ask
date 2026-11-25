import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { GET as callback } from "@/app/api/auth/callback/google/route"
import { GET as me } from "@/app/api/auth/me/route"
import { GET as signin } from "@/app/api/auth/signin/google/route"
import { POST as signout } from "@/app/api/auth/signout/route"
import { PATCH } from "@/app/api/reminders/[id]/route"
import { db } from "@/lib/db"
import { endpoints } from "@/lib/google"
import { LOCAL_SESSION_COOKIE } from "@/lib/session"
import { FAKE_PERSON, startFakeGoogle } from "../../scripts/fake-google.mjs"
import { context, OTHER_VISITOR, request, saveReminder, setUpTestDatabase, TEST_VISITOR, visitorCookie } from "./helpers"

setUpTestDatabase()

// Google here is scripts/fake-google.mjs, on the port FAKE_GOOGLE_ENV names (set by scripts/with-test-db.mjs).
let fake: Awaited<ReturnType<typeof startFakeGoogle>>
beforeAll(async () => {
  fake = await startFakeGoogle()
})
afterAll(() => new Promise<void>((resolve) => fake.server.close(() => resolve())))

const THIRD_VISITOR = "33333333-3333-4333-8333-333333333333"

// The name=value of each cookie a response sets.
const setCookies = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0])
const sessionFrom = (response: Response) => setCookies(response).find((cookie) => cookie.startsWith(`${LOCAL_SESSION_COOKIE}=`) && cookie.length > LOCAL_SESSION_COOKIE.length + 1)

// The whole trip, as a browser makes it: Ask sends it to Google, Google sends it back with a code, and Ask's
// callback finishes. `claims` changes what Google's ID token says; `tamper` changes the address Google sends back.
async function signInWithGoogle({ visitor = TEST_VISITOR, claims = {}, tamper }: { visitor?: string; claims?: object; tamper?: (back: URL) => void } = {}) {
  fake.claims = claims
  const start = await signin(request("GET", "/api/auth/signin/google", undefined, { cookie: visitorCookie(visitor) }))
  const toGoogle = new URL(start.headers.get("location")!)
  expect(toGoogle.searchParams.get("scope")).toBe("openid email profile")

  const fromGoogle = await fetch(toGoogle, { redirect: "manual" })
  const back = new URL(fromGoogle.headers.get("location")!)
  tamper?.(back)
  const cookie = [visitorCookie(visitor), ...setCookies(start)].join("; ")
  return callback(new Request(back, { headers: { cookie } }))
}

const ownerOf = async (id: string) => (await db.reminder.findUniqueOrThrow({ where: { id } })).userId

describe("signing in with Google", () => {
  test("moves this browser's guest reminders to the account, and the session then reaches them from any browser", async () => {
    const mine = await saveReminder({ title: "Call mum" })
    const theirs = await saveReminder({ title: "Their own", userId: OTHER_VISITOR })

    const done = await signInWithGoogle()
    expect(done.status).toBe(307)
    expect(new URL(done.headers.get("location")!).pathname + new URL(done.headers.get("location")!).search).toBe("/")
    const session = sessionFrom(done)
    expect(session).toBeDefined()

    const user = await db.user.findUniqueOrThrow({ where: { googleSub: FAKE_PERSON.sub } })
    expect(user).toMatchObject({ email: FAKE_PERSON.email, name: FAKE_PERSON.name })
    expect(await ownerOf(mine.id)).toBe(user.id)
    expect(await ownerOf(theirs.id)).toBe(OTHER_VISITOR)

    // Another browser, another visitor, but the same session: the reminder is reachable.
    const elsewhere = `${visitorCookie(THIRD_VISITOR)}; ${session}`
    const changed = await PATCH(request("PATCH", `/api/reminders/${mine.id}`, { title: "Call mum back" }, { cookie: elsewhere }), context(mine.id))
    expect(changed.status).toBe(200)
    // And the guest who signed in no longer reaches it without the session.
    const asGuest = await PATCH(request("PATCH", `/api/reminders/${mine.id}`, { title: "Nope" }), context(mine.id))
    expect(asGuest.status).toBe(404)

    const who = await me(request("GET", "/api/auth/me", undefined, { cookie: elsewhere }))
    expect(await who.json()).toEqual({ user: { name: FAKE_PERSON.name, email: FAKE_PERSON.email, picture: null } })
  })

  test("signing in again on another device adds that device's guest reminders to the same account", async () => {
    await signInWithGoogle()
    const phone = await saveReminder({ title: "From the phone", userId: OTHER_VISITOR })
    await signInWithGoogle({ visitor: OTHER_VISITOR })

    expect(await db.user.count()).toBe(1)
    const user = await db.user.findUniqueOrThrow({ where: { googleSub: FAKE_PERSON.sub } })
    expect(await ownerOf(phone.id)).toBe(user.id)
  })

  test("signing out ends the session: the cookie no longer reaches the account", async () => {
    const mine = await saveReminder()
    const session = sessionFrom(await signInWithGoogle())!
    const cookie = `${visitorCookie(TEST_VISITOR)}; ${session}`

    const out = await signout(request("POST", "/api/auth/signout", undefined, { cookie }))
    expect(out.status).toBe(204)
    expect(out.headers.getSetCookie().some((set) => set.startsWith(`${LOCAL_SESSION_COOKIE}=;`) && /Max-Age=0/i.test(set))).toBe(true)
    expect(await db.session.count()).toBe(0)

    expect(await (await me(request("GET", "/api/auth/me", undefined, { cookie }))).json()).toEqual({ user: null })
    expect((await PATCH(request("PATCH", `/api/reminders/${mine.id}`, { title: "x" }, { cookie }), context(mine.id))).status).toBe(404)
  })

  test("an expired session counts for nothing: the browser is its visitor again", async () => {
    const session = sessionFrom(await signInWithGoogle())!
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const who = await me(request("GET", "/api/auth/me", undefined, { cookie: session }))
    expect(await who.json()).toEqual({ user: null })
  })

  test("the sessions table keeps only a hash of the cookie's token", async () => {
    const session = sessionFrom(await signInWithGoogle())!
    const token = session.split("=")[1]
    const [stored] = await db.session.findMany()
    expect(stored.id).not.toContain(token)
    expect(stored.id).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("a sign-in that isn't right is refused, and nothing moves", () => {
  const refused = async (done: Response, mine: { id: string }) => {
    expect(done.status).toBe(307)
    expect(new URL(done.headers.get("location")!).search).toBe("?signin=failed")
    expect(sessionFrom(done)).toBeUndefined()
    expect(await db.user.count()).toBe(0)
    expect(await db.session.count()).toBe(0)
    expect(await ownerOf(mine.id)).toBe(TEST_VISITOR)
  }

  test("a state that doesn't match the one Ask set", async () => {
    const mine = await saveReminder()
    await refused(await signInWithGoogle({ tamper: (back) => back.searchParams.set("state", "someone-elses-state") }), mine)
  })

  test("a callback with no state cookie", async () => {
    const mine = await saveReminder()
    fake.claims = {}
    const start = await signin(request("GET", "/api/auth/signin/google"))
    const back = new URL((await fetch(start.headers.get("location")!, { redirect: "manual" })).headers.get("location")!)
    await refused(await callback(new Request(back, { headers: { cookie: visitorCookie(TEST_VISITOR) } })), mine)
  })

  test("a code Google doesn't know", async () => {
    const mine = await saveReminder()
    await refused(await signInWithGoogle({ tamper: (back) => back.searchParams.set("code", "made-up") }), mine)
  })

  test.each([
    ["an email Google hasn't verified", { email_verified: false }],
    ["a token for another app", { aud: "someone-elses-client-id" }],
    ["a token from someone other than Google", { iss: "https://accounts.example.com" }],
    ["a token that has expired", { exp: Math.floor(Date.now() / 1000) - 60 }],
  ])("%s", async (_, claims) => {
    const mine = await saveReminder()
    await refused(await signInWithGoogle({ claims }), mine)
  })
})

test("the API tests can't reach the real Google: its endpoints are refused before any request", () => {
  const was = process.env.GOOGLE_TOKEN_URL
  try {
    process.env.GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
    expect(() => endpoints()).toThrow(/fake Google/)
    delete process.env.GOOGLE_TOKEN_URL
    expect(() => endpoints()).toThrow(/fake Google/)
  } finally {
    process.env.GOOGLE_TOKEN_URL = was
  }
})
