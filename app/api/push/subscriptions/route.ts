import { checkBody } from "@/lib/api"
import { scheduleOwnerWeek } from "@/lib/notifications/schedule"
import { deleteSubscription, pushSubscription, saveSubscription, subscriptionEndpoint } from "@/lib/notifications/subscriptions"
import { ownerFrom } from "@/lib/session"
import { noVisitor } from "@/lib/visitor"

// "Turn on reminders": saves this browser's push subscription for its owner, the visitor or the account, and
// schedules their reminders for the next 7 days at once. Only an endpoint on a real push service is accepted.
export async function POST(request: Request) {
  const owner = await ownerFrom(request)
  if (!owner) return noVisitor()

  const body = await checkBody(request, pushSubscription)
  if (!body.ok) return body.response

  await saveSubscription(owner, body.data)
  await scheduleOwnerWeek(owner).catch((error: unknown) => console.warn("Couldn't schedule after turning reminders on:", error))
  return new Response(null, { status: 201 })
}

// "Turn off reminders": removes this browser's subscription, if it's the owner's.
export async function DELETE(request: Request) {
  const owner = await ownerFrom(request)
  if (!owner) return noVisitor()

  const body = await checkBody(request, subscriptionEndpoint)
  if (!body.ok) return body.response

  await deleteSubscription(owner, body.data.endpoint)
  return new Response(null, { status: 204 })
}
