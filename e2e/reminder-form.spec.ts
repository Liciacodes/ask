import { expect, test, type Page } from "@playwright/test"
import {
  addTextField,
  bar,
  command,
  expectHighlighted,
  fakeSave,
  goHome,
  openForm,
  openShortcut,
  saved,
  search,
  segment,
  status,
  title,
} from "./helpers"

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
  await goHome(page)
})

test("Create reminder opens a form with the cursor in the title, today's date and the next full hour", async ({ page }) => {
  await openForm(page)

  await expect(bar(page)).toBeVisible()
  await expect(search(page)).toBeHidden()
  await expect(segment(page, "Date", "day")).toHaveValue("18")
  await expect(segment(page, "Date", "month")).toHaveValue("11")
  await expect(segment(page, "Date", "year")).toHaveValue("2026")
  await expect(segment(page, "Time", "hour")).toHaveValue("11")
  await expect(segment(page, "Time", "minute")).toHaveValue("00")
})

test("Enter saves the reminder, closes the bar, puts focus back and shows what was saved", async ({ page }) => {
  const requests = await fakeSave(page)
  const field = await addTextField(page)
  await field.click()

  await openForm(page)
  await page.keyboard.type("Buy milk")
  await page.keyboard.press("Enter")

  await expect(bar(page)).toBeHidden()
  expect(requests).toEqual([{ title: "Buy milk", description: "", due_at: "2026-11-18T10:00:00.000Z", timezone: "Africa/Lagos", category: "shopping" }])
  await expect(status(page)).toHaveText("Saved Buy milk for Wed 18 Nov, 11:00")
  await expect(field).toBeFocused()
})

test("the date and time can be typed with the keyboard", async ({ page }) => {
  const requests = await fakeSave(page)

  await openForm(page)
  await page.keyboard.type("Dentist")
  await page.keyboard.press("Tab")
  await expect(segment(page, "Date", "day")).toBeFocused()
  await page.keyboard.type("20112026")
  await page.keyboard.press("Tab")
  await expect(segment(page, "Time", "hour")).toBeFocused()
  await page.keyboard.type("0930")
  await page.keyboard.press("Enter")

  await expect(bar(page)).toBeHidden()
  expect(requests).toEqual([{ title: "Dentist", description: "", due_at: "2026-11-20T08:30:00.000Z", timezone: "Africa/Lagos", category: "health" }])
})

test("an empty title is caught before anything is sent", async ({ page }) => {
  const requests = await fakeSave(page)

  await openForm(page)
  await page.keyboard.press("Enter")

  // In the bar: UI SDK also reads each field error out from a hidden live region, 100ms later, with the same words.
  await expect(bar(page).getByText("Add a title")).toBeVisible()
  await expect(title(page)).toBeFocused()
  expect(requests).toEqual([])
})

test("a problem the server finds shows under its field, and the form stays open", async ({ page }) => {
  await fakeSave(page, (route) =>
    route.fulfill({
      status: 400,
      json: { error: "Invalid request", issues: [{ field: "due_at", message: "Pick a time in the future" }] },
    })
  )

  await openForm(page)
  await page.keyboard.type("Buy milk")
  await page.keyboard.press("Enter")

  await expect(bar(page).getByText("Pick a time in the future")).toBeVisible()
  await expect(bar(page)).toBeVisible()
  await expect(status(page)).toBeEmpty()
})

test("a lost connection says so, and the form stays open", async ({ page }) => {
  await fakeSave(page, (route) => route.abort("internetdisconnected"))

  await openForm(page)
  await page.keyboard.type("Buy milk")
  await page.keyboard.press("Enter")

  await expect(page.getByRole("alert").filter({ hasText: "couldn't reach the server" })).toBeVisible()
  await expect(bar(page)).toBeVisible()
})

test("while saving, the button says so and a second Enter sends nothing more", async ({ page }) => {
  let answer = () => {}
  const held = new Promise<void>((resolve) => (answer = resolve))
  const requests = await fakeSave(page, async (route, sent) => {
    await held
    await saved(route, sent)
  })

  await openForm(page)
  await page.keyboard.type("Buy milk")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible()
  await page.keyboard.press("Enter")
  answer()

  await expect(bar(page)).toBeHidden()
  expect(requests).toHaveLength(1)
})

test("Esc goes back to the list, and a second Esc closes the bar", async ({ page }) => {
  const field = await addTextField(page)
  await field.click()

  await openForm(page)
  await page.keyboard.type("Half a thought")
  await page.keyboard.press("Escape")

  await expect(bar(page)).toBeVisible()
  await expect(search(page)).toBeFocused()
  await expectHighlighted(page, command(page, "Create reminder"))

  await page.keyboard.press("Escape")
  await expect(bar(page)).toBeHidden()
  await expect(field).toBeFocused()
})

test("Ctrl+K closes the bar from the form", async ({ page }) => {
  const field = await addTextField(page)
  await field.click()

  await openForm(page)
  await page.keyboard.press(openShortcut)

  await expect(bar(page)).toBeHidden()
  await expect(field).toBeFocused()
})

test("Tab moves through the form and stays inside the bar", async ({ page }) => {
  await addTextField(page)
  await openForm(page)

  for (const [field, unit] of [["Date", "day"], ["Date", "month"], ["Date", "year"], ["Time", "hour"], ["Time", "minute"]] as const) {
    await page.keyboard.press("Tab")
    await expect(segment(page, field, unit)).toBeFocused()
  }
  await page.keyboard.press("Tab")
  await expect(category(page)).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(title(page)).toBeFocused()
})

const category = (page: Page) => bar(page).getByRole("combobox", { name: "Category" })
const categoryOption = (page: Page, name: string) => page.getByRole("option", { name, exact: true })

test("the category follows the title's keyword guess as you type, and is saved with the reminder", async ({ page }) => {
  const requests = await fakeSave(page)

  await openForm(page)
  await expect(category(page)).toHaveText("Other")
  await page.keyboard.type("Call Dad")
  await expect(category(page)).toHaveText("Call")
  await title(page).fill("Dentist")
  await expect(category(page)).toHaveText("Health")
  await page.keyboard.press("Enter")

  await expect(bar(page)).toBeHidden()
  expect(requests.map((sent) => sent.category)).toEqual(["health"])
})

test("a category you pick stays when the title changes, and is the one saved", async ({ page }) => {
  const requests = await fakeSave(page)

  await openForm(page)
  await page.keyboard.type("Buy milk")
  await expect(category(page)).toHaveText("Shopping")
  await category(page).click()
  await categoryOption(page, "Food").click()
  await expect(category(page)).toHaveText("Food")
  await title(page).fill("Dentist")
  await expect(category(page)).toHaveText("Food")
  await title(page).press("Enter")

  await expect(bar(page)).toBeHidden()
  expect(requests.map((sent) => sent.category)).toEqual(["food"])
})

test("Esc with the category picker open closes only the picker; the next Esc goes back to the list", async ({ page }) => {
  await openForm(page)
  await category(page).click()
  await expect(categoryOption(page, "Food")).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(categoryOption(page, "Food")).toBeHidden()
  await expect(title(page)).toBeVisible()
  await expect(category(page)).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(search(page)).toBeFocused()
})
