import { expect, type Locator, type Page, type Route } from "@playwright/test"
import type { ReminderJson } from "@/lib/reminders"

const openShortcut = "ControlOrMeta+k"

const reminder = (title: string, due_at: string, extra: Partial<ReminderJson> = {}): ReminderJson => ({
  id: crypto.randomUUID(),
  title,
  description: null,
  due_at,
  timezone: "Africa/Lagos",
  status: "pending",
  sent_at: null,
  created_at: "2026-11-10T09:00:00.000Z",
  ...extra,
})

// Answers GET /api/week in the browser, so no test reads a database.
async function fakeWeek(page: Page, reminders: ReminderJson[] = []) {
  await page.route("**/api/week?*", (route) => route.fulfill({ json: { timezone: "Africa/Lagos", reminders } }))
}

type Sent = { title: string; due_at: string; timezone: string }

// Answers POST /api/reminders in the browser, so no test writes to a database.
async function fakeSave(page: Page, answer: (route: Route, sent: Sent) => Promise<void> = saved) {
  const requests: Sent[] = []
  await page.route("**/api/reminders", async (route) => {
    const sent = route.request().postDataJSON() as Sent
    requests.push(sent)
    await answer(route, sent)
  })
  return requests
}

const saved = (route: Route, sent: Sent) =>
  route.fulfill({ status: 201, json: reminder(sent.title, sent.due_at, { timezone: sent.timezone, created_at: "2026-11-18T09:20:00.000Z" }) })

async function goHome(page: Page, week: ReminderJson[] | "already faked" = []) {
  // No browser test reaches the real /api/agent. A test's own fake (e2e/fake-agent.ts) is a page route, and page
  // routes always win over this context route.
  await page.context().route("**/api/agent", (route) => route.abort("blockedbyclient"))
  if (week !== "already faked") await fakeWeek(page, week)
  await page.goto("/")
  // Ctrl+K does nothing until React has hydrated, which is also when the shortcut label gets its text.
  await expect(page.getByText("to open Ask").locator("kbd")).not.toBeEmpty()
}

const bar = (page: Page) => page.getByRole("dialog", { name: "Ask" })
const search = (page: Page) => page.getByRole("combobox")
const commands = (page: Page) => page.getByRole("option")
const command = (page: Page, name: string) => page.getByRole("option", { name, exact: true })
const status = (page: Page) => page.getByRole("region", { name: "This week" }).getByRole("status")

async function addTextField(page: Page) {
  await page.evaluate(() => {
    const field = document.createElement("input")
    field.setAttribute("aria-label", "Draft")
    document.body.prepend(field)
  })
  return page.getByRole("textbox", { name: "Draft" })
}

async function openBar(page: Page) {
  await page.keyboard.press(openShortcut)
  await expect(bar(page)).toBeVisible()
  await expect(search(page)).toBeFocused()
}

const title = (page: Page) => page.getByRole("textbox", { name: "Title" })
const segment = (page: Page, field: "Date" | "Time", unit: string) =>
  page.getByRole("group", { name: field }).getByRole("spinbutton", { name: unit })

async function openForm(page: Page) {
  await openBar(page)
  await page.keyboard.type("remind")
  await page.keyboard.press("Enter")
  await expect(title(page)).toBeFocused()
}

async function expectHighlighted(page: Page, option: Locator) {
  await expect(option).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1)
  const id = await option.getAttribute("id")
  expect(id).toBeTruthy()
  await expect(search(page)).toHaveAttribute("aria-activedescendant", id!)
}

export {
  addTextField,
  bar,
  command,
  commands,
  expectHighlighted,
  fakeSave,
  fakeWeek,
  goHome,
  openBar,
  openForm,
  openShortcut,
  reminder,
  saved,
  search,
  segment,
  status,
  title,
  type Sent,
}
