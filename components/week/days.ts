import type { ReminderJson } from "@/lib/reminders"
import { weekRange } from "@/lib/time"

const DAY = 86_400_000

const format = (date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date)

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)

type Day = { key: string; weekday: string; number: string; label: string; today: boolean }

// The page's title: the week's month, "November 2026", or both when it spans two, "Nov – Dec 2026".
function monthTitle(first: Date, last: Date, timeZone: string, locale?: string) {
  const month = (date: Date) => dayKey(date, timeZone).slice(0, 7)
  if (month(first) === month(last)) return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone }).format(first)
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone }).formatRange(first, last)
}

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
  return { from, to, days, range, title: monthTitle(noons[0], noons[6], timeZone) }
}

const timeOf = (reminder: ReminderJson, timeZone: string) =>
  format(new Date(reminder.due_at), timeZone, { timeStyle: "short" })

const whenOf = (reminder: ReminderJson) =>
  `${format(new Date(reminder.due_at), reminder.timezone, { weekday: "short", day: "numeric", month: "short" })}, ${timeOf(reminder, reminder.timezone)}`

// A date and time already on the person's clock, like "2026-11-21" and "07:00", in the person's language,
// with the weekday apart so it can stand out: "Saturday" and "21 Nov, 07:00".
function localWhen({ date, time }: { date: string; time: string }) {
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = time.split(":").map(Number)
  const at = new Date(Date.UTC(year, month - 1, day, hours, minutes))
  return {
    weekday: format(at, "UTC", { weekday: "long" }),
    rest: `${format(at, "UTC", { day: "numeric", month: "short" })}, ${format(at, "UTC", { timeStyle: "short" })}`,
  }
}

export { dayKey, localWhen, monthTitle, timeOf, weekDays, whenOf, type Day }
