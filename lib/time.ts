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

export { canonicalTimeZone, weekRange }
