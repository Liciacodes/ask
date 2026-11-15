import { describe, expect, test } from "vitest"
import { GET } from "@/app/api/week/route"
import { weekRange } from "@/lib/time"
import { request, saveReminder, setUpTestDatabase } from "./helpers"

setUpTestDatabase()

const week = (timezone?: string) =>
  GET(request("GET", timezone === undefined ? "/api/week" : `/api/week?timezone=${encodeURIComponent(timezone)}`))

const later = (date: Date, ms: number) => new Date(date.getTime() + ms)
const hour = 3_600_000

describe("GET /api/week", () => {
  test("lists this week's reminders soonest first, leaving out cancelled ones, other weeks and other users", async () => {
    const { from, to } = weekRange(new Date(), "Africa/Lagos")
    const lastMoment = await saveReminder({ title: "Last moment", dueAt: later(to, -1) })
    const firstMoment = await saveReminder({ title: "First moment", dueAt: from })
    const sent = await saveReminder({ title: "Sent", dueAt: later(from, 2 * hour), status: "sent" })
    await saveReminder({ title: "Last week", dueAt: later(from, -1) })
    await saveReminder({ title: "Next week", dueAt: to })
    await saveReminder({ title: "Cancelled", dueAt: later(from, hour), status: "cancelled" })
    await saveReminder({ title: "Someone else's", dueAt: later(from, 3 * hour), userId: "someone-else" })

    const response = await week("Africa/Lagos")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ timezone: "Africa/Lagos", from: from.toISOString(), to: to.toISOString() })
    expect(body.reminders.map((r: { id: string }) => r.id)).toEqual([firstMoment.id, sent.id, lastMoment.id])
  })

  test("answers with the standard timezone name", async () => {
    const body = await (await week("africa/lagos")).json()

    expect(body.timezone).toBe("Africa/Lagos")
  })

  test.each([
    ["a missing timezone", undefined, "Add a timezone, like Africa/Lagos"],
    ["an unknown timezone", "Mars/Olympus", "Unknown timezone. Use a name like Africa/Lagos"],
  ])("refuses %s", async (_case, timezone, message) => {
    const response = await week(timezone)

    expect(response.status).toBe(400)
    expect((await response.json()).issues).toEqual([{ field: "timezone", message }])
  })
})
