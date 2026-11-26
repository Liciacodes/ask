// A link to Google Calendar's own "new event" page, filled in with a reminder: its title, its time as a half-hour
// event, and its note. The person presses Save in Google, so Ask never needs access to their calendar.

const CALENDAR = "https://calendar.google.com/calendar/render"
const EVENT_MINUTES = 30

type CalendarReminder = { title: string; due_at: string; description: string | null }

// The UTC form Google reads: "2026-11-27T23:30:00.000Z" becomes "20261127T233000Z".
const googleTime = (instant: Date) => instant.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "")

// `origin` is the site's own address, like https://ask-pi-pearl.vercel.app, so the event says where it came from.
// URLSearchParams encodes everything a title or note can hold: &, #, emoji and line breaks.
function calendarLink({ title, due_at, description }: CalendarReminder, origin: string) {
  const start = new Date(due_at)
  const end = new Date(start.getTime() + EVENT_MINUTES * 60_000)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${googleTime(start)}/${googleTime(end)}`,
    details: [description?.trim(), `Added from Ask: ${origin}`].filter(Boolean).join("\n\n"),
  })
  return `${CALENDAR}?${params}`
}

export { calendarLink, type CalendarReminder }
