import { checkBody } from "@/lib/api"
import { createReminder } from "@/lib/reminder-store"
import { newReminder, toJson } from "@/lib/reminders"
import { noVisitor, visitorFrom } from "@/lib/visitor"

export async function POST(request: Request) {
  const visitor = visitorFrom(request)
  if (!visitor) return noVisitor()

  const body = await checkBody(request, newReminder)
  if (!body.ok) return body.response

  const reminder = await createReminder(visitor, body.data)
  return Response.json(toJson(reminder), { status: 201 })
}
