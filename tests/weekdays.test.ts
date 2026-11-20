import { expect, test } from "vitest"
import { rightWeekdays } from "@/lib/agent/weekdays"

// Wednesday 18 November 2026, on the person's clock.
const TODAY = "2026-11-18"

test.each([
  // The two the real model got wrong.
  ["Your rent is due Friday December 1st at 09:00.", "Your rent is due Tuesday December 1st at 09:00."],
  ["The report is due Thursday 23 November at noon.", "The report is due Monday 23 November at noon."],
  ["Moved to Thu 23 Nov.", "Moved to Mon 23 Nov."],
  ["Set for Saturday, the 20th of November 2026.", "Set for Friday, the 20th of November 2026."],
  ["See you WEDNESDAY 3 DECEMBER.", "See you THURSDAY 3 DECEMBER."],
  ["That was monday 17 november.", "That was tuesday 17 november."],
  ["On Thursday (23 November) at 10:00.", "On Monday (23 November) at 10:00."],
  ["Tuesday, December 1, 2027 it is.", "Wednesday, December 1, 2027 it is."],
  ["Friday 20 November or Saturday 27 November?", "Friday 20 November or Friday 27 November?"],
])("puts the weekday right: “%s”", (said, fixed) => {
  expect(rightWeekdays(said, TODAY)).toBe(fixed)
})

test.each([
  "Do you mean Friday 20 November or Friday 27 November?",
  "Your rent is due Tuesday 1 December at 09:00.",
  "Sun 22 Nov at 16:00.",
  "You have the gym on Friday at 6pm.",
  "Pay rent on the 1st.",
  "Monday 31 November",
  "Your dentist is on Friday. 20 November is free.",
])("leaves alone a weekday that's right, or has no date beside it: “%s”", (said) => {
  expect(rightWeekdays(said, TODAY)).toBe(said)
})

test("without a year, the date is the one nearest today: at the end of December, 1 January is next year's", () => {
  expect(rightWeekdays("Monday 1 January", "2026-12-30")).toBe("Friday 1 January")
})
