import { createECDH, randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { GET as cron } from "@/app/api/cron/schedule-notifications/route"
import { POST as notify } from "@/app/api/notify/route"
import { DELETE as unsubscribe, POST as subscribe } from "@/app/api/push/subscriptions/route"
import { PATCH } from "@/app/api/reminders/[id]/route"
import { POST } from "@/app/api/reminders/route"
import { POST as signout } from "@/app/api/auth/signout/route"
import { db } from "@/lib/db"
import { TTL_SECONDS } from "@/lib/notifications/send"
import { LOCAL_SESSION_COOKIE, signIn } from "@/lib/session"
import { fakePushEndpoint, signLikeQStash, startFakePush, startFakeQStash } from "../../scripts/fake-notify.mjs"
import { context, OTHER_VISITOR, request, saveReminder, setUpTestDatabase, TEST_VISITOR, visitorCookie } from "./helpers"

// Notifications against the fakes in scripts/fake-notify.mjs: a QStash and a push service on 127.0.0.1, with the
// real QStash SDK and the real web-push encryption in between. Nothing reaches Upstash or a real push service.

setUpTestDatabase()

let qstash: Awaited<ReturnType<typeof startFakeQStash>>
let push: Awaited<ReturnType<typeof startFakePush>>
beforeAll(async () => {
  qstash = await startFakeQStash()
  push = await startFakePush()
})
afterAll(async () => {
  await qstash.close()
  await push.close()
})
beforeEach(() => {
  qstash.state.published.length = 0
  qstash.state.down = false
  push.state.received.length = 0
  push.state.answers.clear()
})

const NOTIFY_URL = `${process.env.ASK_SITE_URL}/api/notify`
const HOUR = 3_600_000
const DAY = 24 * HOUR
const fromNow = (ms: number) => new Date(Date.now() + ms)

// A browser's subscription as its toJSON() gives it: a P-256 public key and an auth secret, at the fake push service.
function browserSubscription(name: string) {
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  return { endpoint: fakePushEndpoint(name), expirationTime: null, keys: { p256dh: ecdh.getPublicKey("base64url"), auth: randomBytes(16).toString("base64url") } }
}

async function subscribed(owner: string, name: string) {
  const { endpoint, keys } = browserSubscription(name)
  return db.pushSubscription.create({ data: { ownerId: owner, endpoint, p256dh: keys.p256dh, auth: keys.auth } })
}

// QStash's call at a reminder's time, signed as QStash signs it unless the test says otherwise.
function qstashCall(body: string, signature: string | null = signLikeQStash(body, NOTIFY_URL)) {
  return new Request(NOTIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature !== null && { "upstash-signature": signature }) },
    body,
  })
}
const messageFor = (reminder: { id: string; dueAt: Date }) => JSON.stringify({ id: reminder.id, due_at: reminder.dueAt.toISOString() })
const statusOf = async (id: string) => (await db.reminder.findUniqueOrThrow({ where: { id } })).status
const publishedIds = () => qstash.state.published.map((message) => message.body.id)

describe("POST /api/notify, which QStash calls at a reminder's time", () => {
  test("an unsigned request gets 401, and nothing is claimed or sent", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    const response = await notify(qstashCall(messageFor(reminder), null))

    expect(response.status).toBe(401)
    expect(await statusOf(reminder.id)).toBe("pending")
    expect(push.state.received).toEqual([])
  })

  test("a wrong key, another URL, a changed body or an expired signature gets 401 too", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })
    const body = messageFor(reminder)

    const forged = [
      signLikeQStash(body, NOTIFY_URL, "sig_someone_elses_key"),
      signLikeQStash(body, "http://ask.test/api/other"),
      signLikeQStash(JSON.stringify({ id: reminder.id, due_at: fromNow(2 * HOUR).toISOString() }), NOTIFY_URL),
      signLikeQStash(body, NOTIFY_URL, undefined, { expiresIn: -60 }),
      "not-a-token",
    ]
    for (const signature of forged) expect((await notify(qstashCall(body, signature))).status).toBe(401)
    expect(await statusOf(reminder.id)).toBe("pending")
    expect(push.state.received).toEqual([])
  })

  test("a due reminder goes to each of the owner's browsers, encrypted, with a 1-hour TTL and high urgency, and is Sent", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    await subscribed(TEST_VISITOR, "phone")
    await subscribed(OTHER_VISITOR, "someone-else")
    const reminder = await saveReminder({ title: "Call Dad", dueAt: fromNow(HOUR) })

    const response = await notify(qstashCall(messageFor(reminder)))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ outcome: "sent" })
    expect(push.state.received.map((sent) => sent.name).sort()).toEqual(["laptop", "phone"])
    for (const sent of push.state.received) {
      expect(sent).toMatchObject({ ttl: String(TTL_SECONDS), urgency: "high", encoding: "aes128gcm" })
      expect(sent.authorization).toMatch(/^vapid t=.+, k=.+/)
      expect(sent.bytes).toBeGreaterThan(0)
    }
    expect(TTL_SECONDS).toBe(3600)
    const saved = await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })
    expect(saved.status).toBe("sent")
    expect(saved.sentAt).not.toBeNull()
  })

  test("the same message twice sends once", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    const first = await notify(qstashCall(messageFor(reminder)))
    const second = await notify(qstashCall(messageFor(reminder)))

    expect(await first.json()).toEqual({ outcome: "sent" })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ outcome: "skipped" })
    expect(push.state.received).toHaveLength(1)
  })

  test("two deliveries of the same message at once send once", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    const outcomes = await Promise.all([1, 2, 3].map(async () => (await (await notify(qstashCall(messageFor(reminder)))).json()).outcome))

    expect(outcomes.sort()).toEqual(["sent", "skipped", "skipped"])
    expect(push.state.received).toHaveLength(1)
  })

  test("a reminder moved since the message was sent gets nothing from it, and stays pending", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })
    await db.reminder.update({ where: { id: reminder.id }, data: { dueAt: fromNow(3 * HOUR) } })

    const response = await notify(qstashCall(messageFor(reminder)))

    expect(await response.json()).toEqual({ outcome: "skipped" })
    expect(push.state.received).toEqual([])
    expect(await statusOf(reminder.id)).toBe("pending")
  })

  test("a deleted or cancelled reminder sends nothing", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const deleted = await saveReminder({ dueAt: fromNow(HOUR) })
    await db.reminder.delete({ where: { id: deleted.id } })
    const cancelled = await saveReminder({ dueAt: fromNow(HOUR), status: "cancelled" })

    for (const reminder of [deleted, cancelled]) {
      const response = await notify(qstashCall(messageFor(reminder)))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ outcome: "skipped" })
    }
    expect(push.state.received).toEqual([])
    expect(await statusOf(cancelled.id)).toBe("cancelled")
  })

  test("a subscription the push service says is gone is removed, and the others are kept", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    await subscribed(TEST_VISITOR, "old-phone")
    push.state.answers.set("old-phone", 410)
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    await notify(qstashCall(messageFor(reminder)))

    const left = await db.pushSubscription.findMany({ where: { ownerId: TEST_VISITOR } })
    expect(left.map((subscription) => subscription.endpoint)).toEqual([fakePushEndpoint("laptop")])
    expect(await statusOf(reminder.id)).toBe("sent")
  })

  test("when no push service takes it, the reminder is Not sent; a 404 is gone too", async () => {
    await subscribed(TEST_VISITOR, "broken")
    await subscribed(TEST_VISITOR, "expired")
    push.state.answers.set("broken", 500)
    push.state.answers.set("expired", 404)
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    const response = await notify(qstashCall(messageFor(reminder)))

    expect(await response.json()).toEqual({ outcome: "not sent" })
    expect(await statusOf(reminder.id)).toBe("failed")
    expect((await db.pushSubscription.findMany()).map((subscription) => subscription.endpoint)).toEqual([fakePushEndpoint("broken")])
  })

  test("an owner with no subscription gets nothing, and the reminder is left as it was", async () => {
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    const response = await notify(qstashCall(messageFor(reminder)))

    expect(await response.json()).toEqual({ outcome: "skipped" })
    expect(await statusOf(reminder.id)).toBe("pending")
  })

  test("a reminder claimed by a run that died before sending is not sent on QStash's retry", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    // What a crash right after the claim leaves behind: claimed, marked Not sent, nothing sent.
    const reminder = await saveReminder({ dueAt: fromNow(HOUR), status: "failed" })

    const retry = await notify(qstashCall(messageFor(reminder)))

    expect(await retry.json()).toEqual({ outcome: "skipped" })
    expect(push.state.received).toEqual([])
    expect(await statusOf(reminder.id)).toBe("failed")
  })

  test("a stored endpoint that isn't a push service is never posted to", async () => {
    for (const endpoint of ["https://evil.example/push", "https://fcm.googleapis.com/fcm/send/real-browser"]) {
      await db.pushSubscription.create({ data: { ownerId: TEST_VISITOR, endpoint, p256dh: browserSubscription("x").keys.p256dh, auth: "AAAAAAAAAAAAAAAAAAAAAA" } })
    }
    const reminder = await saveReminder({ dueAt: fromNow(HOUR) })

    const response = await notify(qstashCall(messageFor(reminder)))

    // evil.example isn't a push service, and even FCM is refused inside the tests: nothing went anywhere.
    expect(await response.json()).toEqual({ outcome: "not sent" })
    expect(push.state.received).toEqual([])
  })

  test("a signed body that isn't a reminder message gets 400", async () => {
    const body = JSON.stringify({ id: "not-a-uuid" })
    expect((await notify(qstashCall(body))).status).toBe(400)
  })
})

describe("scheduling a reminder's message", () => {
  const due = () => fromNow(2 * DAY)

  test("a reminder saved within 7 days by an owner with a subscription gets one message, at its time", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const dueAt = due()

    const response = await POST(request("POST", "/api/reminders", { title: "Dentist", due_at: dueAt.toISOString(), timezone: "Africa/Lagos" }))
    const { id } = await response.json()

    expect(response.status).toBe(201)
    expect(qstash.state.published).toEqual([
      {
        url: NOTIFY_URL,
        notBefore: Math.floor(dueAt.getTime() / 1000),
        deduplicationId: `${id}-${dueAt.getTime()}`,
        token: "Bearer fake-qstash-token",
        body: { id, due_at: dueAt.toISOString() },
      },
    ])
    expect((await db.reminder.findUniqueOrThrow({ where: { id } })).notifyScheduledFor).toEqual(dueAt)
  })

  test("an owner who never turned reminders on gets no message", async () => {
    const response = await POST(request("POST", "/api/reminders", { title: "Dentist", due_at: due().toISOString(), timezone: "Africa/Lagos" }))

    expect(response.status).toBe(201)
    expect(qstash.state.published).toEqual([])
  })

  test("a reminder more than 7 days away waits for the daily cron", async () => {
    await subscribed(TEST_VISITOR, "laptop")

    await POST(request("POST", "/api/reminders", { title: "Dentist", due_at: fromNow(8 * DAY).toISOString(), timezone: "Africa/Lagos" }))

    expect(qstash.state.published).toEqual([])
  })

  test("moving a reminder gets a message for its new time; changing only its title doesn't", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const created = await (await POST(request("POST", "/api/reminders", { title: "Dentist", due_at: due().toISOString(), timezone: "Africa/Lagos" }))).json()
    const later = fromNow(3 * DAY)

    await PATCH(request("PATCH", `/api/reminders/${created.id}`, { title: "Dentist at 10" }), context(created.id))
    expect(qstash.state.published).toHaveLength(1)
    await PATCH(request("PATCH", `/api/reminders/${created.id}`, { due_at: later.toISOString() }), context(created.id))

    expect(qstash.state.published).toHaveLength(2)
    expect(qstash.state.published[1].body).toEqual({ id: created.id, due_at: later.toISOString() })
  })

  test("cancelling and bringing back at the same time keeps the message it already has", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const created = await (await POST(request("POST", "/api/reminders", { title: "Dentist", due_at: due().toISOString(), timezone: "Africa/Lagos" }))).json()

    await PATCH(request("PATCH", `/api/reminders/${created.id}`, { status: "cancelled" }), context(created.id))
    await PATCH(request("PATCH", `/api/reminders/${created.id}`, { status: "pending" }), context(created.id))

    expect(qstash.state.published).toHaveLength(1)
  })

  test("with QStash down the reminder still saves, and the cron schedules it later", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    qstash.state.down = true

    const response = await POST(request("POST", "/api/reminders", { title: "Dentist", due_at: due().toISOString(), timezone: "Africa/Lagos" }))
    const { id } = await response.json()

    expect(response.status).toBe(201)
    expect((await db.reminder.findUniqueOrThrow({ where: { id } })).notifyScheduledFor).toBeNull()
    qstash.state.down = false
    await cron(new Request("http://ask.test/api/cron/schedule-notifications", { headers: { authorization: "Bearer fake-cron-secret" } }))
    expect(publishedIds()).toEqual([id])
  })

  test.each(["sent", "failed"] as const)("a %s reminder moved to a future time is pending again, and gets a message", async (status) => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(-HOUR), status, sentAt: status === "sent" ? fromNow(-HOUR) : null })
    const later = due()

    const response = await PATCH(request("PATCH", `/api/reminders/${reminder.id}`, { due_at: later.toISOString() }), context(reminder.id))

    expect(response.status).toBe(200)
    const saved = await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })
    expect(saved).toMatchObject({ status: "pending", sentAt: null, dueAt: later, notifyScheduledFor: later })
    expect(qstash.state.published.map((message) => message.body)).toEqual([{ id: reminder.id, due_at: later.toISOString() }])
  })

  test("a sent reminder moved to a time already past is turned down and stays Sent", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const reminder = await saveReminder({ dueAt: fromNow(-2 * HOUR), status: "sent", sentAt: fromNow(-2 * HOUR) })

    const response = await PATCH(request("PATCH", `/api/reminders/${reminder.id}`, { due_at: fromNow(-HOUR).toISOString() }), context(reminder.id))

    expect(response.status).toBe(400)
    expect(await statusOf(reminder.id)).toBe("sent")
    expect(qstash.state.published).toEqual([])
  })
})

describe("turning reminders on and off", () => {
  test("turning them on schedules the owner's pending reminders for the next 7 days, at once", async () => {
    const soon = await saveReminder({ title: "Soon", dueAt: fromNow(2 * DAY) })
    await saveReminder({ title: "Far", dueAt: fromNow(8 * DAY) })
    await saveReminder({ title: "Cancelled", dueAt: fromNow(2 * DAY), status: "cancelled" })
    await saveReminder({ title: "Someone else's", userId: OTHER_VISITOR, dueAt: fromNow(2 * DAY) })

    const response = await subscribe(request("POST", "/api/push/subscriptions", browserSubscription("laptop")))

    expect(response.status).toBe(201)
    expect(publishedIds()).toEqual([soon.id])
    expect(await db.pushSubscription.count({ where: { ownerId: TEST_VISITOR } })).toBe(1)
  })

  test("the same browser subscribing again is one subscription", async () => {
    const subscription = browserSubscription("laptop")

    await subscribe(request("POST", "/api/push/subscriptions", subscription))
    await subscribe(request("POST", "/api/push/subscriptions", subscription))

    expect(await db.pushSubscription.count()).toBe(1)
  })

  test("only an endpoint on a push service is saved", async () => {
    for (const endpoint of ["https://evil.example/push", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com@evil.example/x", "http://fcm.googleapis.com/x"]) {
      const response = await subscribe(request("POST", "/api/push/subscriptions", { ...browserSubscription("x"), endpoint }))
      expect(response.status).toBe(400)
    }
    expect(await db.pushSubscription.count()).toBe(0)
  })

  test("turning them off removes only your own subscription", async () => {
    const mine = browserSubscription("mine")
    await subscribe(request("POST", "/api/push/subscriptions", mine))

    const notMine = await unsubscribe(request("DELETE", "/api/push/subscriptions", { endpoint: mine.endpoint }, { cookie: visitorCookie(OTHER_VISITOR) }))
    expect(notMine.status).toBe(204)
    expect(await db.pushSubscription.count()).toBe(1)

    await unsubscribe(request("DELETE", "/api/push/subscriptions", { endpoint: mine.endpoint }))
    expect(await db.pushSubscription.count()).toBe(0)
  })

  test("without a visitor id, nothing is saved", async () => {
    const response = await subscribe(request("POST", "/api/push/subscriptions", browserSubscription("laptop"), { cookie: null }))
    expect(response.status).toBe(401)
  })

  test("signing in moves the guest's reminders and subscriptions to the account; signing out removes this browser's", async () => {
    const reminder = await saveReminder({ dueAt: fromNow(2 * DAY) })
    const subscription = browserSubscription("laptop")
    await subscribe(request("POST", "/api/push/subscriptions", subscription))

    const token = await signIn({ sub: "google-ada", email: "ada@example.com", name: "Ada", picture: null }, TEST_VISITOR)
    const user = await db.user.findUniqueOrThrow({ where: { googleSub: "google-ada" } })
    expect((await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).userId).toBe(user.id)
    expect(await db.pushSubscription.findMany({ select: { ownerId: true } })).toEqual([{ ownerId: user.id }])

    const cookie = `${visitorCookie(TEST_VISITOR)}; ${LOCAL_SESSION_COOKIE}=${token}`
    const response = await signout(request("POST", "/api/auth/signout", { endpoint: subscription.endpoint }, { cookie }))
    expect(response.status).toBe(204)
    expect(await db.pushSubscription.count()).toBe(0)
  })
})

describe("the daily cron", () => {
  const cronCall = (authorization?: string) =>
    new Request("http://ask.test/api/cron/schedule-notifications", { headers: authorization ? { authorization } : {} })

  test("anything but Vercel's call with CRON_SECRET gets 401", async () => {
    expect((await cron(cronCall())).status).toBe(401)
    expect((await cron(cronCall("Bearer wrong"))).status).toBe(401)
    expect((await cron(cronCall("fake-cron-secret"))).status).toBe(401)
  })

  test("it schedules pending reminders coming within 7 days, without a message, of owners with a subscription", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    const picked = [
      await saveReminder({ title: "New", dueAt: fromNow(2 * DAY) }),
      await saveReminder({ title: "Just inside 7 days", dueAt: fromNow(7 * DAY - HOUR) }),
      // Scheduled once, then moved: its old message no longer matches.
      await saveReminder({ title: "Moved", dueAt: fromNow(3 * DAY), notifyScheduledFor: fromNow(DAY) }),
    ]
    const scheduledAt = fromNow(4 * DAY)
    await saveReminder({ title: "Already scheduled", dueAt: scheduledAt, notifyScheduledFor: scheduledAt })
    await saveReminder({ title: "Just past 7 days", dueAt: fromNow(7 * DAY + HOUR) })
    await saveReminder({ title: "Past", dueAt: fromNow(-HOUR) })
    for (const status of ["cancelled", "sent", "failed"] as const) await saveReminder({ title: status, dueAt: fromNow(2 * DAY), status })
    await saveReminder({ title: "No subscription", userId: OTHER_VISITOR, dueAt: fromNow(2 * DAY) })

    const response = await cron(cronCall("Bearer fake-cron-secret"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ scheduled: 3, failed: 0 })
    expect(publishedIds().sort()).toEqual(picked.map((reminder) => reminder.id).sort())
  })

  test("a second run the same day publishes nothing new", async () => {
    await subscribed(TEST_VISITOR, "laptop")
    await saveReminder({ dueAt: fromNow(2 * DAY) })

    await cron(cronCall("Bearer fake-cron-secret"))
    await cron(cronCall("Bearer fake-cron-secret"))

    expect(qstash.state.published).toHaveLength(1)
  })
})
