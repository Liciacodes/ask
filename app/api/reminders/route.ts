import { checkBody } from "@/lib/api"
import { createReminder } from "@/lib/reminder-store"
import { newReminder, toJson } from "@/lib/reminders"
import { ownerFrom } from "@/lib/session"
import { noVisitor } from "@/lib/visitor"

export async function POST(request: Request) {
  const owner = await ownerFrom(request)
  if (!owner) return noVisitor()

  const body = await checkBody(request, newReminder)
  if (!body.ok) return body.response

  const reminder = await createReminder(owner, body.data)
  return Response.json(toJson(reminder), { status: 201 })
}
