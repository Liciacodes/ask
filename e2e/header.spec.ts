import { expect, test } from "@playwright/test"
import { askButton, bar, command, fakeSave, goHome, openShortcut, search, status, title } from "./helpers"

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

test("the header names the week's month and offers Ask with its shortcut", async ({ page }) => {
  await goHome(page)

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("November 2026")
  // The shortcut comes wrapped in invisible marks that keep it left to right inside right-to-left text.
  await expect(askButton(page)).toHaveAccessibleName(/^Ask anything ⁦?(Ctrl\+K|⌘K)⁩?$/)
})

test("a week across two months names both", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-02T10:20:00+01:00"))
  await goHome(page)

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Nov\s*–\s*Dec 2026$/)
})

test("Ask anything opens the bar with a pointer, and closing it puts focus back on the button", async ({ page }) => {
  await goHome(page)

  await askButton(page).click()
  await expect(bar(page)).toBeVisible()
  await expect(search(page)).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(bar(page)).toBeHidden()
  await expect(askButton(page)).toBeFocused()
})

test("from the keyboard, Tab reaches Ask anything and Enter opens the bar; Ctrl+K still opens it too", async ({ page }) => {
  await goHome(page)

  await page.keyboard.press("Tab")
  await expect(askButton(page)).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(search(page)).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(bar(page)).toBeHidden()
  await page.keyboard.press(openShortcut)
  await expect(search(page)).toBeFocused()
})

test("a reminder saved from a bar the button opened is still read out in the status line", async ({ page }) => {
  await fakeSave(page)
  await goHome(page)

  await askButton(page).click()
  await command(page, "Create reminder").click()
  await title(page).fill("Buy milk")
  await page.keyboard.press("Enter")

  await expect(status(page)).toHaveText("Saved Buy milk for Wed 18 Nov, 11:00")
})
