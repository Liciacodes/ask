import { Button } from "@ui-sdk/react/button"
import type { ReactNode, Ref } from "react"
import { CheckIcon } from "@/components/command-bar/icons"
import type { ReminderJson } from "@/lib/reminders"
import { remindersByDay, timeOf, type Day } from "./days"
import type { WeekState } from "./use-week"

type WeekNoteProps = { state: WeekState; onRetry: () => void; emptyHint: ReactNode }

function WeekNote({ state, onRetry, emptyHint }: WeekNoteProps) {
  if (state.status === "loading") return <p className="text-hint">Loading this week…</p>
  if (state.status === "ready") return state.reminders.length === 0 ? <p className="text-hint">{emptyHint}</p> : null
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-error">Ask couldn&apos;t load this week. Check your connection and try again.</span>
      <Button
        onClick={onRetry}
        className="rounded-sm border border-rule bg-card px-2.5 py-1 text-[13px] text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink"
      >
        Try again
      </Button>
    </p>
  )
}

type WeekProps = { days: Day[]; timezone: string; state: WeekState; marked: string | null; ref: Ref<HTMLOListElement> }

function Week({ days, timezone, state, marked, ref }: WeekProps) {
  const byDay = state.status === "ready" ? remindersByDay(state.reminders, timezone) : new Map<string, ReminderJson[]>()

  return (
    <>
      <ol ref={ref} aria-label="Days this week" className="mt-5 grid grid-cols-1 md:flex-1 md:grid-cols-7 md:gap-2.5">
        {days.map((day) => {
          const reminders = byDay.get(day.key) ?? []
          return (
            <li
              key={day.key}
              aria-current={day.today ? "date" : undefined}
              className="flex gap-4 border-b border-rule py-3 md:flex-col md:gap-0 md:border-b-0 md:py-0"
            >
              <h3
                aria-label={day.label}
                className={`flex w-12 shrink-0 flex-col md:w-auto md:flex-row md:items-baseline md:gap-1.5 md:border-b-2 md:pb-1.5 ${
                  day.today ? "-ml-2.5 border-l-2 border-red-line pl-2 text-ink md:ml-0 md:border-l-0 md:pl-0" : "text-hint md:border-rule"
                }`}
              >
                <span className={`text-[12.5px] ${day.today ? "font-semibold" : ""}`}>{day.weekday}</span>
                <span className={`text-[20px] leading-tight tabular-nums ${day.today ? "font-semibold" : ""}`}>
                  {day.number}
                </span>
              </h3>
              <ul className="flex min-w-0 flex-1 flex-col gap-2 md:min-h-72 md:pt-3 md:ruled">
                {reminders.map((reminder) => (
                  <li key={reminder.id} data-id={reminder.id} className="rounded-sm bg-card px-2.5 py-2 shadow-paper">
                    <p className="flex items-center gap-1.5 text-[12px] text-hint tabular-nums">
                      <time dateTime={reminder.due_at}>{timeOf(reminder, timezone)}</time>
                      {reminder.status === "sent" && <CheckIcon aria-hidden={false} aria-label="Sent" role="img" className="size-3.5" />}
                    </p>
                    <p className={`relative text-[13.5px] leading-snug wrap-break-word ${reminder.status === "sent" ? "text-hint" : "text-ink"}`}>
                      {marked === reminder.id && (
                        // The same words in highlighter, behind the real ones, so it wraps exactly as they do.
                        <span aria-hidden="true" data-marker="" className="absolute inset-0 text-transparent">
                          <span className="box-decoration-clone highlighter">{reminder.title}</span>
                        </span>
                      )}
                      <span className="relative">{reminder.title}</span>
                    </p>
                    {reminder.status === "failed" && <p className="mt-0.5 text-[12px] text-error">Not sent</p>}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
    </>
  )
}

export { Week, WeekNote }
