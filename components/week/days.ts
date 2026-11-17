import type { ReminderJson } from "@/lib/reminders"
import { weekRange } from "@/lib/time"

const DAY = 86_400_000

const format = (date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date)

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)

type Day = { key: string; weekday: string; number: string; label: string; today: boolean }

function weekDays(now: Date, timeZone: string) {
  const { from, to } = weekRange(now, timeZone)
  const today = dayKey(now, timeZone)
  // Noon is always inside its day, even in a week where the clocks change.
  const noons = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * DAY + DAY / 2))
  const days: Day[] = noons.map((noon) => ({
    key: dayKey(noon, timeZone),
    weekday: format(noon, timeZone, { weekday: "short" }),
    number: format(noon, timeZone, { day: "numeric" }),
    label: format(noon, timeZone, { weekday: "long", day: "numeric", month: "long" }),
    today: dayKey(noon, timeZone) === today,
  }))
  const range = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone }).formatRange(noons[0], noons[6])
  return { from, to, days, range }
}

function remindersByDay(reminders: ReminderJson[], timeZone: string) {
  const sorted = [...reminders].sort((a, b) => a.due_at.localeCompare(b.due_at) || a.created_at.localeCompare(b.created_at))
  const byDay = new Map<string, ReminderJson[]>()
  for (const reminder of sorted) {
    const key = dayKey(new Date(reminder.due_at), timeZone)
    byDay.set(key, [...(byDay.get(key) ?? []), reminder])
  }
  return byDay
}

const timeOf = (reminder: ReminderJson, timeZone: string) =>
  format(new Date(reminder.due_at), timeZone, { timeStyle: "short" })

const whenOf = (reminder: ReminderJson) =>
  `${format(new Date(reminder.due_at), reminder.timezone, { weekday: "short", day: "numeric", month: "short" })}, ${timeOf(reminder, reminder.timezone)}`

export { remindersByDay, timeOf, weekDays, whenOf, type Day }
