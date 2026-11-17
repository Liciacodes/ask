import type { z } from "zod"
import type { cancelReminderInput, changeReminderInput, createReminderInput } from "@/lib/agent-actions"
import type { Reminder } from "@/lib/generated/prisma/client"
import { createReminder, findReminder, updateReminder } from "@/lib/reminder-store"
import { newReminder, reminderChanges, toJson, type ReminderJson } from "@/lib/reminders"
import { instantAt, localDateTime } from "@/lib/time"

// A plan checks one proposed action against everything the server knows, before you see it and again
// before it runs. It either names the problem, or describes the action as a preview and can carry it out.

type AgentContext = { userId: string; timezone: string }

type Card = { title: string; description: string | null; date: string; time: string }

type Preview =
  | { action: "create"; reminder: Card }
  | { action: "change"; before: Card; after: Card }
  | { action: "cancel" | "restore"; reminder: Card }

type Plan = { ok: true; preview: Preview; run: () => Promise<ReminderJson> } | { ok: false; problem: string }

const refused = (problem: string): Plan => ({ ok: false, problem })
const problemIn = (error: z.ZodError) => error.issues.map((issue) => issue.message).join(". ")
const notFound = refused("No reminder has that id. Look it up with listReminders first.")

const cardOf = (reminder: Pick<Reminder, "title" | "description" | "dueAt">, timezone: string): Card => ({
  title: reminder.title,
  description: reminder.description,
  ...localDateTime(reminder.dueAt, timezone),
})

const withoutUndefined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>

async function planCreate({ userId, timezone }: AgentContext, input: z.output<typeof createReminderInput>): Promise<Plan> {
  const due = instantAt(input.date, input.time, timezone)
  const checked = newReminder.safeParse(withoutUndefined({ title: input.title, description: input.description, due_at: due.toISOString(), timezone }))
  if (!checked.success) return refused(problemIn(checked.error))

  const { title, description, due_at } = checked.data
  return {
    ok: true,
    preview: { action: "create", reminder: cardOf({ title, description: description ?? null, dueAt: due_at }, timezone) },
    run: async () => toJson(await createReminder(userId, checked.data)),
  }
}

async function planChange({ userId, timezone }: AgentContext, input: z.output<typeof changeReminderInput>): Promise<Plan> {
  const reminder = await findReminder(userId, input.id)
  if (!reminder) return notFound

  // A new date keeps the old time, and a new time keeps the old date, as they read on the person's clock.
  const was = localDateTime(reminder.dueAt, timezone)
  const moves = input.date !== undefined || input.time !== undefined
  const due = moves ? instantAt(input.date ?? was.date, input.time ?? was.time, timezone) : undefined
  const changes = withoutUndefined({
    title: input.title,
    description: input.description,
    due_at: due?.toISOString(),
    timezone: due ? timezone : undefined,
  })
  const checked = reminderChanges.safeParse(changes)
  if (!checked.success) return refused(problemIn(checked.error))

  const after = {
    title: checked.data.title ?? reminder.title,
    description: checked.data.description !== undefined ? checked.data.description : reminder.description,
    dueAt: checked.data.due_at ?? reminder.dueAt,
  }
  return {
    ok: true,
    preview: { action: "change", before: cardOf(reminder, timezone), after: cardOf(after, timezone) },
    run: async () => {
      const result = await updateReminder(reminder, checked.data)
      if (!result.ok) throw new Error(`This reminder is already ${result.status}, so it can't change.`)
      return toJson(result.reminder)
    },
  }
}

async function planStatus(
  { userId, timezone }: AgentContext,
  { id }: z.output<typeof cancelReminderInput>,
  action: "cancel" | "restore"
): Promise<Plan> {
  const reminder = await findReminder(userId, id)
  if (!reminder) return notFound
  if (reminder.status === "sent" || reminder.status === "failed") {
    return refused(`This reminder was already ${reminder.status}, so it can't be ${action === "cancel" ? "cancelled" : "brought back"}.`)
  }
  if (action === "cancel" && reminder.status === "cancelled") return refused("This reminder is already cancelled.")
  if (action === "restore" && reminder.status !== "cancelled") return refused("This reminder isn't cancelled, so there's nothing to bring back.")

  return {
    ok: true,
    preview: { action, reminder: cardOf(reminder, timezone) },
    run: async () => {
      const result = await updateReminder(reminder, { status: action === "cancel" ? "cancelled" : "pending" })
      if (!result.ok) throw new Error(`This reminder is already ${result.status}, so it can't change.`)
      return toJson(result.reminder)
    },
  }
}

export { planChange, planCreate, planStatus, type AgentContext, type Card, type Plan, type Preview }
