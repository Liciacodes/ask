import { checkBody, conflict, notFound } from "@/lib/api"
import { deleteReminder, findReminder, updateReminder } from "@/lib/reminder-store"
import { reminderChanges, toJson } from "@/lib/reminders"
import { currentUserId } from "@/lib/user"

type Context = RouteContext<"/api/reminders/[id]">

export async function PATCH(request: Request, ctx: Context) {
  const { id } = await ctx.params
  const reminder = await findReminder(await currentUserId(), id)
  if (!reminder) return notFound()

  const body = await checkBody(request, reminderChanges)
  if (!body.ok) return body.response

  const result = await updateReminder(reminder, body.data)
  if (!result.ok) return conflict(`This reminder is already ${result.status}, so its status can't change`)
  return Response.json(toJson(result.reminder))
}

export async function DELETE(_request: Request, ctx: Context) {
  const { id } = await ctx.params
  if (!(await deleteReminder(await currentUserId(), id))) return notFound()
  return new Response(null, { status: 204 })
}
