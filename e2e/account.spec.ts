import { expect, test } from "@playwright/test"
import { fakeMe, goHome, reminder } from "./helpers"

// The header's account corner. The sign-in trip itself (Google, the callback, guest reminders moving over) is
// tested in tests/api/auth.test.ts against a fake Google; here the browser only fakes who /api/auth/me says is here.

const ada = { name: "Ada Lovelace", email: "ada@example.com", picture: null }

test("a guest sees Sign in with Google, which starts the trip to Google", async ({ page }) => {
  await fakeMe(page, () => null)
  await goHome(page)
  const signIn = page.getByRole("link", { name: "Sign in with Google" })
  await expect(signIn).toBeVisible()
  await expect(signIn).toHaveAttribute("href", "/api/auth/signin/google")
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0)
})

test("someone signed in sees their name, and Sign out makes them a guest again", async ({ page }) => {
  let me: typeof ada | null = ada
  await fakeMe(page, () => me)
  const signOuts: string[] = []
  await page.route("**/api/auth/signout", async (route) => {
    signOuts.push(route.request().method())
    me = null
    await route.fulfill({ status: 204 })
  })
  await goHome(page, [reminder("Dentist", "2026-11-19T08:00:00.000Z")])

  await expect(page.getByText("Ada Lovelace")).toBeVisible()
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toHaveCount(0)

  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible()
  expect(signOuts).toEqual(["POST"])
})

test("a sign-in that failed says so once, and the address loses ?signin=failed", async ({ page }) => {
  await fakeMe(page, () => null)
  await goHome(page)
  await page.goto("/?signin=failed")
  await expect(page.getByRole("status").filter({ hasText: "Couldn't sign in with Google. Try again." })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  await page.reload()
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible()
  await expect(page.getByText("Couldn't sign in with Google")).toHaveCount(0)
})
