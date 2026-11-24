import { expect, test, type Locator, type Page } from "@playwright/test"
import { fakeAgent, proposes, turn } from "./fake-agent"
import { bar, fakeMove, fakeSave, goHome, openForm, reminder, status, title } from "./helpers"

// A note on a reminder, and a card opened from the week in the same form, to edit.

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

// Wednesday 18 November, 10:20 in Lagos.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

const day = (page: Page, name: string) =>
  page.getByRole("list", { name: "Days this week" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name }) })
const thursday = (page: Page) => day(page, "Thursday 19 November")
const note = (page: Page) => page.getByRole("textbox", { name: "Note" })
const category = (page: Page) => bar(page).getByRole("combobox", { name: "Category" })

const dentist = reminder("Dentist", "2026-11-19T08:00:00.000Z", { description: "Bring the forms" })
const dentistCard = (page: Page) => thursday(page).getByRole("option", { name: /^Dentist/ })

async function drag(page: Page, from: Locator, to: Locator) {
  const start = (await from.boundingBox())!
  const end = (await to.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, start.y + start.height / 2, { steps: 12 })
  await page.mouse.up()
}

test("the form's note is saved as the reminder's description", async ({ page }) => {
  const requests = await fakeSave(page)
  await goHome(page)
  await openForm(page)

  await title(page).fill("Dentist")
  await note(page).fill("Bring the forms")
  await title(page).press("Enter")

  await expect(status(page)).toContainText("Saved Dentist")
  expect(requests.map((sent) => sent.description)).toEqual(["Bring the forms"])
})

test("in the grid, a card with a note shows an icon that shows the note on hover, and its name has the whole note", async ({ page }) => {
  await goHome(page, [dentist])

  await expect(dentistCard(page)).toHaveAccessibleName("Dentist, 09:00, health, note: Bring the forms")
  await expect(dentistCard(page).locator("[data-note-icon]")).toBeVisible()
  await expect(dentistCard(page).locator("[data-note-icon]")).toHaveAttribute("title", "Bring the forms")
  await expect(dentistCard(page).locator("[data-note]")).toBeHidden()
})

test("on a phone, a card shows its note on one line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const long = reminder("Dentist", "2026-11-19T08:00:00.000Z", { description: "Bring the forms, the insurance card and the old X-rays from last year" })
  await goHome(page, [long])

  const line = dentistCard(page).locator("[data-note]")
  await expect(line).toBeVisible()
  await expect(line).toHaveCSS("white-space", "nowrap")
  await expect(line).toHaveCSS("text-overflow", "ellipsis")
  await expect(dentistCard(page).locator("[data-note-icon]")).toBeHidden()
})

test("the bar's card shows a note the AI added, under the date and time", async ({ page }) => {
  const input = { title: "Call Ada", description: "Ask about his trip", date: "2026-11-20", time: "18:00", category: "call" }
  await fakeAgent(page, turn(proposes("createReminder", input, { action: "create", reminder: { ...input, category: "call" } })))
  await goHome(page)
  await page.keyboard.press("ControlOrMeta+k")
  await page.keyboard.type("call ada friday at 6pm, ask about his trip")
  await page.keyboard.press("Enter")

  const card = bar(page).getByRole("region", { name: "New reminder" })
  await expect(card).toContainText("Ask about his trip")
  const text = (await card.textContent())!
  expect(text.indexOf("Ask about his trip")).toBeGreaterThan(text.indexOf("Friday"))
})

test("a click opens a card in the form, filled in, and Save changes saves what changed", async ({ page }) => {
  const requests = await fakeMove(page, [dentist])
  await goHome(page, [dentist])

  await dentistCard(page).click()

  await expect(bar(page)).toBeVisible()
  await expect(bar(page).getByText("Edit reminder")).toBeVisible()
  await expect(title(page)).toHaveValue("Dentist")
  await expect(note(page)).toHaveValue("Bring the forms")
  await expect(category(page)).toContainText("Health")
  await expect(bar(page).locator('input[name="date"]')).toHaveValue("2026-11-19")
  await expect(bar(page).locator('input[name="time"]')).toHaveValue("09:00")
  await expect(bar(page).getByRole("button", { name: "Save changes" })).toBeVisible()

  await title(page).fill("Dentist check-up")
  await title(page).press("Enter")

  await expect(status(page)).toHaveText("Changed Dentist check-up, now Thu 19 Nov, 09:00")
  await expect(thursday(page).getByRole("option", { name: /^Dentist check-up/ })).toHaveAttribute("data-newest", "")
  // The time didn't change, so it isn't sent.
  expect(requests).toEqual([{ id: dentist.id, title: "Dentist check-up", description: "Bring the forms", category: "health" }])
})

test("Enter opens a focused card, Esc closes it back to the card, and Space still picks it up", async ({ page }) => {
  await goHome(page, [dentist])
  await dentistCard(page).focus()

  await page.keyboard.press("Enter")
  await expect(title(page)).toHaveValue("Dentist")
  await page.keyboard.press("Escape")
  await expect(bar(page)).toHaveCount(0)
  await expect(dentistCard(page)).toBeFocused()

  await page.keyboard.press("Space")
  await expect(dentistCard(page)).toHaveAttribute("aria-selected", "true")
  await expect(bar(page)).toHaveCount(0)
})

test("a drag still moves a card, and doesn't open it", async ({ page }) => {
  const requests = await fakeMove(page, [dentist])
  await goHome(page, [dentist])

  await drag(page, dentistCard(page), day(page, "Friday 20 November"))

  await expect(day(page, "Friday 20 November").getByRole("option", { name: /^Dentist/ })).toBeVisible()
  expect(requests).toEqual([{ id: dentist.id, due_at: "2026-11-20T08:00:00.000Z" }])
  await expect(bar(page)).toHaveCount(0)
})

test("a sent reminder doesn't open", async ({ page }) => {
  const sent = reminder("Pay rent", "2026-11-18T08:00:00.000Z", { status: "sent", sent_at: "2026-11-18T08:00:01.000Z" })
  await goHome(page, [sent])

  await day(page, "Wednesday 18 November").getByRole("option").click()

  await expect(bar(page)).toHaveCount(0)
})

test("a saved category counts as picked: editing the title never guesses it again", async ({ page }) => {
  const milk = reminder("Buy milk", "2026-11-19T08:00:00.000Z", { category: "food" })
  const requests = await fakeMove(page, [milk])
  await goHome(page, [milk])
  await thursday(page).getByRole("option").click()
  await expect(category(page)).toContainText("Food")

  // "Buy" alone would guess shopping.
  await title(page).fill("Buy oat milk")
  await expect(category(page)).toContainText("Food")
  await title(page).press("Enter")

  await expect(status(page)).toContainText("Changed Buy oat milk")
  expect(requests[0].category).toBe("food")
})
