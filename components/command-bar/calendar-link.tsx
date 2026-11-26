"use client"

import { calendarLink, type CalendarReminder } from "@/lib/calendar-link"
import { CalendarAddIcon, ExternalIcon } from "./icons"

// A saved reminder's "Add to Google Calendar": Google's own new-event page in a new tab, filled in with the reminder,
// where the person presses Save. Ask doesn't connect to their calendar, so it works the same for guests.
// White with a thin border, like the bar's other quiet buttons, and 44px tall.
function AddToCalendar({ reminder, className = "" }: { reminder: CalendarReminder; className?: string }) {
  // Only ever drawn in the browser, inside the open bar.
  const origin = typeof window === "undefined" ? "" : window.location.origin
  return (
    <a
      href={calendarLink(reminder, origin)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      <CalendarAddIcon className="size-4 shrink-0" />
      Add to Google Calendar
      <ExternalIcon className="size-3.5 shrink-0 text-muted" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export { AddToCalendar }
