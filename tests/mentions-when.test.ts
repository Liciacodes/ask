import { describe, expect, test } from "vitest"
import { mentionsWhen } from "@/lib/agent/mentions-when"

describe("a message that says when", () => {
  test.each([
    // Clock times
    "Book a table for dinner at 7pm",
    "standup 10 am",
    "call Ada at 9.30pm",
    "pills at 6:15 p.m.",
    "pick up the kids 18:00",
    "gym at 7",
    "meeting at 9.30",
    "lunch at noon",
    "lunch at midday",
    "renew the domain before midnight",
    "wake me at 6 o'clock",
    // Day words
    "pay rent today",
    "call Ada tonight",
    "dentist tomorrow",
    "Book a table for dinner Friday",
    "gym on Mondays",
    "WEDNESDAY standup",
    // Dates
    "book flights on 3 December",
    "pay rent on the 1st",
    "party on Dec 3",
    "submit it by 27/11",
    "renewal 2026-12-03",
    // Spans from now
    "check the oven in 20 minutes",
    "call back in 2 hours",
    "stretch in an hour",
    "take the cake out in half an hour",
    "follow up in a few days",
  ])("“%s”", (said) => {
    expect(mentionsWhen(said)).toBe(true)
  })
})

describe("a message that doesn't", () => {
  test.each([
    "asdfgh",
    "do the thing",
    "what's the weather",
    "the sun is out",
    "I sat down",
    "I may go",
    "I have 2 cats",
    "remind me to call Ada",
    "",
  ])("“%s”", (said) => {
    expect(mentionsWhen(said)).toBe(false)
  })
})
