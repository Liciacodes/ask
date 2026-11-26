"use client"

import { Button } from "@ui-sdk/react/button"
import { createParts } from "@ui-sdk/react/primitive"
import type { TransferMessage } from "@ui-sdk/core"
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react"
import { NotesIcon } from "@/components/command-bar/icons"
import type { Category } from "@/lib/categories"
import type { ReminderJson } from "@/lib/reminders"
import { localDateTime } from "@/lib/time"
import { CategoryDot, CategoryIcon, ClockIcon } from "./category-look"
import { dayKey, timeOf, type Day } from "./days"
import { gridHeight, HOUR, hourLabels, hoursShown, nowTop, placeCards, type Hours, type Placed } from "./grid"
import { canMoveTo } from "./moves"
import { weekBoard, type MoveDetails } from "./primitive"
import type { WeekState } from "./use-week"

const parts = createParts(weekBoard, { root: "ol", list: "li", cards: "ul", card: "li" })

// Each day's heading sits above its column in the grid (md:h-18), so the hours start this far down.
const HEADER = 72

const at = (vars: Record<string, string>) => vars as CSSProperties

const clock = (hour: number, minute = 0) =>
  new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)))
const hourLabel = (hour: number) => clock(hour)

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)" // the --ease-out token in globals.css
const LEAVE_MS = 150 // a dashed card you said no to fades out
const LAND_MS = 200 // one you said yes to fills to solid
// How far a dashed card scrolled into view stays from the screen's top or the bar's.
const CLEAR = 12

const prefersReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// A card the bar is waiting on, not saved yet, at the day and local time it would have: a new reminder, or a change
// that `replaces` one in the week.
type Dashed = { id: string; title: string; category: Category; day: string; time: string; replaces?: string }

// The dashed card's place among a day's cards, which are keyed by reminder id.
const DASHED = "dashed"

// "18:00" as the person's clock says it, like the cards' own times.
const clockOf = (time: string) => {
  const [hour, minute] = time.split(":").map(Number)
  return clock(hour, minute)
}

// A card's words: its dot and title, then a clock and its time, with whatever follows the time.
const cardWords = "flex min-w-0 flex-1 flex-col gap-0.75"
const titleRow = "flex min-w-0 items-center gap-1.75"
const cardTitle = "min-w-0 text-[13px] leading-[1.2] font-semibold wrap-break-word md:truncate"
const timeRow = "flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] font-medium whitespace-nowrap text-muted tabular-nums"
// A pill follows the time when its card has room for it, as on a phone. A grid card is narrower: there the pill sits
// on the card's bottom edge instead, ringed in white, clear of the title, so it's never cut off. Each needs room for
// "10:00 AM", the clock and the icon beside it, so each has its own width. Whole class names, so Tailwind finds them.
const pill = "shrink-0 rounded-lg px-1.75 py-px text-[11px] font-semibold"
const pills = {
  sent: `${pill} bg-sent text-sent-ink @max-[138px]:absolute @max-[138px]:-bottom-2.5 @max-[138px]:right-2.5 @max-[138px]:ring-2 @max-[138px]:ring-surface`,
  failed: `${pill} bg-failed text-failed-ink @max-[159px]:absolute @max-[159px]:-bottom-2.5 @max-[159px]:right-2.5 @max-[159px]:ring-2 @max-[159px]:ring-surface`,
  unsaved: `${pill} bg-unsaved text-unsaved-ink @max-[166px]:absolute @max-[166px]:-bottom-2.5 @max-[166px]:right-2.5 @max-[166px]:ring-2 @max-[166px]:ring-surface`,
}
// The category's icon, in grey at the card's end: with the dot and the card's name, colour is never the only clue.
const cardIcon = "grid shrink-0 place-items-center text-muted"

// What a dashed card shows: the card's dot, title, time and icon, with a "Not saved" pill. The same face lies over a
// card that has just been saved, and fades to show it.
function DashedFace({ title, category, time }: { title: string; category: Category; time: string }) {
  return (
    <>
      <span data-card-words="" className={cardWords}>
        <span className={titleRow}>
          <CategoryDot category={category} />
          <span className={cardTitle}>{title}</span>
        </span>
        <span className={timeRow}>
          <ClockIcon className="shrink-0" />
          {time}
          <span className={pills.unsaved}>Not saved</span>
        </span>
      </span>
      <span data-card-icon="" className={cardIcon}>
        <CategoryIcon category={category} />
      </span>
    </>
  )
}

// Every card is white with soft corners. A saved one has a thin border and a soft shadow; one that isn't saved yet
// has a dashed border, half a pixel thicker, which takes half a pixel of its padding so the words sit exactly where
// the saved card's will.
const savedCard = "rounded-2xl border border-line bg-surface px-2.5 py-1.5 text-ink shadow-card"
const dashedCard = "rounded-2xl border-[1.5px] border-dashed border-dashed-line bg-surface px-[9.5px] py-[5.5px] text-ink"

// What a screen reader calls a card. Its colour and icon don't reach them, so its category is in the words.
function cardName(reminder: ReminderJson, timezone: string) {
  return [
    reminder.title,
    timeOf(reminder, timezone),
    reminder.category !== "other" && reminder.category,
    reminder.status === "sent" && "sent",
    reminder.status === "failed" && "not sent",
    // The whole note: the card itself only has room for a line of it, or an icon.
    reminder.description && `note: ${reminder.description}`,
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
      className="pointer-events-none absolute inset-x-0 top-(--now-at) hidden h-0.5 rounded-xs bg-now md:block"
    >
      <span className="absolute -top-0.75 -left-1 size-2 rounded-full bg-now" />
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
        className="rounded-xl border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-ink shadow-button outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
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
  // The newest card, ringed in the accent.
  newest: string | null
  // Reminders whose move is still saving: they can't be picked up until the server answers.
  saving: ReadonlySet<string>
  // The card the bar is waiting on, where it would go, and the reminder a yes to it has just saved there.
  dashed: Dashed | null
  landing: string | null
  onLanded: () => void
  // While the bar is open, the week keeps room below it to scroll a dashed card above the bar.
  barOpen: boolean
  onMove: (reminder: ReminderJson, day: string) => void
  // A click on a card, or Enter on it, opens it in the form to edit.
  onOpen: (reminder: ReminderJson) => void
  ref: Ref<HTMLOListElement>
}

function Week({ days, timezone, state, newest, saving, dashed, landing, onLanded, barOpen, onMove, onOpen, ref }: WeekProps) {
  const moveHint = useId()

  // The dashed card shows while the bar waits on it, and fades out after a no. One that a yes has just saved goes
  // at once: its card takes its place, under a copy of its dashed face that fades (`landing`).
  const [last, setLast] = useState(dashed)
  const [leaving, setLeaving] = useState<Dashed | null>(null)
  if (dashed?.id !== last?.id) {
    setLast(dashed)
    setLeaving(last && !dashed && landing === null && !prefersReduced() ? last : null)
  }
  const shownDashed = dashed ?? leaving
  const dashedEl = useRef<HTMLLIElement>(null)
  const landingFace = useRef<HTMLSpanElement>(null)
  const room = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const card = dashedEl.current
    if (!leaving || !card) return
    const fade = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: EASE_OUT, fill: "forwards" })
    fade.finished.then(() => setLeaving(null), () => {})
    return () => fade.cancel()
  }, [leaving])

  useLayoutEffect(() => {
    if (!landing) return
    const face = landingFace.current
    if (!face || prefersReduced()) return onLanded()
    const fill = face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAND_MS, easing: EASE_OUT, fill: "forwards" })
    fill.finished.then(onLanded, () => {})
    return () => fill.cancel()
  }, [landing, onLanded])

  // A dashed card off screen, or under the docked bar, scrolls just far enough into view, and so does the card it
  // becomes, as the bar grows by its "Saved" line. The room below the week lets one late in the day rise above the bar.
  const dashedId = dashed?.id
  useLayoutEffect(() => {
    const below = room.current
    if (!below) return
    if (!barOpen) {
      below.style.height = ""
      return
    }
    const card = dashedId ? dashedEl.current : landing ? landingFace.current?.parentElement : null
    if (!card) return
    // The bar's place in the layout, not as its opening animation draws it.
    const bar = document.querySelector<HTMLElement>('[data-slot="command-bar-content"]')
    const barTop = bar ? bar.offsetTop : innerHeight
    below.style.height = `${Math.max(0, innerHeight - barTop)}px`
    const box = card.getBoundingClientRect()
    const by = box.bottom + CLEAR > barTop ? box.bottom + CLEAR - barTop : box.top < CLEAR ? box.top - CLEAR : 0
    if (by !== 0) scrollBy({ top: by, behavior: prefersReduced() ? "instant" : "smooth" })
  }, [dashedId, landing, barOpen])
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
  const hours = hoursShown([
    ...reminders.filter((reminder) => dayOf(reminder) in lists).map(timeIn),
    ...(shownDashed && shownDashed.day in lists ? [shownDashed.time] : []),
  ])
  // A 48px card in its 54px hour, 3px clear above and below and 5px clear of its lane's sides.
  const spotAt = (spot: Placed) =>
    at({
      "--top": `${spot.top + 3}px`,
      "--left": `calc(${(spot.lane * 100) / spot.lanes}% + 5px)`,
      "--width": `calc(${100 / spot.lanes}% - 10px)`,
    })
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
        Press Enter to edit it, or Space to move it to another day.
      </p>
      {/* From tablet width up, a time grid: the hours, then a column a day with each card at its time. On a phone the
          same days stack, each with its cards in a list. */}
      <div
        style={at({ "--grid": `${gridHeight(hours)}px` })}
        className="mt-5 rounded-4xl bg-surface p-3 shadow-board md:grid md:grid-cols-[64px_minmax(0,1fr)] md:pb-5"
      >
        <div aria-hidden="true" className="relative hidden md:block">
          {hourLabels(hours).map((hour) => (
            <span
              key={hour}
              style={at({ "--at": `${HEADER + (hour - hours.first) * HOUR}px` })}
              className="absolute top-(--at) right-3 -translate-y-1/2 text-[12px] font-medium whitespace-nowrap text-muted tabular-nums"
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
          open={(id: string) => {
            const reminder = byId.get(id)
            if (reminder) onOpen(reminder)
          }}
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
                // The day's cards, and the dashed card among them at its time, after any card at the same time.
                const ghost = shownDashed?.day === day.key ? shownDashed : null
                const slots = [
                  ...inTimeOrder(cards).map((reminder) => ({ id: reminder.id, time: timeIn(reminder) })),
                  ...(ghost ? [{ id: DASHED, time: ghost.time }] : []),
                ].sort((a, b) => a.time.localeCompare(b.time))
                const placed = placeCards(slots, hours)
                return (
                  <>
                    <h3 aria-label={day.label} className="flex w-12 shrink-0 flex-col items-center gap-1.5 md:h-18 md:w-auto md:justify-center">
                      <span className="text-[14px] font-medium text-muted">{day.weekday}</span>
                      {/* Today's date is a dark circle. */}
                      <span
                        className={`grid size-9.5 place-items-center rounded-full text-[17px] font-semibold tabular-nums ${
                          day.today ? "bg-strong text-on-strong" : "text-ink"
                        }`}
                      >
                        {day.number}
                      </span>
                    </h3>
                    <parts.Cards
                      aria-label={day.label}
                      className={`flex min-w-0 flex-1 flex-col gap-2 md:relative md:block md:h-(--grid) md:flex-none md:hour-lines ${day.today ? "md:bg-today" : ""}`}
                    >
                      {slots.map(({ id }) => {
                        const spot = placed.get(id)!
                        // Hidden from screen readers, who hear the bar's card, and out of reach of the pointer and
                        // the keyboard: it isn't a card yet.
                        if (id === DASHED && ghost) {
                          return (
                            <li
                              key={`dashed-${ghost.id}`}
                              ref={dashedEl}
                              aria-hidden="true"
                              data-dashed=""
                              style={spotAt(spot)}
                              className={`@container pointer-events-none relative flex min-h-12 items-center gap-2 md:absolute md:top-(--top) md:left-(--left) md:h-12 md:w-(--width) ${dashedCard}`}
                            >
                              <DashedFace title={ghost.title} category={ghost.category} time={clockOf(ghost.time)} />
                            </li>
                          )
                        }
                        const reminder = byId.get(id)!
                        return (
                          <parts.Card
                            key={reminder.id}
                            value={reminder.id}
                            data-id={reminder.id}
                            data-newest={newest === reminder.id ? "" : undefined}
                            data-replaced={dashed?.replaces === reminder.id ? "" : undefined}
                            data-dimming={shownDashed?.replaces === reminder.id ? "" : undefined}
                            aria-label={cardName(reminder, timezone)}
                            aria-describedby={locked(reminder.id) ? undefined : moveHint}
                            style={spotAt(spot)}
                            className={`@container relative flex min-h-12 items-center gap-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent md:absolute md:top-(--top) md:left-(--left) md:h-12 md:w-(--width) ${savedCard}`}
                          >
                            <span data-card-words="" className={cardWords}>
                              <span className={titleRow}>
                                <CategoryDot category={reminder.category} />
                                <span className={cardTitle}>{reminder.title}</span>
                              </span>
                              <span className={timeRow}>
                                <ClockIcon className="shrink-0" />
                                <time dateTime={reminder.due_at}>{timeOf(reminder, timezone)}</time>
                                {reminder.status === "sent" && <span className={pills.sent}>Sent</span>}
                                {reminder.status === "failed" && <span className={pills.failed}>Not sent</span>}
                                {/* A grid card has no room for its note: an icon says there is one, and shows it on hover.
                                    Screen readers hear the note in the card's name. */}
                                {reminder.description && (
                                  <span data-note-icon="" title={reminder.description} aria-hidden="true" className="hidden shrink-0 md:inline-grid">
                                    <NotesIcon className="size-3" />
                                  </span>
                                )}
                              </span>
                              {reminder.description && (
                                <span data-note="" aria-hidden="true" className="truncate text-[12px] font-medium text-muted md:hidden">
                                  {reminder.description}
                                </span>
                              )}
                            </span>
                            <span aria-hidden="true" data-card-icon="" className={cardIcon}>
                              <CategoryIcon category={reminder.category} />
                            </span>
                            {landing === reminder.id && (
                              <span
                                ref={landingFace}
                                aria-hidden="true"
                                data-landing=""
                                className={`absolute -inset-px flex items-center gap-2 ${dashedCard}`}
                              >
                                <DashedFace title={reminder.title} category={reminder.category} time={timeOf(reminder, timezone)} />
                              </span>
                            )}
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
      <div ref={room} aria-hidden="true" data-room="" />
    </>
  )
}

export { Week, WeekNote, type Dashed }
