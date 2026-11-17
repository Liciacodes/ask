import { TZDate } from "@date-fns/tz"

function canonicalTimeZone(name: string): string | null {
  if (/^[+-]/.test(name)) return null
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

function weekRange(now: Date, timeZone: string) {
  const today = new TZDate(now.getTime(), timeZone)
  const daysSinceMonday = (today.getDay() + 6) % 7
  const monday = new TZDate(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday, timeZone)
  const nextMonday = new TZDate(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7, timeZone)
  return { from: new Date(monday.getTime()), to: new Date(nextMonday.getTime()) }
}

const pad = (n: number) => String(n).padStart(2, "0")

// "2026-11-20" and "18:00" on the clock in `timeZone`, as an exact moment. The model works in local dates and
// times; the server does the timezone maths, which models are prone to get wrong by an hour.
function instantAt(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = time.split(":").map(Number)
  return new Date(new TZDate(year, month - 1, day, hours, minutes, timeZone).getTime())
}

// An exact moment as the date and 24-hour time on the clock in `timeZone`.
function localDateTime(instant: Date, timeZone: string) {
  const local = new TZDate(instant.getTime(), timeZone)
  return {
    date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
    time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
  }
}

// From the start of local day `from` up to, not including, the start of the day after local day `to`.
function localDays(from: string, to: string, timeZone: string) {
  const [year, month, day] = to.split("-").map(Number)
  return { start: instantAt(from, "00:00", timeZone), end: new Date(new TZDate(year, month - 1, day + 1, timeZone).getTime()) }
}

export { canonicalTimeZone, instantAt, localDateTime, localDays, weekRange }
