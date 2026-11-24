import { describe, expect, test } from "vitest"
import { monthTitle } from "@/components/week/days"

const LAGOS = "Africa/Lagos"

describe("monthTitle", () => {
  test("a week inside one month names it in full", () => {
    expect(monthTitle(new Date("2026-11-16T11:00:00Z"), new Date("2026-11-22T11:00:00Z"), LAGOS, "en-GB")).toBe("November 2026")
  })

  test("a week across two months names both, short, with the year once", () => {
    expect(monthTitle(new Date("2026-11-30T11:00:00Z"), new Date("2026-12-06T11:00:00Z"), LAGOS, "en-GB")).toMatch(/^Nov\s*–\s*Dec 2026$/)
  })

  test("a week across two years names both years", () => {
    expect(monthTitle(new Date("2026-12-28T11:00:00Z"), new Date("2027-01-03T11:00:00Z"), LAGOS, "en-GB")).toMatch(/^Dec 2026\s*–\s*Jan 2027$/)
  })

  test("the months are the person's: late on 30 November in UTC is already 1 December in Auckland", () => {
    expect(monthTitle(new Date("2026-11-30T23:30:00Z"), new Date("2026-12-06T11:00:00Z"), "Pacific/Auckland", "en-GB")).toBe("December 2026")
  })
})
