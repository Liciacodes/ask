import { checkBody } from "@/lib/api"
import { createReminder } from "@/lib/reminder-store"
import { newReminder, toJson } from "@/lib/reminders"
import { currentUserId } from "@/lib/user"

export async function POST(request: Request) {
  const body = await checkBody(request, newReminder)
  if (!body.ok) return body.response

  const reminder = await createReminder(await currentUserId(), body.data)
  return Response.json(toJson(reminder), { status: 201 })
}
