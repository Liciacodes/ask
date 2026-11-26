import { expect, test, type Locator, type Page } from "@playwright/test"
import { goHome } from "./helpers"

// The privacy and terms pages, and the footer that links to them from every page.

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

const legal = (page: Page) => page.getByRole("navigation", { name: "Legal" })

// Tab from the top of the page until `target` has focus, the way a keyboard user gets there.
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 15; presses++) {
    await page.keyboard.press("Tab")
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error("Tab never reached the link")
}

test("the week's footer links to Privacy and Terms, and each page links back to Ask", async ({ page }) => {
  await goHome(page)

  await legal(page).getByRole("link", { name: "Privacy" }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page).toHaveTitle("Privacy · Ask")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy")
  await expect(legal(page).getByRole("link", { name: "Privacy" })).toHaveAttribute("aria-current", "page")

  await legal(page).getByRole("link", { name: "Terms" }).click()
  await expect(page).toHaveURL(/\/terms$/)
  await expect(page).toHaveTitle("Terms · Ask")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms")

  await page.getByRole("link", { name: "Back to Ask" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("November 2026")
})

test("both pages say who runs Ask and how to reach them, and what was agreed", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path)
    await expect(page.getByRole("article")).toContainText("Felicia Udosen")
    await expect(page.getByRole("link", { name: "udosenfelicia@gmail.com" }).first()).toHaveAttribute("href", "mailto:udosenfelicia@gmail.com")
  }

  await page.goto("/privacy")
  await expect(page.getByRole("article")).toContainText("deleted within 30 days")
  await expect(page.getByRole("article")).toContainText("Groq")
  // Nigeria's Data Protection Act 2023 counts anyone under 18 as a child.
  await expect(page.getByRole("article")).toContainText("isn't meant for anyone under 18")
  await page.goto("/terms")
  await expect(page.getByRole("article")).toContainText("governed by the laws of Nigeria")
  await expect(page.getByRole("article")).toContainText("at least 18")
})

test("reading them asks Ask's server for nothing, so they set no cookie", async ({ page, context }) => {
  const asked: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) asked.push(request.url())
  })

  await page.goto("/privacy")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy")
  await page.goto("/terms")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms")

  expect(asked).toEqual([])
  expect(await context.cookies()).toEqual([])
})

test("the footer's links are 44px tap targets, and Tab reaches them with a visible focus ring", async ({ page }) => {
  await page.goto("/privacy")
  const terms = legal(page).getByRole("link", { name: "Terms" })

  const box = (await terms.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  await tabTo(page, terms)
  await expect(terms).toHaveCSS("outline-style", "solid")
  await expect(terms).toHaveCSS("outline-width", "2px")
})
