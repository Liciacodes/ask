import { expect, test, type Locator, type Page } from "@playwright/test"
import { calendarLink } from "@/lib/calendar-link"
import { did, fakeAgent, proposes, turn } from "./fake-agent"
import { bar, goHome, openBar, openForm, reminder, title } from "./helpers"

// "Add to Google Calendar" on a saved reminder: a link to Google's new-event page, filled in, in a new tab. These
// tests read the link and never follow it: goHome blocks calendar.google.com in every tab anyway.

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

const addToCalendar = (scope: Locator) => scope.getByRole("link", { name: "Add to Google Calendar (opens in a new tab)" })
const conversation = (page: Page) => page.getByRole("log", { name: "Conversation" })
const card = (page: Page, name: string) => conversation(page).getByRole("region", { name })
const origin = (page: Page) => new URL(page.url()).origin

async function ask(page: Page, question: string) {
  await openBar(page)
  await page.keyboard.type(question)
  await page.keyboard.press("Enter")
}

// The link's fields as Google will read them, decoded.
const fieldsOf = async (link: Locator) => Object.fromEntries(new URL((await link.getAttribute("href"))!).searchParams)

const dentist = reminder("Dentist & X-rays #2", "2026-11-19T08:00:00.000Z", { category: "health", description: "Bring the forms\nand the card" })

async function openDentist(page: Page) {
  await goHome(page, [dentist])
  await page.getByRole("option", { name: /^Dentist/ }).click()
  await expect(title(page)).toHaveValue(dentist.title)
}

test("a reminder opened to edit links to Google Calendar's new-event page, filled in, in a new tab", async ({ page }) => {
  await openDentist(page)

  const link = addToCalendar(bar(page))
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute("href", calendarLink(dentist, origin(page)))
  expect(await fieldsOf(link)).toEqual({
    action: "TEMPLATE",
    text: "Dentist & X-rays #2",
    // 09:00 in Lagos, as UTC, for half an hour.
    dates: "20261119T080000Z/20261119T083000Z",
    details: `Bring the forms\nand the card\n\nAdded from Ask: ${origin(page)}`,
  })
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", "noopener noreferrer")
})

test("the link is a 44px tap target, and Tab reaches it from the note with a visible focus ring", async ({ page }) => {
  await openDentist(page)

  const link = addToCalendar(bar(page))
  const box = (await link.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)

  await bar(page).getByRole("textbox", { name: "Note" }).focus()
  await page.keyboard.press("Tab")
  await expect(link).toBeFocused()
  await expect(link).toHaveCSS("outline-style", "solid")
  await expect(link).toHaveCSS("outline-width", "2px")
})

test("a new reminder has nothing saved yet, so it has no link", async ({ page }) => {
  await goHome(page)
  await openForm(page)

  await expect(bar(page).getByRole("button", { name: "Save", exact: true })).toBeVisible()
  await expect(addToCalendar(bar(page))).toHaveCount(0)
})

test("the AI's card gets the link once the reminder is saved, not while it waits for your OK", async ({ page }) => {
  const preview = { action: "create", reminder: { title: "Call Dad 📞", description: null, date: "2026-11-20", time: "18:00", category: "call" } } as const
  const saved = reminder("Call Dad 📞", "2026-11-20T17:00:00.000Z", { category: "call", created_at: "2026-11-18T09:20:00.000Z" })
  await fakeAgent(page, turn(proposes("createReminder", { title: "Call Dad 📞", date: "2026-11-20", time: "18:00", category: "call" }, preview)), turn(did("create", saved)))
  await goHome(page)
  await ask(page, "remind me to call dad friday at 6")

  await expect(card(page, "New reminder").getByRole("button", { name: "Save", exact: true })).toBeVisible()
  await expect(addToCalendar(conversation(page))).toHaveCount(0)

  await page.keyboard.press("Enter")

  await expect(card(page, "New reminder")).toContainText("Saved")
  const link = addToCalendar(card(page, "New reminder"))
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute("href", calendarLink(saved, origin(page)))
  expect(await fieldsOf(link)).toMatchObject({ text: "Call Dad 📞", dates: "20261120T170000Z/20261120T173000Z" })
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", "noopener noreferrer")
})

test("a reminder the AI cancelled has no link", async ({ page }) => {
  const gym = reminder("Gym", "2026-11-19T17:00:00.000Z", { category: "exercise" })
  const preview = { action: "cancel", reminder: { title: "Gym", description: null, date: "2026-11-19", time: "18:00", category: "exercise" } } as const
  await fakeAgent(page, turn(proposes("cancelReminder", { id: gym.id }, preview)), turn(did("cancel", { ...gym, status: "cancelled" })))
  await goHome(page, [gym])
  await ask(page, "cancel the gym")
  await expect(card(page, "Cancel reminder")).toBeVisible()

  await page.keyboard.press("Enter")

  await expect(card(page, "Cancel reminder")).toContainText("Cancelled")
  await expect(addToCalendar(conversation(page))).toHaveCount(0)
})
