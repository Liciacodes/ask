import { describe, expect, test } from "vitest"
import { canonicalTimeZone, weekRange } from "@/lib/time"

const week = (now: string, timeZone: string) => {
  const { from, to } = weekRange(new Date(now), timeZone)
  return { from: from.toISOString(), to: to.toISOString() }
}

describe("weekRange", () => {
  test("a Lagos week runs from Monday 00:00 to the next Monday 00:00, Lagos time", () => {
    expect(week("2026-11-18T12:00:00Z", "Africa/Lagos")).toEqual({
      from: "2026-11-15T23:00:00.000Z",
      to: "2026-11-22T23:00:00.000Z",
    })
  })

  test("Sunday 23:30 in Lagos is still this week; Monday 00:00 starts the next", () => {
    expect(week("2026-11-22T22:30:00Z", "Africa/Lagos").from).toBe("2026-11-15T23:00:00.000Z")
    expect(week("2026-11-22T23:00:00Z", "Africa/Lagos").from).toBe("2026-11-22T23:00:00.000Z")
    expect(week("2026-11-22T23:30:00Z", "Africa/Lagos").from).toBe("2026-11-22T23:00:00.000Z")
  })

  test("the week follows the date in the given timezone, not in UTC", () => {
    expect(week("2026-11-16T05:00:00Z", "America/Los_Angeles")).toEqual({
      from: "2026-11-09T08:00:00.000Z",
      to: "2026-11-16T08:00:00.000Z",
    })
  })

  test("a week with a daylight saving change is 167 hours long", () => {
    expect(week("2026-03-25T12:00:00Z", "Europe/London")).toEqual({
      from: "2026-03-23T00:00:00.000Z",
      to: "2026-03-29T23:00:00.000Z",
    })
  })
})

describe("canonicalTimeZone", () => {
  test("accepts any capitalisation and answers with the standard name", () => {
    expect(canonicalTimeZone("africa/lagos")).toBe("Africa/Lagos")
  })

  test("refuses unknown names and bare offsets", () => {
    expect(canonicalTimeZone("Mars/Olympus")).toBeNull()
    expect(canonicalTimeZone("+01:00")).toBeNull()
  })
})
