import { expect, type Locator, type Page, type Route } from "@playwright/test"
import { guessCategory, type Category } from "@/lib/categories"
import type { ReminderJson } from "@/lib/reminders"

const openShortcut = "ControlOrMeta+k"

const reminder = (title: string, due_at: string, extra: Partial<ReminderJson> = {}): ReminderJson => ({
  id: crypto.randomUUID(),
  title,
  description: null,
  due_at,
  timezone: "Africa/Lagos",
  status: "pending",
  category: guessCategory(title),
  sent_at: null,
  created_at: "2026-11-10T09:00:00.000Z",
  ...extra,
})

// Answers GET /api/week in the browser, so no test reads a database.
async function fakeWeek(page: Page, reminders: ReminderJson[] = []) {
  await page.route("**/api/week?*", (route) => route.fulfill({ json: { timezone: "Africa/Lagos", reminders } }))
}

type Sent = { title: string; description: string; due_at: string; timezone: string; category: Category }

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

// What a PATCH sends: a drag sends the time; the form sends what it shows, and the time only when it changed.
type Move = { id: string; due_at?: string; title?: string; description?: string; timezone?: string; category?: Category }

// Answers PATCH /api/reminders/:id in the browser, by default with the week's reminder changed as asked.
async function fakeMove(page: Page, week: ReminderJson[], answer?: (route: Route, sent: Move) => Promise<void>) {
  const requests: Move[] = []
  await page.route("**/api/reminders/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback()
    const sent = { id: route.request().url().split("/").pop()!, ...(route.request().postDataJSON() as Omit<Move, "id">) }
    requests.push(sent)
    if (answer) return answer(route, sent)
    const was = week.find((reminder) => reminder.id === sent.id)!
    const changes: Partial<Move> = { ...sent }
    delete changes.id
    await route.fulfill({ json: { ...was, ...changes, description: changes.description === undefined ? was.description : changes.description || null } })
  })
  return requests
}

const saved = (route: Route, sent: Sent) =>
  route.fulfill({
    status: 201,
    json: reminder(sent.title, sent.due_at, {
      description: sent.description || null,
      timezone: sent.timezone,
      category: sent.category,
      created_at: "2026-11-18T09:20:00.000Z",
    }),
  })

type Me = { name: string | null; email: string; picture: string | null } | null

// Answers GET /api/auth/me in the browser: who the header says is signed in. `me` may change as the test goes on.
async function fakeMe(page: Page, me: () => Me) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: me() } }))
}

async function goHome(page: Page, week: ReminderJson[] | "already faked" = []) {
  // No browser test reaches the real /api/agent. A test's own fake (e2e/fake-agent.ts) is a page route, and page
  // routes always win over this context route.
  await page.context().route("**/api/agent", (route) => route.abort("blockedbyclient"))
  if (week !== "already faked") await fakeWeek(page, week)
  await page.goto("/")
  // Ctrl+K does nothing until React has hydrated, which is also when the shortcut label gets its text.
  await expect(askButton(page).locator("kbd")).not.toBeEmpty()
}

// The header's "Ask anything" button, which opens the bar like Ctrl+K. Its name includes the shortcut it shows.
const askButton = (page: Page) => page.getByRole("button", { name: /^Ask anything/ })
const bar = (page: Page) => page.getByRole("dialog", { name: "Ask" })
// The bar's own search, not the form's Category picker, which is a combobox too.
const search = (page: Page) => page.getByRole("combobox", { name: "Type a command or ask anything" })
// The bar's own options: the week's cards are options too.
const commands = (page: Page) => bar(page).getByRole("option")
const command = (page: Page, name: string) => bar(page).getByRole("option", { name, exact: true })
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
  await expect(bar(page).getByRole("option", { selected: true })).toHaveCount(1)
  const id = await option.getAttribute("id")
  expect(id).toBeTruthy()
  await expect(search(page)).toHaveAttribute("aria-activedescendant", id!)
}

export {
  addTextField,
  fakeMe,
  askButton,
  bar,
  command,
  commands,
  expectHighlighted,
  fakeMove,
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
  type Move,
  type Sent,
}
