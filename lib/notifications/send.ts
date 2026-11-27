import { generateRequestDetails } from "web-push"
import { db } from "@/lib/db"
import type { PushSubscription } from "@/lib/generated/prisma/client"
import { OWNER } from "@/lib/site"
import { inVitest, vapidKeys } from "./config"
import { isPushEndpoint } from "./subscriptions"

// Sends a due reminder's notification, at most once.
//
// The claim and the send can't be one step, so a crash between them must give one way, and Ask never sends twice:
//   1. The claim marks the reminder failed ("Not sent") in one UPDATE, only while it's pending, due at the time the
//      message was scheduled for, and its owner has a subscription. Only one delivery of a message can win it.
//   2. The pushes go out.
//   3. If a push service accepted one, the reminder becomes sent ("Sent").
// A crash after 1 leaves it "Not sent": QStash retries, finds it no longer pending, and sends nothing. A failed push
// isn't retried either: the push service may have taken it before the error.

// A reminder an hour late is no use, so a phone offline longer never shows it, and high urgency wakes it on time.
const TTL_SECONDS = 3600
const SEND_TIMEOUT_MS = 10_000

type Delivery = "accepted" | "gone" | "failed"
type Outcome = "sent" | "not sent" | "skipped"

// Raised before anything is claimed, so the route answers 503 and QStash tries again later.
class NotReady extends Error {}

// Where a push may go: a real push service, and inside Vitest only the fake one.
function assertSendable(endpoint: string) {
  if (!isPushEndpoint(endpoint)) throw new Error(`Not a push service endpoint: ${endpoint}`)
  if (inVitest() && new URL(endpoint).hostname !== "127.0.0.1") {
    throw new Error("Tests never reach real push services: use the fake on 127.0.0.1")
  }
}

async function deliver(subscription: PushSubscription, payload: string, keys: { publicKey: string; privateKey: string }): Promise<Delivery> {
  assertSendable(subscription.endpoint)
  const request = generateRequestDetails(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    payload,
    { vapidDetails: { subject: `mailto:${OWNER.email}`, ...keys }, TTL: TTL_SECONDS, urgency: "high" }
  )
  try {
    // web-push builds and encrypts the request; Ask sends it, and never follows a redirect elsewhere.
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body ? new Uint8Array(request.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (response.ok) return "accepted"
    // The browser unsubscribed, or the subscription expired: it will never take another push.
    if (response.status === 404 || response.status === 410) return "gone"
    return "failed"
  } catch {
    return "failed"
  }
}

type Claimed = { id: string; userId: string; title: string; dueAt: Date; timezone: string }

async function notifyDue({ id, dueAt }: { id: string; dueAt: Date }): Promise<Outcome> {
  const keys = vapidKeys()
  if (!keys) throw new NotReady("VAPID keys aren't set")

  const [claimed] = await db.$queryRaw<Claimed[]>`
    UPDATE reminders r SET status = 'failed'
    WHERE r.id = ${id}::uuid
      AND r.status = 'pending'
      AND r.due_at = ${dueAt}
      AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.owner_id = r.user_id)
    RETURNING r.id, r.user_id AS "userId", r.title, r.due_at AS "dueAt", r.timezone`
  // Deleted, cancelled, already notified, moved since, or no subscription: nothing to send.
  if (!claimed) return "skipped"

  // Claimed: from here on nothing throws, so QStash never retries a message that may have sent something.
  try {
    const subscriptions = await db.pushSubscription.findMany({ where: { ownerId: claimed.userId } })
    // The service worker shows the title, and the time in the browser's own language and the reminder's zone.
    const payload = JSON.stringify({ id: claimed.id, title: claimed.title, due_at: claimed.dueAt.toISOString(), timezone: claimed.timezone })
    const results = await Promise.all(
      subscriptions.map((subscription) =>
        deliver(subscription, payload, keys).catch((error: unknown) => {
          console.error(`Push to subscription ${subscription.id} refused:`, error)
          return "failed" as const
        })
      )
    )
    const gone = subscriptions.filter((_, i) => results[i] === "gone").map((subscription) => subscription.id)
    if (gone.length > 0) await db.pushSubscription.deleteMany({ where: { id: { in: gone } } })
    if (!results.includes("accepted")) return "not sent"
    await db.reminder.updateMany({ where: { id: claimed.id, status: "failed" }, data: { status: "sent", sentAt: new Date() } })
    return "sent"
  } catch (error) {
    console.error(`Reminder ${claimed.id} was claimed, but its notification failed:`, error)
    return "not sent"
  }
}

export { assertSendable, NotReady, notifyDue, TTL_SECONDS }
