import { expect, test } from "vitest"
import { whichWeek } from "@/lib/agent/which-week"

// Wednesday 18 November, 10:20 in Lagos.
const WEDNESDAY = new Date("2026-11-18T10:20:00+01:00")

test.each([
  ["dentist next Friday at 9am", "Do you mean Friday 20 November or Friday 27 November?"],
  ["next fri at 9", "Do you mean Friday 20 November or Friday 27 November?"],
  ["call dad next Monday at 9.30", "Do you mean Monday 23 November or Monday 30 November?"],
  ["Next THURSDAY gym", "Do you mean Thursday 19 November or Thursday 26 November?"],
  ["next wednesday standup", "Do you mean Wednesday 25 November or Wednesday 2 December?"],
])("“%s” leaves the week open: %s", (said, question) => {
  expect(whichWeek(said, WEDNESDAY, "Africa/Lagos")).toBe(question)
})

test.each([
  "dentist next Friday the 27th at 9am",
  "dentist next Friday, 27 November",
  "dentist next Friday (Nov 27)",
  "dentist next Friday 27/11",
  "dentist next Friday 2026-11-27",
  "dentist on Friday at 9am",
  "dentist this Friday at 9am",
  "dentist next week",
])("“%s” settles it, or never left it open", (said) => {
  expect(whichWeek(said, WEDNESDAY, "Africa/Lagos")).toBeUndefined()
})

test("said on a Friday, next Friday is a week or two away", () => {
  expect(whichWeek("next Friday", new Date("2026-11-20T10:00:00+01:00"), "Africa/Lagos")).toBe(
    "Do you mean Friday 27 November or Friday 4 December?"
  )
})

test("the days are counted on the person's own clock", () => {
  // 23:30 on Thursday in Lagos is already Friday in Tokyo.
  const thursdayNight = new Date("2026-11-19T23:30:00+01:00")
  expect(whichWeek("next Friday", thursdayNight, "Africa/Lagos")).toBe("Do you mean Friday 20 November or Friday 27 November?")
  expect(whichWeek("next Friday", thursdayNight, "Asia/Tokyo")).toBe("Do you mean Friday 27 November or Friday 4 December?")
})
