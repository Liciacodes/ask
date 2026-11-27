import { z } from "zod"
import { guessCategory } from "@/lib/categories"
import { db } from "@/lib/db"
import type { Reminder } from "@/lib/generated/prisma/client"
import { scheduleIfDue } from "@/lib/notifications/schedule"
import type { newReminder, reminderChanges } from "@/lib/reminders"

// Every read and write of reminders, shared by the API routes and the agent. Input arrives already checked
// against the schemas in lib/reminders.ts; these functions own the rules that need the database.

type NewReminder = z.output<typeof newReminder>
type ReminderChanges = z.output<typeof reminderChanges>

// Saving a reminder also asks for its notification, when one is due within 7 days and its owner has turned
// reminders on (lib/notifications/schedule.ts). That never fails the save.
async function createReminder(userId: string, { title, description, due_at, timezone, category }: NewReminder) {
  const reminder = await db.reminder.create({ data: { userId, title, description, dueAt: due_at, timezone, category: category ?? guessCategory(title) } })
  await scheduleIfDue(reminder)
  return reminder
}

// A malformed id finds nothing, the same as an id that doesn't exist or belongs to someone else.
async function findReminder(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null
  return db.reminder.findFirst({ where: { id, userId } })
}

type Updated = { ok: true; reminder: Reminder } | { ok: false; reason: "status-locked"; status: Reminder["status"] }

// `reminder` comes from findReminder, so it already belongs to the user.
async function updateReminder(reminder: Reminder, { title, description, due_at, timezone, status, category }: ReminderChanges): Promise<Updated> {
  // Sent and failed belong to the sender: only pending and cancelled reminders can change status.
  if (status && reminder.status !== "pending" && reminder.status !== "cancelled") {
    return { ok: false, reason: "status-locked", status: reminder.status }
  }
  // A reminder that was sent, or couldn't be, and is moved to a time still ahead is waiting again: it's pending,
  // and gets a notification at its new time.
  const reopens =
    (reminder.status === "sent" || reminder.status === "failed") &&
    due_at !== undefined &&
    due_at.getTime() !== reminder.dueAt.getTime() &&
    due_at.getTime() > Date.now()
  const updated = await db.reminder.update({
    where: { id: reminder.id },
    data: { title, description, dueAt: due_at, timezone, status, category, ...(reopens && { status: "pending", sentAt: null }) },
  })
  await scheduleIfDue(updated)
  return { ok: true, reminder: updated }
}

async function deleteReminder(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return false
  const { count } = await db.reminder.deleteMany({ where: { id, userId } })
  return count > 0
}

// Reminders due from `from` up to, not including, `to`, soonest first. Cancelled ones are left out unless asked for.
function remindersDue(userId: string, from: Date, to: Date, { includeCancelled = false, limit }: { includeCancelled?: boolean; limit?: number } = {}) {
  return db.reminder.findMany({
    where: { userId, ...(!includeCancelled && { status: { not: "cancelled" } }), dueAt: { gte: from, lt: to } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  })
}

export { createReminder, deleteReminder, findReminder, remindersDue, updateReminder }
