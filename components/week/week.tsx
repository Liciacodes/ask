"use client"

import { Button } from "@ui-sdk/react/button"
import { createParts } from "@ui-sdk/react/primitive"
import type { TransferMessage } from "@ui-sdk/core"
import { useEffect, useId, useState, type CSSProperties, type ReactNode, type Ref } from "react"
import { CheckIcon } from "@/components/command-bar/icons"
import type { ReminderJson } from "@/lib/reminders"
import { localDateTime } from "@/lib/time"
import { CategoryIcon, categoryLook } from "./category-look"
import { dayKey, timeOf, type Day } from "./days"
import { gridHeight, HOUR, hourLabels, hoursShown, nowTop, placeCards, type Hours } from "./grid"
import { canMoveTo } from "./moves"
import { weekBoard, type MoveDetails } from "./primitive"
import type { WeekState } from "./use-week"

const parts = createParts(weekBoard, { root: "ol", list: "li", cards: "ul", card: "li" })

// Each day's heading sits above its column in the grid (md:h-18), so the hours start this far down.
const HEADER = 72

const at = (vars: Record<string, string>) => vars as CSSProperties

const hourLabel = (hour: number) =>
  new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour)))

// What a screen reader calls a card. Its colour and icon don't reach them, so its category is in the words.
function cardName(reminder: ReminderJson, timezone: string) {
  return [
    reminder.title,
    timeOf(reminder, timezone),
    reminder.category !== "other" && reminder.category,
    reminder.status === "sent" && "sent",
    reminder.status === "failed" && "not sent",
  ]
    .filter(Boolean)
    .join(", ")
}

// Today's red line at the current minute, moved on as each minute turns.
function NowLine({ timezone, hours }: { timezone: string; hours: Hours }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        setNow(new Date())
        next()
      }, 60_000 - (Date.now() % 60_000))
    }
    next()
    return () => window.clearTimeout(timer)
  }, [])

  const top = nowTop(localDateTime(now, timezone).time, hours)
  if (top === null) return null
  return (
    <div
      aria-hidden="true"
      data-now=""
      style={at({ "--now-at": `${HEADER + top}px` })}
      className="pointer-events-none absolute inset-x-0 top-(--now-at) hidden h-0.5 bg-now md:block"
    >
      <span className="absolute -top-1 -left-1.25 size-2.5 rounded-full bg-now" />
    </div>
  )
}

type WeekNoteProps = { state: WeekState; onRetry: () => void; emptyHint: ReactNode }

function WeekNote({ state, onRetry, emptyHint }: WeekNoteProps) {
  if (state.status === "loading") return <p className="text-muted">Loading this week…</p>
  if (state.status === "ready") return state.reminders.length === 0 ? <p className="text-muted">{emptyHint}</p> : null
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-error">Ask couldn&apos;t load this week. Check your connection and try again.</span>
      <Button
        onClick={onRetry}
        className="rounded-sm border border-line bg-surface px-2.5 py-1 text-[13px] text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
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
    return reminder && cardName(reminder, timezone)
  }
  const timeIn = (reminder: ReminderJson) => localDateTime(new Date(reminder.due_at), timezone).time
  const hours = hoursShown(reminders.filter((reminder) => dayOf(reminder) in lists).map(timeIn))
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
      {/* From tablet width up, a time grid: the hours, then a column a day with each card at its time. On a phone the
          same days stack, each with its cards in a list. */}
      <div
        style={at({ "--grid": `${gridHeight(hours)}px` })}
        className="mt-5 rounded-3xl border border-line bg-surface p-2 shadow-board md:grid md:grid-cols-[64px_minmax(0,1fr)] md:pb-4"
      >
        <div aria-hidden="true" className="relative hidden md:block">
          {hourLabels(hours).map((hour) => (
            <span
              key={hour}
              style={at({ "--at": `${HEADER + (hour - hours.first) * HOUR}px` })}
              className="absolute top-(--at) right-2.5 -translate-y-1/2 text-[11px] font-semibold whitespace-nowrap text-muted tabular-nums"
            >
              {hourLabel(hour)}
            </span>
          ))}
        </div>
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
          className="grid grid-cols-1 md:grid-cols-7"
        >
          {days.map((day) => (
            <parts.List
              key={day.key}
              value={day.key}
              aria-current={day.today ? "date" : undefined}
              className="relative flex gap-3 border-b border-line px-1 py-3 last:border-b-0 md:flex-col md:gap-0 md:border-b-0 md:border-l md:border-line-faint md:p-0"
            >
              {({ cards }) => {
                const shown = inTimeOrder(cards)
                const placed = placeCards(
                  shown.map((reminder) => ({ id: reminder.id, time: timeIn(reminder) })),
                  hours
                )
                return (
                  <>
                    <h3 aria-label={day.label} className="flex w-12 shrink-0 flex-col items-center gap-1 md:h-18 md:w-auto md:justify-center md:gap-1.5">
                      <span className={`text-[12px] font-bold tracking-widest uppercase ${day.today ? "text-accent" : "text-muted"}`}>{day.weekday}</span>
                      <span
                        className={`grid size-9 place-items-center rounded-full text-[17px] font-extrabold tabular-nums ${
                          day.today ? "bg-accent-fill text-on-accent" : "text-ink"
                        }`}
                      >
                        {day.number}
                      </span>
                    </h3>
                    <parts.Cards
                      aria-label={day.label}
                      className={`flex min-w-0 flex-1 flex-col gap-2 md:relative md:block md:h-(--grid) md:flex-none md:hour-lines ${day.today ? "md:bg-today" : ""}`}
                    >
                      {shown.map((reminder) => {
                        const spot = placed.get(reminder.id)!
                        const look = categoryLook[reminder.category]
                        return (
                          <parts.Card
                            key={reminder.id}
                            value={reminder.id}
                            data-id={reminder.id}
                            aria-label={cardName(reminder, timezone)}
                            aria-describedby={locked(reminder.id) ? undefined : moveHint}
                            style={at({
                              "--top": `${spot.top + 2}px`,
                              "--left": `calc(${(spot.lane * 100) / spot.lanes}% + 4px)`,
                              "--width": `calc(${100 / spot.lanes}% - 8px)`,
                            })}
                            className={`@container flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent md:absolute md:top-(--top) md:left-(--left) md:h-11 md:w-(--width) ${look.card}`}
                          >
                            <span aria-hidden="true" data-card-icon="" className={`grid size-5.5 shrink-0 place-items-center rounded-[7px] ${look.tile}`}>
                              <CategoryIcon category={reminder.category} />
                            </span>
                            <span data-card-words="" className="flex min-w-0 flex-1 flex-col">
                              <span className="relative text-[13px] leading-tight font-bold wrap-break-word md:truncate">
                                {marked === reminder.id && (
                                  // The same words in highlighter, behind the real ones, so it wraps exactly as they do.
                                  <span aria-hidden="true" data-marker="" className="absolute inset-0 text-transparent">
                                    <span className="box-decoration-clone highlighter">{reminder.title}</span>
                                  </span>
                                )}
                                <span className="relative">{reminder.title}</span>
                              </span>
                              <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums">
                                <time dateTime={reminder.due_at}>{timeOf(reminder, timezone)}</time>
                                {reminder.status === "sent" && <CheckIcon aria-hidden={false} aria-label="Sent" role="img" className="size-3" />}
                                {reminder.status === "failed" && <span className="truncate">Not sent</span>}
                              </span>
                            </span>
                          </parts.Card>
                        )
                      })}
                    </parts.Cards>
                    {day.today && <NowLine timezone={timezone} hours={hours} />}
                  </>
                )
              }}
            </parts.List>
          ))}
        </parts.Root>
      </div>
    </>
  )
}

export { Week, WeekNote }
