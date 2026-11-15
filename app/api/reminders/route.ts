import { checkBody } from "@/lib/api"
import { db } from "@/lib/db"
import { newReminder, toJson } from "@/lib/reminders"
import { currentUserId } from "@/lib/user"

export async function POST(request: Request) {
  const body = await checkBody(request, newReminder)
  if (!body.ok) return body.response

  const { title, description, due_at, timezone } = body.data
  const reminder = await db.reminder.create({
    data: { userId: await currentUserId(), title, description, dueAt: due_at, timezone },
  })
  return Response.json(toJson(reminder), { status: 201 })
}
