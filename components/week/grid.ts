import { stackSpans } from "@ui-sdk/core"

// The week's time grid as numbers: which hours it shows, and where each card and the now line sit in a day.
// A card covers the hour from its time, so cards less than an hour apart share their day's width.

const HOUR = 48
const FIRST_HOUR = 8
const LAST_HOUR = 23

// Whole hours: the grid runs from `first`:00 to `last`:00.
type Hours = { first: number; last: number }
type Placed = { top: number; lane: number; lanes: number }

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

// 8:00 to 23:00, widened to take in every card: from the earliest one's hour to the end of the latest one's hour,
// never past midnight.
function hoursShown(times: string[]): Hours {
  const minutes = times.map(minutesOf)
  return {
    first: Math.min(FIRST_HOUR, ...minutes.map((m) => Math.floor(m / 60))),
    last: Math.max(LAST_HOUR, ...minutes.map((m) => Math.min(24, Math.ceil(m / 60 + 1)))),
  }
}

const gridHeight = ({ first, last }: Hours) => (last - first) * HOUR

const hourLabels = ({ first, last }: Hours) => Array.from({ length: last - first }, (_, i) => first + i)

// Where a card's hour starts, in px from the top. One in the hour before midnight rises just enough to fit.
function slotTop(time: string, hours: Hours) {
  const top = ((minutesOf(time) - hours.first * 60) / 60) * HOUR
  return Math.min(top, gridHeight(hours) - HOUR)
}

// Each card in a day: its top, and its lane among the cards its hour overlaps. Cards that only touch, like 9:00
// and 10:00, each keep the whole width.
function placeCards(cards: { id: string; time: string }[], hours: Hours): Map<string, Placed> {
  const tops = new Map(cards.map((card) => [card.id, slotTop(card.time, hours)]))
  const lanes = stackSpans(cards.map(({ id }) => ({ id, track: "day", start: tops.get(id)!, end: tops.get(id)! + HOUR })))
  return new Map(cards.map(({ id }) => [id, { top: tops.get(id)!, ...lanes.get(id)! }]))
}

// The now line, in px from the top, or null outside the hours shown.
function nowTop(time: string, { first, last }: Hours) {
  const minutes = minutesOf(time)
  if (minutes < first * 60 || minutes >= last * 60) return null
  return ((minutes - first * 60) / 60) * HOUR
}

export { gridHeight, HOUR, hourLabels, hoursShown, nowTop, placeCards, slotTop, type Hours, type Placed }
