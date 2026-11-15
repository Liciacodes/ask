import { check } from "@/lib/api"
import { db } from "@/lib/db"
import { toJson, weekQuery } from "@/lib/reminders"
import { weekRange } from "@/lib/time"
import { currentUserId } from "@/lib/user"

export async function GET(request: Request) {
  const query = check(weekQuery, { timezone: new URL(request.url).searchParams.get("timezone") ?? undefined })
  if (!query.ok) return query.response

  const { timezone } = query.data
  const { from, to } = weekRange(new Date(), timezone)
  const reminders = await db.reminder.findMany({
    where: { userId: await currentUserId(), status: { not: "cancelled" }, dueAt: { gte: from, lt: to } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  })
  return Response.json({
    timezone,
    from: from.toISOString(),
    to: to.toISOString(),
    reminders: reminders.map(toJson),
  })
}
