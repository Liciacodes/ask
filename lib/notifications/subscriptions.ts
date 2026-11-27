import { z } from "zod"
import { db } from "@/lib/db"
import { faking } from "./config"

// The push services browsers subscribe with. Ask only ever stores, and only ever POSTs to, an endpoint on one of
// these, so a visitor can't make the server send requests to an address of their choosing.
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com"])
// Mozilla, Apple and Windows (WNS) push services, under their own domains.
const PUSH_DOMAINS = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"]

function isPushEndpoint(endpoint: string) {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  // "https://fcm.googleapis.com@evil.example" is a request to evil.example: no user info at all.
  if (url.username || url.password) return false
  // The test fakes' push service (scripts/fake-notify.mjs), and only under them.
  if (faking() && url.protocol === "http:" && url.hostname === "127.0.0.1") return true
  if (url.protocol !== "https:" || url.port !== "") return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.has(host) || PUSH_DOMAINS.some((domain) => host.endsWith(domain))
}

const base64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/, "Use base64url")

// A browser's PushSubscription, as its toJSON() gives it.
const pushSubscription = z.object({
  endpoint: z.string().max(2048).refine(isPushEndpoint, "Use an endpoint from a browser's push service"),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: base64url.max(200), auth: base64url.max(100) }),
})

const subscriptionEndpoint = z.object({ endpoint: z.string().max(2048) })

type PushSubscriptionJson = z.output<typeof pushSubscription>

// One row per browser: subscribing again, even under another owner, updates the same row.
function saveSubscription(ownerId: string, { endpoint, keys }: PushSubscriptionJson) {
  return db.pushSubscription.upsert({
    where: { endpoint },
    create: { ownerId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { ownerId, p256dh: keys.p256dh, auth: keys.auth },
  })
}

// Only the owner's own: nobody can turn off someone else's reminders.
async function deleteSubscription(ownerId: string, endpoint: string) {
  const { count } = await db.pushSubscription.deleteMany({ where: { ownerId, endpoint } })
  return count > 0
}

export { deleteSubscription, isPushEndpoint, pushSubscription, saveSubscription, subscriptionEndpoint, type PushSubscriptionJson }
