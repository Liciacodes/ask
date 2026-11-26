import { check } from "@/lib/api"
import { remindersDue } from "@/lib/reminder-store"
import { toJson, weekQuery } from "@/lib/reminders"
import { weekRange } from "@/lib/time"
import { ownerFrom } from "@/lib/session"
import { noVisitor } from "@/lib/visitor"

export async function GET(request: Request) {
  const owner = await ownerFrom(request)
  if (!owner) return noVisitor()

  const query = check(weekQuery, { timezone: new URL(request.url).searchParams.get("timezone") ?? undefined })
  if (!query.ok) return query.response

  const { timezone } = query.data
  const { from, to } = weekRange(new Date(), timezone)
  const reminders = await remindersDue(owner, from, to)
  return Response.json({
    timezone,
    from: from.toISOString(),
    to: to.toISOString(),
    reminders: reminders.map(toJson),
  })
}
