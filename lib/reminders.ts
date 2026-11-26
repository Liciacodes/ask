import { z } from "zod"
import { CATEGORIES } from "@/lib/categories"
import type { Reminder } from "@/lib/generated/prisma/client"
import { canonicalTimeZone } from "@/lib/time"

const title = z.string().trim().min(1, "Add a title").max(200, "Keep the title under 200 characters")

const description = z
  .string()
  .trim()
  .max(2000, "Keep the description under 2,000 characters")
  .transform((text) => text || null)
  .nullable()

const dueAt = z.iso
  .datetime({ offset: true, error: "Use a date and time with its offset, like 2026-11-20T09:00:00+01:00" })
  .transform((text) => new Date(text))
  .refine((date) => date.getTime() > Date.now(), "Pick a time in the future")

const timezone = z
  .string({ error: "Add a timezone, like Africa/Lagos" })
  .refine((name) => canonicalTimeZone(name) !== null, "Unknown timezone. Use a name like Africa/Lagos")
  .transform((name) => canonicalTimeZone(name)!)

const category = z.enum(CATEGORIES, { error: `Category must be one of: ${CATEGORIES.join(", ")}` })

// Left out, the category is guessed from the title (lib/categories.ts).
const newReminder = z.strictObject({
  title,
  description: description.optional(),
  due_at: dueAt,
  timezone,
  category: category.optional(),
})

const reminderChanges = z
  .strictObject({
    title,
    description,
    due_at: dueAt,
    timezone,
    status: z.enum(["pending", "cancelled"], { error: "Status can only be pending or cancelled" }),
    category,
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change")

const weekQuery = z.object({ timezone })

function toJson(reminder: Reminder) {
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description,
    due_at: reminder.dueAt.toISOString(),
    timezone: reminder.timezone,
    status: reminder.status,
    category: reminder.category,
    sent_at: reminder.sentAt?.toISOString() ?? null,
    created_at: reminder.createdAt.toISOString(),
  }
}

type ReminderJson = ReturnType<typeof toJson>

export { newReminder, reminderChanges, toJson, weekQuery, type ReminderJson }
