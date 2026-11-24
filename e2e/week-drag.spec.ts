import { expect, test, type Locator, type Page } from "@playwright/test"
import { fakeMove, goHome, reminder, status } from "./helpers"

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

// Wednesday 18 November, 10:20 in Lagos: Monday and Tuesday have passed, and so has 09:00 today.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

const dentist = reminder("Dentist", "2026-11-19T08:00:00.000Z")

const day = (page: Page, name: string) =>
  page.getByRole("list", { name: "Days this week" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name }) })
const card = (page: Page, dayName: string, title: string) => day(page, dayName).getByRole("option").filter({ hasText: title })

const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 60) }
}

const below = async (locator: Locator) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height + 12 }
}

// Presses the card, drags it over the day (or to a point), and either lets go or keeps holding it.
async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }, { release = true } = {}) {
  const start = await centre(from)
  const end = "x" in to ? to : await centre(to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  if (release) await page.mouse.up()
}

test("dragging a card to a later day moves it there at the same time, and saves it", async ({ page }) => {
  const requests = await fakeMove(page, [dentist])
  await goHome(page, [dentist])

  await drag(page, card(page, "Thursday 19 November", "Dentist"), day(page, "Friday 20 November"))

  await expect(card(page, "Friday 20 November", "Dentist").locator("time")).toHaveText("09:00")
  await expect(card(page, "Thursday 19 November", "Dentist")).toHaveCount(0)
  await expect(status(page)).toHaveText("Moved Dentist to Fri 20 Nov, 09:00")
  expect(requests).toEqual([{ id: dentist.id, due_at: "2026-11-20T08:00:00.000Z" }])
})

test("if the server refuses, the card goes back to its day and the week says why", async ({ page }) => {
  let refuse = () => {}
  const answered = new Promise<void>((resolve) => (refuse = resolve))
  await fakeMove(page, [dentist], async (route) => {
    await answered
    await route.fulfill({ status: 400, json: { error: "Invalid request", issues: [{ field: "due_at", message: "Pick a time in the future" }] } })
  })
  await goHome(page, [dentist])

  await drag(page, card(page, "Thursday 19 November", "Dentist"), day(page, "Friday 20 November"))

  // It shows in its new day straight away, while the server decides.
  await expect(card(page, "Friday 20 November", "Dentist")).toBeVisible()
  refuse()
  await expect(card(page, "Thursday 19 November", "Dentist")).toBeVisible()
  await expect(card(page, "Friday 20 November", "Dentist")).toHaveCount(0)
  await expect(status(page)).toHaveText("Couldn't move Dentist: Pick a time in the future.")
})

test("a lost connection puts the card back too, and says so", async ({ page }) => {
  await fakeMove(page, [dentist], (route) => route.abort())
  await goHome(page, [dentist])

  await drag(page, card(page, "Thursday 19 November", "Dentist"), day(page, "Saturday 21 November"))

  await expect(card(page, "Thursday 19 November", "Dentist")).toBeVisible()
  await expect(status(page)).toHaveText("Couldn't move Dentist: Ask couldn't reach the server. Check your connection and try again.")
})

test("a day that has passed, and today after the card's time, fade back and won't take it", async ({ page }) => {
  const requests = await fakeMove(page, [dentist])
  await goHome(page, [dentist])

  await drag(page, card(page, "Thursday 19 November", "Dentist"), day(page, "Tuesday 17 November"), { release: false })
  await expect(day(page, "Monday 16 November")).toHaveAttribute("data-refuses", "")
  await expect(day(page, "Tuesday 17 November")).toHaveAttribute("data-refuses", "")
  await expect(day(page, "Wednesday 18 November")).toHaveAttribute("data-refuses", "")
  await expect(day(page, "Friday 20 November")).not.toHaveAttribute("data-refuses")
  await page.mouse.up()

  await drag(page, card(page, "Thursday 19 November", "Dentist"), day(page, "Wednesday 18 November"))

  await expect(card(page, "Thursday 19 November", "Dentist")).toBeVisible()
  await expect(day(page, "Tuesday 17 November")).not.toHaveAttribute("data-refuses")
  expect(requests).toEqual([])
})

test("a card dropped back on its own day, even below another, sends nothing and keeps time order", async ({ page }) => {
  const later = reminder("Gym", "2026-11-19T17:00:00.000Z")
  const requests = await fakeMove(page, [dentist, later])
  await goHome(page, [dentist, later])

  await drag(page, card(page, "Thursday 19 November", "Dentist"), await below(card(page, "Thursday 19 November", "Gym")))

  await expect(day(page, "Thursday 19 November").getByRole("option")).toHaveText([/Dentist/, /Gym/])
  expect(requests).toEqual([])
})

test("a sent reminder stays where it is, and a card can't be picked up again while its move saves", async ({ page }) => {
  const sent = reminder("Pay rent", "2026-11-19T07:00:00.000Z", { status: "sent", sent_at: "2026-11-19T07:00:00.000Z" })
  let answer = () => {}
  const answered = new Promise<void>((resolve) => (answer = resolve))
  const requests = await fakeMove(page, [dentist, sent], async (route, move) => {
    await answered
    await route.fulfill({ json: { ...dentist, due_at: move.due_at } })
  })
  await goHome(page, [dentist, sent])

  await drag(page, card(page, "Thursday 19 November", "Pay rent"), day(page, "Friday 20 November"))
  await drag(page, card(page, "Thursday 19 November", "Dentist"), day(page, "Friday 20 November"))
  await drag(page, card(page, "Friday 20 November", "Dentist"), day(page, "Saturday 21 November"))
  answer()

  await expect(status(page)).toHaveText("Moved Dentist to Fri 20 Nov, 09:00")
  await expect(card(page, "Thursday 19 November", "Pay rent")).toBeVisible()
  expect(requests.map((move) => move.due_at)).toEqual(["2026-11-20T08:00:00.000Z"])
})

// What screen readers hear as a card is picked up and moved: UI SDK's announcer, not Next's route announcer.
const announced = (page: Page) => page.locator("[data-ui-sdk-announcer]")

test("with the keyboard, Space picks a card up, Right carries it to the next day, and Space drops and saves it", async ({ page }) => {
  const requests = await fakeMove(page, [dentist])
  await goHome(page, [dentist])
  await card(page, "Thursday 19 November", "Dentist").focus()

  await page.keyboard.press("Space")
  await expect(announced(page)).toHaveText("Dentist, 09:00, health, picked up. Left and Right choose a day, Space drops it, Escape puts it back.")
  await expect(card(page, "Thursday 19 November", "Dentist")).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("ArrowRight")
  await expect(announced(page)).toHaveText("Friday 20 November")
  await page.keyboard.press("Space")

  await expect(status(page)).toHaveText("Moved Dentist to Fri 20 Nov, 09:00")
  await expect(card(page, "Friday 20 November", "Dentist")).toBeFocused()
  expect(requests).toEqual([{ id: dentist.id, due_at: "2026-11-20T08:00:00.000Z" }])
})

test("Left stops at today: days that have passed are skipped, and today takes a card whose time is still ahead", async ({ page }) => {
  const gym = reminder("Gym", "2026-11-20T17:00:00.000Z")
  const requests = await fakeMove(page, [gym])
  await goHome(page, [gym])
  await card(page, "Friday 20 November", "Gym").focus()

  await page.keyboard.press("Space")
  for (let press = 0; press < 4; press++) await page.keyboard.press("ArrowLeft")
  await expect(announced(page)).toHaveText("Wednesday 18 November")
  await page.keyboard.press("Space")

  await expect(status(page)).toHaveText("Moved Gym to Wed 18 Nov, 18:00")
  expect(requests).toEqual([{ id: gym.id, due_at: "2026-11-18T17:00:00.000Z" }])
})

test("Escape puts a picked-up card back, and so does Tab, which moves on: neither saves anything", async ({ page }) => {
  const requests = await fakeMove(page, [dentist])
  await goHome(page, [dentist])
  const thursday = card(page, "Thursday 19 November", "Dentist")
  await thursday.focus()

  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Escape")
  await expect(announced(page)).toHaveText("Dentist, 09:00, health back on Thursday 19 November.")
  await expect(thursday).toBeFocused()

  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Tab")
  await expect(thursday).toBeVisible()
  await expect(thursday).not.toBeFocused()
  expect(requests).toEqual([])
})

test("the week is one tab stop, the arrows move between cards, and a sent card can be read but not picked up", async ({ page }) => {
  const sent = reminder("Pay rent", "2026-11-19T07:00:00.000Z", { status: "sent", sent_at: "2026-11-19T07:00:00.000Z" })
  const gym = reminder("Gym", "2026-11-20T17:00:00.000Z")
  const requests = await fakeMove(page, [dentist, sent, gym])
  await goHome(page, [dentist, sent, gym])
  const rent = card(page, "Thursday 19 November", "Pay rent")

  await expect(page.locator('[data-slot="week-board-card"][tabindex="0"]')).toHaveCount(1)
  await rent.focus()
  await page.keyboard.press("Space")
  await expect(rent).toHaveAttribute("aria-selected", "false")
  await page.keyboard.press("ArrowDown")
  await expect(card(page, "Thursday 19 November", "Dentist")).toBeFocused()
  await page.keyboard.press("ArrowRight")
  await expect(card(page, "Friday 20 November", "Gym")).toBeFocused()

  await expect(page.locator('[data-slot="week-board-card"][tabindex="0"]')).toHaveCount(1)
  expect(requests).toEqual([])
})

test("while a card is picked up, Up, Down and End do nothing: a day keeps its time order", async ({ page }) => {
  const gym = reminder("Gym", "2026-11-19T17:00:00.000Z")
  const requests = await fakeMove(page, [dentist, gym])
  await goHome(page, [dentist, gym])
  await card(page, "Thursday 19 November", "Dentist").focus()

  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("End")
  await expect(announced(page)).toHaveText(/picked up/)
  await page.keyboard.press("Space")

  await expect(day(page, "Thursday 19 November").getByRole("option")).toHaveText([/Dentist/, /Gym/])
  expect(requests).toEqual([])
})

test("each day's cards are a list named after the day, and a card that can move says how", async ({ page }) => {
  const sent = reminder("Pay rent", "2026-11-19T07:00:00.000Z", { status: "sent", sent_at: "2026-11-19T07:00:00.000Z" })
  await goHome(page, [dentist, sent])

  const thursday = page.getByRole("listbox", { name: "Thursday 19 November" })
  await expect(thursday.getByRole("option")).toHaveCount(2)
  await expect(thursday.getByRole("option", { name: /Dentist/ })).toHaveAccessibleDescription("Press Enter to edit it, or Space to move it to another day.")
  await expect(thursday.getByRole("option", { name: /Pay rent/ })).not.toHaveAttribute("aria-describedby")
})
