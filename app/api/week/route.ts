import { check } from "@/lib/api"
import { remindersDue } from "@/lib/reminder-store"
import { toJson, weekQuery } from "@/lib/reminders"
import { weekRange } from "@/lib/time"
import { noVisitor, visitorFrom } from "@/lib/visitor"

export async function GET(request: Request) {
  const visitor = visitorFrom(request)
  if (!visitor) return noVisitor()

  const query = check(weekQuery, { timezone: new URL(request.url).searchParams.get("timezone") ?? undefined })
  if (!query.ok) return query.response

  const { timezone } = query.data
  const { from, to } = weekRange(new Date(), timezone)
  const reminders = await remindersDue(visitor, from, to)
  return Response.json({
    timezone,
    from: from.toISOString(),
    to: to.toISOString(),
    reminders: reminders.map(toJson),
  })
}
