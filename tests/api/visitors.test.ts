import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { NextRequest } from "next/server"
import { describe, expect, test } from "vitest"
import { POST as ask } from "@/app/api/agent/route"
import { DELETE, PATCH } from "@/app/api/reminders/[id]/route"
import { POST as create } from "@/app/api/reminders/route"
import { GET as week } from "@/app/api/week/route"
import { db } from "@/lib/db"
import { weekRange } from "@/lib/time"
import { isVisitorId, LOCAL_COOKIE, MAX_AGE, SECURE_COOKIE } from "@/lib/visitor"
import { config, proxy } from "@/proxy"
import { context, nextYear, OTHER_VISITOR, request, saveReminder, setUpTestDatabase, TEST_VISITOR, visitorCookie } from "./helpers"

setUpTestDatabase()

const SITE = "https://ask-felicia.vercel.app"
const LAGOS = "Africa/Lagos"
const visit = (url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) => proxy(new NextRequest(url, init))
// Next hands the proxy's changes to the request on in this header.
const forwardedCookies = (response: Response) => response.headers.get("x-middleware-request-cookie")

describe("the visitor cookie", () => {
  test("a first visit gets a random id that page scripts can't read, sent only over HTTPS and only to this site", () => {
    const cookie = visit(`${SITE}/api/week`).cookies.get(SECURE_COOKIE)

    expect(isVisitorId(cookie?.value)).toBe(true)
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE })
    expect(cookie?.domain).toBeUndefined()
  })

  test("every first visit gets its own id, and the first request already carries it", () => {
    const first = visit(`${SITE}/api/week`)
    const second = visit(`${SITE}/api/week`)

    const id = first.cookies.get(SECURE_COOKIE)?.value
    expect(id).not.toBe(second.cookies.get(SECURE_COOKIE)?.value)
    expect(forwardedCookies(first)).toBe(`${SECURE_COOKIE}=${id}`)
  })

  test("a returning visitor keeps their id, its 400 days start again, and their other cookies are left alone", () => {
    const response = visit(`${SITE}/api/week`, { headers: { cookie: `theme=dark; ${SECURE_COOKIE}=${TEST_VISITOR}` } })

    expect(response.cookies.get(SECURE_COOKIE)).toMatchObject({ value: TEST_VISITOR, maxAge: MAX_AGE })
    expect(forwardedCookies(response)).toBe(`theme=dark; ${SECURE_COOKIE}=${TEST_VISITOR}`)
  })

  test("an id Ask didn't make is replaced, so the request never carries it", () => {
    const response = visit(`${SITE}/api/week`, { headers: { cookie: `${SECURE_COOKIE}=local-user` } })

    const id = response.cookies.get(SECURE_COOKIE)?.value
    expect(isVisitorId(id)).toBe(true)
    expect(forwardedCookies(response)).toBe(`${SECURE_COOKIE}=${id}`)
  })

  test.each(["POST", "PATCH", "DELETE"])("a %s without an id gets none, so the route turns it down", (method) => {
    const response = visit(`${SITE}/api/reminders`, { method })

    expect(response.headers.get("set-cookie")).toBeNull()
    expect(forwardedCookies(response)).toBeNull()
  })

  test.each(["GET", "POST"])("a %s's answer tells every cache not to keep it, so no one is handed someone else's", (method) => {
    expect(visit(`${SITE}/api/week`, { method }).headers.get("cache-control")).toBe("private, no-store")
  })

  test("on plain-http localhost the cookie can't be Secure, so it drops that and the __Host- prefix", () => {
    const response = visit("http://localhost:3000/api/week")

    expect(response.cookies.get(SECURE_COOKIE)).toBeUndefined()
    expect(response.cookies.get(LOCAL_COOKIE)).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax" })
  })

  test("it runs on the API only, so the page itself stays static, cacheable and cookie-free", () => {
    for (const url of ["/api/week", "/api/agent", "/api/reminders/abc"]) expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
    for (const url of ["/", "/_next/static/chunks/main.js", "/favicon.ico"]) expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
  })
})

describe("each visitor's reminders are their own", () => {
  const thisWeek = (hours: number) => new Date(weekRange(new Date(), LAGOS).from.getTime() + hours * 3_600_000)
  const weekOf = async (visitor: string) => {
    const response = await week(request("GET", `/api/week?timezone=${LAGOS}`, undefined, { cookie: visitorCookie(visitor) }))
    return ((await response.json()) as { reminders: { title: string }[] }).reminders.map((reminder) => reminder.title)
  }

  test("each visitor's week shows only their own reminders", async () => {
    await saveReminder({ title: "Mine", dueAt: thisWeek(3) })
    await saveReminder({ title: "Theirs", dueAt: thisWeek(4), userId: OTHER_VISITOR })

    expect(await weekOf(TEST_VISITOR)).toEqual(["Mine"])
    expect(await weekOf(OTHER_VISITOR)).toEqual(["Theirs"])
  })

  test("a new reminder belongs to the visitor who made it", async () => {
    const body = { title: "Theirs", due_at: `${nextYear}-03-10T08:00:00Z`, timezone: LAGOS }

    expect((await create(request("POST", "/api/reminders", body, { cookie: visitorCookie(OTHER_VISITOR) }))).status).toBe(201)

    expect(await db.reminder.findFirstOrThrow()).toMatchObject({ title: "Theirs", userId: OTHER_VISITOR })
  })

  test("someone else's reminder can't be changed or deleted: for you it doesn't exist", async () => {
    const theirs = await saveReminder({ title: "Theirs", userId: OTHER_VISITOR })

    expect((await PATCH(request("PATCH", `/api/reminders/${theirs.id}`, { title: "Mine now" }), context(theirs.id))).status).toBe(404)
    expect((await DELETE(request("DELETE", `/api/reminders/${theirs.id}`), context(theirs.id))).status).toBe(404)

    expect(await db.reminder.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs)
  })

  test("the HTTPS cookie's name is read too", async () => {
    await saveReminder({ title: "Mine", dueAt: thisWeek(3) })

    const response = await week(request("GET", `/api/week?timezone=${LAGOS}`, undefined, { cookie: `${SECURE_COOKIE}=${TEST_VISITOR}` }))

    expect(((await response.json()) as { reminders: unknown[] }).reminders).toHaveLength(1)
  })

  const routes = (cookie: string | null) => {
    const id = "6f1c2a52-3c1e-4d8a-9b0e-1a2b3c4d5e6f"
    return [
      ["the week", () => week(request("GET", `/api/week?timezone=${LAGOS}`, undefined, { cookie }))],
      ["creating", () => create(request("POST", "/api/reminders", { title: "Hi", due_at: `${nextYear}-03-10T08:00:00Z`, timezone: LAGOS }, { cookie }))],
      ["changing", () => PATCH(request("PATCH", `/api/reminders/${id}`, { title: "Hi" }, { cookie }), context(id))],
      ["deleting", () => DELETE(request("DELETE", `/api/reminders/${id}`, undefined, { cookie }), context(id))],
      ["asking", () => ask(request("POST", "/api/agent", { messages: [], timezone: LAGOS }, { cookie }))],
    ] as const
  }

  test.each([
    ["no visitor cookie", null],
    ["an id Ask didn't make", `${LOCAL_COOKIE}=local-user`],
  ])("with %s, every route refuses and nothing is saved", async (_case, cookie) => {
    for (const [route, call] of routes(cookie)) {
      const response = await call()
      expect(response.status, route).toBe(401)
      expect(await response.json(), route).toEqual({ error: "Ask couldn't tell this browser apart. Reload the page to continue." })
    }
    expect(await db.reminder.count()).toBe(0)
  })
})
