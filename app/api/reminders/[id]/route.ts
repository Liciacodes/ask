import { z } from "zod"
import { checkBody, conflict, notFound } from "@/lib/api"
import { db } from "@/lib/db"
import { reminderChanges, toJson } from "@/lib/reminders"
import { currentUserId } from "@/lib/user"

type Context = RouteContext<"/api/reminders/[id]">

async function reminderId(ctx: Context) {
  const { id } = await ctx.params
  return z.uuid().safeParse(id).success ? id : null
}

export async function PATCH(request: Request, ctx: Context) {
  const id = await reminderId(ctx)
  const reminder = id && (await db.reminder.findFirst({ where: { id, userId: await currentUserId() } }))
  if (!reminder) return notFound()

  const body = await checkBody(request, reminderChanges)
  if (!body.ok) return body.response

  const { title, description, due_at, timezone, status } = body.data
  if (status && reminder.status !== "pending" && reminder.status !== "cancelled") {
    return conflict(`This reminder is already ${reminder.status}, so its status can't change`)
  }

  const updated = await db.reminder.update({
    where: { id: reminder.id },
    data: { title, description, dueAt: due_at, timezone, status },
  })
  return Response.json(toJson(updated))
}

export async function DELETE(_request: Request, ctx: Context) {
  const id = await reminderId(ctx)
  const { count } = id ? await db.reminder.deleteMany({ where: { id, userId: await currentUserId() } }) : { count: 0 }
  if (count === 0) return notFound()
  return new Response(null, { status: 204 })
}
