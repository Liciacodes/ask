import type { ReminderJson } from "@/lib/reminders"
import { instantAt, localDateTime } from "@/lib/time"

// The rules for dragging a card to another day, shared by the pointer, the keyboard and the save.

// A moved card keeps the time on its face: the clock time in the timezone the week is shown in, on the new day.
// A clock change between the two days doesn't shift it.
function movedDueAt(reminder: ReminderJson, day: string, timeZone: string) {
  const { time } = localDateTime(new Date(reminder.due_at), timeZone)
  return instantAt(day, time, timeZone)
}

// Only a pending reminder moves, and only to a day where its time is still ahead: never a past day, and today
// only before its time. The server checks the time again when the move is saved.
function canMoveTo(reminder: ReminderJson, day: string, now: Date, timeZone: string) {
  return reminder.status === "pending" && movedDueAt(reminder, day, timeZone).getTime() > now.getTime()
}

export { canMoveTo, movedDueAt }
