import { expect, test, type Locator, type Page } from "@playwright/test"
import { fakeSave, goHome, openForm, reminder, status } from "./helpers"

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

const weekdays = [
  "Monday 16 November",
  "Tuesday 17 November",
  "Wednesday 18 November",
  "Thursday 19 November",
  "Friday 20 November",
  "Saturday 21 November",
  "Sunday 22 November",
]

const day = (page: Page, name: string) =>
  page.getByRole("list", { name: "Days this week" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name }) })

async function expectCards(day: Locator, cards: [time: string, title: string][]) {
  const items = day.getByRole("option")
  await expect(items).toHaveCount(cards.length)
  for (const [i, [time, title]] of cards.entries()) {
    await expect(items.nth(i).locator("time")).toHaveText(time)
    await expect(items.nth(i)).toContainText(title)
  }
}

test("shows Monday to Sunday of this week, and marks today", async ({ page }) => {
  await goHome(page)

  const headings = page.getByRole("heading", { level: 3 })
  await expect(headings).toHaveCount(7)
  for (const [i, name] of weekdays.entries()) await expect(headings.nth(i)).toHaveAccessibleName(name)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("November 2026")
  await expect(page.getByRole("region", { name: /^This week, 16\s*–\s*22 Nov$/ })).toBeVisible()
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1)
  await expect(day(page, "Wednesday 18 November")).toHaveAttribute("aria-current", "date")
})

test("each reminder sits in its own day, in time order, with its time and title", async ({ page }) => {
  await goHome(page, [
    reminder("Dentist", "2026-11-18T08:00:00Z"),
    reminder("Gym", "2026-11-18T07:00:00Z"),
    reminder("Call mum", "2026-11-20T17:30:00Z"),
    reminder("Just after midnight", "2026-11-15T23:30:00Z"),
  ])

  await expectCards(day(page, "Monday 16 November"), [["00:30", "Just after midnight"]])
  await expectCards(day(page, "Wednesday 18 November"), [["08:00", "Gym"], ["09:00", "Dentist"]])
  await expectCards(day(page, "Friday 20 November"), [["18:30", "Call mum"]])
  await expectCards(day(page, "Sunday 22 November"), [])
})

const box = async (locator: Locator) => (await locator.boundingBox())!
const middle = async (locator: Locator) => {
  const { y, height } = await box(locator)
  return y + height / 2
}
// How far a card sits below the top of its day's hours.
const topInDay = async (page: Page, dayName: string, title: string) =>
  (await box(day(page, dayName).getByRole("option").filter({ hasText: title }))).y - (await box(day(page, dayName).getByRole("listbox"))).y
const hourLabel = (page: Page, time: string) => page.getByText(time, { exact: true })

test("each card sits at its time: 48px an hour, so 15:30 is halfway between the 15:00 and 16:00 lines", async ({ page }) => {
  await goHome(page, [reminder("Gym", "2026-11-18T07:00:00Z"), reminder("Dentist", "2026-11-19T14:30:00Z")])

  expect(await topInDay(page, "Wednesday 18 November", "Gym")).toBeCloseTo(2, 0)
  expect(await topInDay(page, "Thursday 19 November", "Dentist")).toBeCloseTo(7.5 * 48 + 2, 0)
  const dentist = await box(day(page, "Thursday 19 November").getByRole("option"))
  expect(dentist.y - 2).toBeCloseTo(((await middle(hourLabel(page, "15:00"))) + (await middle(hourLabel(page, "16:00")))) / 2, 0)
})

test("two cards at the same time sit side by side, both whole and both reachable", async ({ page }) => {
  await goHome(page, [reminder("Gym", "2026-11-19T17:00:00Z"), reminder("Call dad", "2026-11-19T17:00:00Z")])

  const [gym, dad] = [
    day(page, "Thursday 19 November").getByRole("option", { name: "Gym, 18:00, exercise" }),
    day(page, "Thursday 19 November").getByRole("option", { name: "Call dad, 18:00, call" }),
  ]
  const [left, right] = [await box(gym), await box(dad)]
  expect(left.y).toBeCloseTo(right.y, 0)
  expect(left.x + left.width).toBeLessThanOrEqual(right.x)
  await expect(gym).toContainText("Gym")
  await expect(dad).toContainText("Call dad")

  await gym.focus()
  await page.keyboard.press("ArrowRight")
  await expect(dad).toBeFocused()
})

test("a 6:30 reminder starts the hours at 6:00, and one at 22:30 runs them to midnight", async ({ page }) => {
  await goHome(page, [reminder("Run", "2026-11-16T05:30:00Z"), reminder("Read", "2026-11-17T21:30:00Z")])

  await expect(hourLabel(page, "06:00")).toBeVisible()
  await expect(hourLabel(page, "05:00")).toHaveCount(0)
  await expect(hourLabel(page, "23:00")).toBeVisible()
  // Half an hour below the first line, 6:00.
  expect(await topInDay(page, "Monday 16 November", "Run")).toBeCloseTo(0.5 * 48 + 2, 0)
})

test("the now line is in today's column at the current minute, and hidden outside the hours shown", async ({ page }) => {
  await goHome(page)

  const line = page.locator("[data-now]")
  await expect(line).toHaveCount(1)
  await expect(day(page, "Wednesday 18 November").locator("[data-now]")).toHaveCount(1)
  const hours = await box(day(page, "Wednesday 18 November").getByRole("listbox"))
  expect((await box(line)).y - hours.y).toBeCloseTo((2 + 20 / 60) * 48, 0)

  await page.clock.setFixedTime(new Date("2026-11-18T07:30:00+01:00"))
  await page.reload()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(line).toHaveCount(0)
})

test("each card's name says its category, which its colour and icon show", async ({ page }) => {
  await goHome(page, [reminder("Dentist", "2026-11-19T08:00:00Z"), reminder("Pay rent", "2026-11-19T09:00:00Z")])

  const thursday = page.getByRole("listbox", { name: "Thursday 19 November" })
  await expect(thursday.getByRole("option").nth(0)).toHaveAccessibleName("Dentist, 09:00, health")
  // Other is the card's colour when nothing else fits, not a word worth hearing.
  await expect(thursday.getByRole("option").nth(1)).toHaveAccessibleName("Pay rent, 10:00")
})

test("a sent reminder shows a check, and a failed one says Not sent", async ({ page }) => {
  await goHome(page, [
    reminder("Invoice", "2026-11-16T08:00:00Z", { status: "sent", sent_at: "2026-11-16T08:00:01Z" }),
    reminder("Call mum", "2026-11-17T17:30:00Z", { status: "failed" }),
  ])

  await expect(day(page, "Monday 16 November").getByRole("img", { name: "Sent" })).toBeVisible()
  await expect(day(page, "Tuesday 17 November").getByText("Not sent")).toBeVisible()
  await expect(page.getByText("Not sent")).toHaveCount(1)
})

test("empty days stay quiet, and an empty week says so once", async ({ page }) => {
  await goHome(page)

  await expect(page.getByText("Nothing due this week")).toHaveCount(1)
  for (const name of weekdays) await expectCards(day(page, name), [])
  await expect(page.getByText(/couldn't load/)).toHaveCount(0)
})

test("if the week can't load, it says so, and Try again loads it", async ({ page }) => {
  let calls = 0
  await page.route("**/api/week?*", (route) =>
    ++calls === 1
      ? route.fulfill({ status: 500, json: { error: "Database unavailable" } })
      : route.fulfill({ json: { reminders: [reminder("Gym", "2026-11-18T07:00:00Z")] } })
  )
  await goHome(page, "already faked")

  await expect(page.getByText("Ask couldn't load this week. Check your connection and try again.")).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()

  await expectCards(day(page, "Wednesday 18 November"), [["08:00", "Gym"]])
  await expect(page.getByText(/couldn't load/)).toHaveCount(0)
})

test("a reminder saved for this week appears in its day, in time order", async ({ page }) => {
  await fakeSave(page)
  await goHome(page, [reminder("Gym", "2026-11-18T07:00:00Z"), reminder("Lunch with Ada", "2026-11-18T12:00:00Z")])

  await openForm(page)
  await page.keyboard.type("Dentist")
  await page.keyboard.press("Enter")

  await expectCards(day(page, "Wednesday 18 November"), [["08:00", "Gym"], ["11:00", "Dentist"], ["13:00", "Lunch with Ada"]])
  await expect(status(page)).toHaveText("Saved Dentist for Wed 18 Nov, 11:00")
  await expect(page.getByText("Nothing due this week")).toHaveCount(0)
})

test("a reminder saved for another week doesn't appear, and the status says when it's due", async ({ page }) => {
  await fakeSave(page)
  await goHome(page, [reminder("Gym", "2026-11-18T07:00:00Z")])

  await openForm(page)
  await page.keyboard.type("Dentist")
  await page.keyboard.press("Tab")
  await page.keyboard.type("02122026")
  await page.keyboard.press("Enter")

  await expect(status(page)).toHaveText("Saved Dentist for Wed 2 Dec, 11:00")
  await expect(page.getByRole("list", { name: "Days this week" }).getByText("Dentist")).toHaveCount(0)
  await expectCards(day(page, "Wednesday 18 November"), [["08:00", "Gym"]])
})

test("on a phone, the days stack and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await goHome(page, [reminder("Pick up the dry cleaning before the shop closes at noon", "2026-11-18T09:00:00Z")])

  let previousTop = -1
  for (const name of weekdays) {
    const box = await day(page, name).boundingBox()
    expect(box!.y).toBeGreaterThan(previousTop)
    previousTop = box!.y
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})

test("on a phone, today's cards line up with every other day's", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await goHome(page, [reminder("Gym", "2026-11-18T08:00:00Z"), reminder("Dentist", "2026-11-19T08:00:00Z")])

  const [today, tomorrow] = [await box(day(page, "Wednesday 18 November").getByRole("option")), await box(day(page, "Thursday 19 November").getByRole("option"))]
  expect(today.x).toBe(tomorrow.x)
  expect(today.width).toBe(tomorrow.width)
})
