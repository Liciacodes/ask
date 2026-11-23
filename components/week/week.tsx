"use client"

import { Button } from "@ui-sdk/react/button"
import { createParts } from "@ui-sdk/react/primitive"
import type { TransferMessage } from "@ui-sdk/core"
import { useId, type ReactNode, type Ref } from "react"
import { CheckIcon } from "@/components/command-bar/icons"
import type { ReminderJson } from "@/lib/reminders"
import { localDateTime } from "@/lib/time"
import { dayKey, timeOf, type Day } from "./days"
import { canMoveTo } from "./moves"
import { weekBoard, type MoveDetails } from "./primitive"
import type { WeekState } from "./use-week"

const parts = createParts(weekBoard, { root: "ol", list: "li", cards: "ul", card: "li" })

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

type WeekProps = {
  days: Day[]
  timezone: string
  state: WeekState
  marked: string | null
  // Reminders whose move is still saving: they can't be picked up until the server answers.
  saving: ReadonlySet<string>
  onMove: (reminder: ReminderJson, day: string) => void
  ref: Ref<HTMLOListElement>
}

function Week({ days, timezone, state, marked, saving, onMove, ref }: WeekProps) {
  const moveHint = useId()
  const reminders = state.status === "ready" ? state.reminders : []
  const byId = new Map(reminders.map((reminder) => [reminder.id, reminder]))
  const dayOf = (reminder: ReminderJson) => dayKey(new Date(reminder.due_at), timezone)

  const lists = Object.fromEntries(days.map((day) => [day.key, [] as string[]]))
  for (const reminder of reminders) lists[dayOf(reminder)]?.push(reminder.id)

  // A day's cards in time order, whatever place a drag puts the moving one at, so it shows where it will land.
  const inTimeOrder = (ids: string[]) =>
    ids
      .flatMap((id) => byId.get(id) ?? [])
      .sort(
        (a, b) =>
          localDateTime(new Date(a.due_at), timezone).time.localeCompare(localDateTime(new Date(b.due_at), timezone).time) ||
          a.created_at.localeCompare(b.created_at)
      )

  const accepts = (id: string, day: string) => {
    const reminder = byId.get(id)
    return reminder !== undefined && (dayOf(reminder) === day || canMoveTo(reminder, day, new Date(), timezone))
  }

  const moved = (_lists: unknown, details: MoveDetails) => {
    const reminder = byId.get(details.key)
    if (details.from === details.to || !reminder || !canMoveTo(reminder, details.to, new Date(), timezone)) return details.cancel()
    onMove(reminder, details.to)
  }

  const locked = (id: string) => saving.has(id) || byId.get(id)?.status !== "pending"
  const label = (id: string) => {
    const reminder = byId.get(id)
    return reminder && `${reminder.title}, ${timeOf(reminder, timezone)}`
  }
  const dayLabel = (key: string) => days.find((day) => day.key === key)?.label
  // The drop says nothing itself: the status line says "Moved…" or "Couldn't move…" once the server answers.
  const message = ({ type, label, list }: TransferMessage) =>
    type === "grab"
      ? `${label}, picked up. Left and Right choose a day, Space drops it, Escape puts it back.`
      : type === "move"
        ? list
        : type === "cancel"
          ? `${label} back on ${list}.`
          : ""

  return (
    <>
      <p id={moveHint} hidden>
        Press Space to move it to another day.
      </p>
      <parts.Root
        ref={ref}
        lists={lists}
        accepts={accepts}
        locked={locked}
        label={label}
        dayLabel={dayLabel}
        message={message}
        onListsChange={moved}
        aria-label="Days this week"
        className="mt-5 grid grid-cols-1 md:flex-1 md:grid-cols-7 md:gap-2.5"
      >
        {days.map((day) => (
          <parts.List
            key={day.key}
            value={day.key}
            aria-current={day.today ? "date" : undefined}
            className="flex gap-4 border-b border-rule py-3 md:flex-col md:gap-0 md:border-b-0 md:py-0"
          >
            {({ cards }) => (
              <>
                <h3
                  aria-label={day.label}
                  className={`flex w-12 shrink-0 flex-col md:w-auto md:flex-row md:items-baseline md:gap-1.5 md:border-b-2 md:pb-1.5 ${
                    day.today ? "-ml-2.5 border-l-2 border-red-line pl-2 text-ink md:ml-0 md:border-l-0 md:pl-0" : "text-hint md:border-rule"
                  }`}
                >
                  <span className={`text-[12.5px] ${day.today ? "font-semibold" : ""}`}>{day.weekday}</span>
                  <span className={`text-[20px] leading-tight tabular-nums ${day.today ? "font-semibold" : ""}`}>{day.number}</span>
                </h3>
                <parts.Cards aria-label={day.label} className="flex min-w-0 flex-1 flex-col gap-2 md:min-h-72 md:pt-3 md:ruled">
                  {inTimeOrder(cards).map((reminder) => (
                    <parts.Card
                      key={reminder.id}
                      value={reminder.id}
                      data-id={reminder.id}
                      aria-describedby={locked(reminder.id) ? undefined : moveHint}
                      className="rounded-sm bg-card px-2.5 py-2 shadow-paper outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink"
                    >
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
                    </parts.Card>
                  ))}
                </parts.Cards>
              </>
            )}
          </parts.List>
        ))}
      </parts.Root>
    </>
  )
}

export { Week, WeekNote }
