import { describe, expect, test } from "vitest"
import { canMoveTo, movedDueAt } from "@/components/week/moves"
import type { ReminderJson } from "@/lib/reminders"

const LAGOS = "Africa/Lagos"
const LONDON = "Europe/London"

const reminder = (due_at: string, extra: Partial<ReminderJson> = {}): ReminderJson => ({
  id: "0b8e4a4e-3f1c-4a7a-9d55-5b2f3b8c9e10",
  title: "Dentist",
  description: null,
  due_at,
  timezone: LAGOS,
  status: "pending",
  category: "health",
  sent_at: null,
  created_at: "2026-11-20T09:00:00.000Z",
  ...extra,
})

describe("movedDueAt", () => {
  test("the date changes and the time on the card stays: 09:00 on Wednesday becomes 09:00 on Friday", () => {
    expect(movedDueAt(reminder("2026-11-25T08:00:00.000Z"), "2026-11-27", LAGOS).toISOString()).toBe("2026-11-27T08:00:00.000Z")
  })

  test("09:00 stays 09:00 across a clock change, in either direction", () => {
    // London's clocks go forward on Sunday 28 March 2027: 09:00 is 09:00 UTC before it and 08:00 UTC after.
    expect(movedDueAt(reminder("2027-03-27T09:00:00.000Z", { timezone: LONDON }), "2027-03-28", LONDON).toISOString()).toBe(
      "2027-03-28T08:00:00.000Z"
    )
    expect(movedDueAt(reminder("2027-03-29T08:00:00.000Z", { timezone: LONDON }), "2027-03-26", LONDON).toISOString()).toBe(
      "2027-03-26T09:00:00.000Z"
    )
  })

  test("the time kept is the one the week shows, even for a reminder saved on another clock", () => {
    // Saved in London for 09:00 there, shown in Lagos at 10:00: on the new day it's still 10:00 in Lagos.
    const fromLondon = reminder("2026-11-25T09:00:00.000Z", { timezone: LONDON })
    expect(movedDueAt(fromLondon, "2026-11-27", LAGOS).toISOString()).toBe("2026-11-27T09:00:00.000Z")
  })
})

describe("canMoveTo", () => {
  // Wednesday 25 November, 12:00 in Lagos.
  const now = new Date("2026-11-25T11:00:00.000Z")
  const nineAm = reminder("2026-11-27T08:00:00.000Z")
  const sixPm = reminder("2026-11-27T17:00:00.000Z")

  test("a later day takes it, and so does tomorrow", () => {
    expect(canMoveTo(nineAm, "2026-11-29", now, LAGOS)).toBe(true)
    expect(canMoveTo(nineAm, "2026-11-26", now, LAGOS)).toBe(true)
  })

  test("today takes it only while its time is still ahead", () => {
    expect(canMoveTo(nineAm, "2026-11-25", now, LAGOS)).toBe(false)
    expect(canMoveTo(sixPm, "2026-11-25", now, LAGOS)).toBe(true)
  })

  test("a day that has passed never takes it", () => {
    expect(canMoveTo(sixPm, "2026-11-24", now, LAGOS)).toBe(false)
    expect(canMoveTo(sixPm, "2026-11-23", now, LAGOS)).toBe(false)
  })

  test("a time exactly now has passed, as the server sees it", () => {
    expect(canMoveTo(reminder("2026-11-27T11:00:00.000Z"), "2026-11-25", now, LAGOS)).toBe(false)
  })

  test.each(["sent", "failed", "cancelled"] as const)("a %s reminder stays where it is", (status) => {
    expect(canMoveTo(reminder("2026-11-27T08:00:00.000Z", { status }), "2026-11-29", now, LAGOS)).toBe(false)
  })
})
