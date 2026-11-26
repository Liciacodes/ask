import { expect, test, type Page } from "@playwright/test"
import { addTextField, bar, command, commands, expectHighlighted, goHome, openBar, openShortcut, search, status } from "./helpers"

test.beforeEach(async ({ page }) => {
  await goHome(page)
})

const bottomGap = async (page: Page) => {
  const box = (await bar(page).boundingBox())!
  return page.viewportSize()!.height - (box.y + box.height)
}

test("the bar sits at the foot of the screen, centred and 600px wide, grows upward, and leaves the week in view", async ({ page }) => {
  await openBar(page)

  const box = (await bar(page).boundingBox())!
  expect(box.width).toBe(600)
  expect(box.x + box.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0)
  expect(await bottomGap(page)).toBeCloseTo(28, 0)
  await expect(page.locator('[data-slot="command-bar-backdrop"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")

  await page.keyboard.type("remind")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("textbox", { name: "Title" })).toBeFocused()
  await page.waitForFunction(() => document.getAnimations().length === 0)
  expect((await bar(page).boundingBox())!.height).toBeGreaterThan(box.height)
  expect(await bottomGap(page)).toBeCloseTo(28, 0)
})

test("on a phone the bar is a sheet across the bottom of the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openBar(page)

  const box = (await bar(page).boundingBox())!
  expect([box.x, box.width]).toEqual([0, 390])
  expect(await bottomGap(page)).toBeCloseTo(0, 0)
})

test("Ctrl+K opens the bar with the cursor in the search box", async ({ page }) => {
  await expect(bar(page)).toBeHidden()

  await page.keyboard.press(openShortcut)

  await expect(bar(page)).toBeVisible()
  await expect(search(page)).toBeFocused()
  await expect(search(page)).toHaveValue("")
  await expectHighlighted(page, commands(page).first())
})

test("arrow keys move the highlight and wrap at both ends", async ({ page }) => {
  await openBar(page)

  await page.keyboard.press("ArrowDown")
  await expectHighlighted(page, commands(page).nth(1))

  await page.keyboard.press("ArrowUp")
  await expectHighlighted(page, commands(page).first())

  await page.keyboard.press("ArrowUp")
  await expectHighlighted(page, commands(page).last())

  await page.keyboard.press("ArrowDown")
  await expectHighlighted(page, commands(page).first())

  await expect(search(page)).toBeFocused()
})

test("typing filters the list, and deleting the text brings everything back", async ({ page }) => {
  await openBar(page)
  const all = await commands(page).count()

  await page.keyboard.type("note")

  await expect(commands(page)).toHaveCount(2)
  await expect(commands(page).nth(0)).toHaveAccessibleName("Add note")
  await expect(commands(page).nth(1)).toHaveAccessibleName("Show notes")
  await expectHighlighted(page, command(page, "Add note"))

  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace")

  await expect(commands(page)).toHaveCount(all)
  await expectHighlighted(page, commands(page).first())
})

test("a search no command matches offers to ask instead", async ({ page }) => {
  await openBar(page)

  await page.keyboard.type("zzz")

  await expect(commands(page)).toHaveCount(1)
  await expectHighlighted(page, command(page, "Ask “zzz”"))
  await expect(page.getByText(/No commands match/)).toHaveCount(0)
})

test("asking isn't offered until you type something, and spaces don't count", async ({ page }) => {
  await openBar(page)
  const all = await commands(page).count()
  await expect(page.getByRole("option", { name: /^Ask/ })).toHaveCount(0)

  await page.keyboard.type("   ")

  await expect(commands(page)).toHaveCount(all)
  await expect(page.getByRole("option", { name: /^Ask/ })).toHaveCount(0)
  await expectHighlighted(page, commands(page).first())
})

test("Enter chooses the highlighted command, closes the bar and puts focus back", async ({ page }) => {
  const field = await addTextField(page)
  await field.click()
  await expect(status(page)).toBeEmpty()

  await openBar(page)
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")

  await expect(bar(page)).toBeHidden()
  await expect(status(page)).toHaveText("You chose Add note")
  await expect(field).toBeFocused()
})

test("Escape closes the bar and puts focus back, keeping half-typed text", async ({ page }) => {
  const field = await addTextField(page)
  await field.click()
  await page.keyboard.type("Buy mi")

  await openBar(page)
  await page.keyboard.type("rem")
  await page.keyboard.press("Escape")

  await expect(bar(page)).toBeHidden()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue("Buy mi")
  await expect(status(page)).toBeEmpty()

  await page.keyboard.type("lk")
  await expect(field).toHaveValue("Buy milk")
})

test("a click outside closes the bar and puts focus back", async ({ page }) => {
  const field = await addTextField(page)
  await field.click()

  await openBar(page)
  await page.mouse.click(8, 8)

  await expect(bar(page)).toBeHidden()
  await expect(field).toBeFocused()
  await expect(status(page)).toBeEmpty()
})

test("Ctrl+K again closes the bar and puts focus back", async ({ page }) => {
  const field = await addTextField(page)
  await field.click()

  await openBar(page)
  await page.keyboard.press(openShortcut)

  await expect(bar(page)).toBeHidden()
  await expect(field).toBeFocused()
})

test("Tab and Shift+Tab keep focus inside the bar", async ({ page }) => {
  await addTextField(page)

  await openBar(page)
  await page.keyboard.press("Tab")
  await expect(search(page)).toBeFocused()

  await page.keyboard.press("Shift+Tab")
  await expect(search(page)).toBeFocused()
})

test("the bar opens fresh each time", async ({ page }) => {
  await openBar(page)
  const all = await commands(page).count()
  await page.keyboard.type("note")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Escape")
  await expect(bar(page)).toBeHidden()

  await openBar(page)

  await expect(search(page)).toHaveValue("")
  await expect(commands(page)).toHaveCount(all)
  await expectHighlighted(page, commands(page).first())
})
