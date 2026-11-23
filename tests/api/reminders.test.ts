import { describe, expect, test } from "vitest"
import { DELETE, PATCH } from "@/app/api/reminders/[id]/route"
import { POST } from "@/app/api/reminders/route"
import { db } from "@/lib/db"
import { context, nextYear, request, saveReminder, setUpTestDatabase, TEST_VISITOR } from "./helpers"

setUpTestDatabase()

const valid = { title: "Buy milk", due_at: `${nextYear}-03-10T09:00:00+01:00`, timezone: "Africa/Lagos" }

const create = (body: unknown) => POST(request("POST", "/api/reminders", body))
const change = (id: string, body: unknown) => PATCH(request("PATCH", `/api/reminders/${id}`, body), context(id))
const remove = (id: string) => DELETE(request("DELETE", `/api/reminders/${id}`), context(id))

const someoneElse = { userId: "someone-else" }
const missingId = "0b8e4a4e-3f1c-4a7a-9d55-5b2f3b8c9e10"

describe("POST /api/reminders", () => {
  test("creates a pending reminder and stores its time in UTC", async () => {
    const response = await create(valid)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: "Buy milk",
      description: null,
      due_at: `${nextYear}-03-10T08:00:00.000Z`,
      timezone: "Africa/Lagos",
      status: "pending",
      sent_at: null,
      created_at: expect.any(String),
    })
    const saved = await db.reminder.findUniqueOrThrow({ where: { id: body.id } })
    expect(saved.userId).toBe(TEST_VISITOR)
    expect(saved.dueAt.toISOString()).toBe(`${nextYear}-03-10T08:00:00.000Z`)
  })

  test("keeps an optional description and trims spaces", async () => {
    const response = await create({ ...valid, title: "  Call mum  ", description: " About Sunday " })

    const body = await response.json()
    expect(body.title).toBe("Call mum")
    expect(body.description).toBe("About Sunday")
  })

  test.each([
    ["no title", { ...valid, title: undefined }, "title"],
    ["a blank title", { ...valid, title: "   " }, "title"],
    ["a time without an offset", { ...valid, due_at: `${nextYear}-03-10T09:00:00` }, "due_at"],
    ["a time in the past", { ...valid, due_at: "2020-01-01T09:00:00Z" }, "due_at"],
    ["an unknown timezone", { ...valid, timezone: "Mars/Olympus" }, "timezone"],
    ["a status", { ...valid, status: "sent" }, "status"],
  ])("refuses %s and saves nothing", async (_case, body, field) => {
    const response = await create(body)

    expect(response.status).toBe(400)
    const { issues } = await response.json()
    expect(issues).toEqual([expect.objectContaining({ field })])
    expect(await db.reminder.count()).toBe(0)
  })

  test("refuses a body that isn't JSON", async () => {
    const response = await create("title=Buy milk")

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Send the request body as JSON" })
  })
})

describe("PATCH /api/reminders/:id", () => {
  test("changes the title, description, time and timezone", async () => {
    const reminder = await saveReminder()

    const response = await change(reminder.id, {
      title: "Buy oat milk",
      description: "The blue carton",
      due_at: `${nextYear}-07-01T18:30:00+01:00`,
      timezone: "Europe/London",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      title: "Buy oat milk",
      description: "The blue carton",
      due_at: `${nextYear}-07-01T17:30:00.000Z`,
      timezone: "Europe/London",
      status: "pending",
    })
    const saved = await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })
    expect(saved.title).toBe("Buy oat milk")
  })

  test("changes only what it's sent", async () => {
    const reminder = await saveReminder({ description: "Semi-skimmed" })

    await change(reminder.id, { title: "Buy bread" })

    const saved = await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })
    expect(saved).toEqual({ ...reminder, title: "Buy bread" })
  })

  test("clears the description with null", async () => {
    const reminder = await saveReminder({ description: "Semi-skimmed" })

    const response = await change(reminder.id, { description: null })

    expect((await response.json()).description).toBeNull()
  })

  test("cancels a reminder, and un-cancels it", async () => {
    const reminder = await saveReminder()

    const cancelled = await change(reminder.id, { status: "cancelled" })
    expect((await cancelled.json()).status).toBe("cancelled")

    const restored = await change(reminder.id, { status: "pending" })
    expect((await restored.json()).status).toBe("pending")
  })

  test.each(["sent", "failed"])("refuses to set the status to %s", async (status) => {
    const reminder = await saveReminder()

    const response = await change(reminder.id, { status })

    expect(response.status).toBe(400)
    expect((await response.json()).issues).toEqual([
      { field: "status", message: "Status can only be pending or cancelled" },
    ])
  })

  test("refuses to change the status of a reminder that was already sent", async () => {
    const reminder = await saveReminder({ status: "sent", sentAt: new Date() })

    const response = await change(reminder.id, { status: "cancelled" })

    expect(response.status).toBe(409)
    expect((await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("sent")
  })

  test("refuses an empty change and a time in the past", async () => {
    const reminder = await saveReminder()

    expect((await change(reminder.id, {})).status).toBe(400)
    expect((await change(reminder.id, { due_at: "2020-01-01T09:00:00Z" })).status).toBe(400)
  })

  // What the week shows when it has to put a dragged card back.
  test("moving a reminder to a time that has just passed says why, and leaves it where it was", async () => {
    const reminder = await saveReminder()

    const response = await change(reminder.id, { due_at: new Date(Date.now() - 60_000).toISOString() })

    expect(response.status).toBe(400)
    expect((await response.json()).issues).toEqual([{ field: "due_at", message: "Pick a time in the future" }])
    expect(await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).toEqual(reminder)
  })

  test("answers 404 for a missing id, a malformed id, and another user's reminder", async () => {
    const theirs = await saveReminder(someoneElse)

    expect((await change(missingId, { title: "Mine now" })).status).toBe(404)
    expect((await change("not-an-id", { title: "Mine now" })).status).toBe(404)
    expect((await change(theirs.id, { title: "Mine now" })).status).toBe(404)
    expect((await db.reminder.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe("Buy milk")
  })
})

describe("DELETE /api/reminders/:id", () => {
  test("deletes the reminder for good", async () => {
    const reminder = await saveReminder()

    const response = await remove(reminder.id)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(await db.reminder.count()).toBe(0)
    expect((await remove(reminder.id)).status).toBe(404)
  })

  test("answers 404 for a malformed id and another user's reminder, and deletes nothing", async () => {
    const theirs = await saveReminder(someoneElse)

    expect((await remove("not-an-id")).status).toBe(404)
    expect((await remove(theirs.id)).status).toBe(404)
    expect(await db.reminder.count()).toBe(1)
  })
})
