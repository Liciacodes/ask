import { describe, expect, test } from "vitest"
import { calendarLink } from "@/lib/calendar-link"
import { instantAt } from "@/lib/time"

const ORIGIN = "https://ask.example"
const DUE = "2026-11-19T08:00:00.000Z"

// The link's fields as Google will read them, decoded.
const fields = (link: string) => Object.fromEntries(new URL(link).searchParams)

describe("calendarLink", () => {
  test("opens Google Calendar's new-event page with the title, a half-hour slot and the note", () => {
    const link = calendarLink({ title: "Dentist", due_at: DUE, description: "Bring the forms" }, ORIGIN)

    expect(link.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&")).toBe(true)
    expect(fields(link)).toEqual({
      action: "TEMPLATE",
      text: "Dentist",
      dates: "20261119T080000Z/20261119T083000Z",
      details: "Bring the forms\n\nAdded from Ask: https://ask.example",
    })
  })

  test("a title with & and # stays one title, and nothing after # is lost", () => {
    const link = calendarLink({ title: "Tea & cake #2", due_at: DUE, description: null }, ORIGIN)

    expect(fields(link).text).toBe("Tea & cake #2")
    expect(link).not.toContain("#")
    expect([...new URL(link).searchParams.keys()]).toEqual(["action", "text", "dates", "details"])
  })

  test("emoji are encoded and come back whole", () => {
    const link = calendarLink({ title: "Call Dad 📞", due_at: DUE, description: "Say happy birthday 🎂" }, ORIGIN)

    expect(link).toContain("%F0%9F%93%9E")
    expect(fields(link).text).toBe("Call Dad 📞")
    expect(fields(link).details).toBe("Say happy birthday 🎂\n\nAdded from Ask: https://ask.example")
  })

  test("a note's line breaks are kept, then a blank line and where it came from", () => {
    const link = calendarLink({ title: "Dentist", due_at: DUE, description: "Bring the forms\nand the insurance card" }, ORIGIN)

    expect(link).toContain("%0A")
    expect(fields(link).details).toBe("Bring the forms\nand the insurance card\n\nAdded from Ask: https://ask.example")
  })

  test("with no note, the details only say where it came from", () => {
    expect(fields(calendarLink({ title: "Dentist", due_at: DUE, description: null }, ORIGIN)).details).toBe("Added from Ask: https://ask.example")
    expect(fields(calendarLink({ title: "Dentist", due_at: DUE, description: "  " }, ORIGIN)).details).toBe("Added from Ask: https://ask.example")
  })

  test("00:30 in Lagos is 23:30 UTC the day before, and Google gets the UTC time", () => {
    const due_at = instantAt("2026-11-28", "00:30", "Africa/Lagos").toISOString()

    expect(due_at).toBe("2026-11-27T23:30:00.000Z")
    expect(fields(calendarLink({ title: "Night bus", due_at, description: null }, ORIGIN)).dates).toBe("20261127T233000Z/20261128T000000Z")
  })

  test("the event ends 30 minutes after it starts, across the hour", () => {
    const { dates } = fields(calendarLink({ title: "Gym", due_at: "2026-11-19T17:45:00.000Z", description: null }, ORIGIN))

    expect(dates).toBe("20261119T174500Z/20261119T181500Z")
  })
})
