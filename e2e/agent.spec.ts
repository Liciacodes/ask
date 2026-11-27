import { expect, test, type Page } from "@playwright/test"
import { examples } from "@/lib/agent/not-understood"
import { problems, usedUp } from "@/lib/agent/problems"
import { askedAgain, declined, did, doesNotUnderstand, fakeAgent, proposes, refused, says, stopsWith, turn } from "./fake-agent"
import { addTextField, bar, commands, expectHighlighted, goHome, openBar, openShortcut, reminder, search, status } from "./helpers"

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

const followUp = (page: Page) => page.getByRole("textbox", { name: "Ask a follow-up" })
const conversation = (page: Page) => page.getByRole("log", { name: "Conversation" })
const card = (page: Page, name: string) => conversation(page).getByRole("region", { name })
const hints = (page: Page) => page.locator("[aria-hidden] kbd").locator("xpath=..")
const day = (page: Page, name: string) =>
  page.getByRole("list", { name: "Days this week" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name }) })

const callDad = { action: "create", reminder: { title: "Call Dad", description: null, date: "2026-11-20", time: "18:00", category: "call" } } as const
const callDadInput = { title: "Call Dad", date: "2026-11-20", time: "18:00", category: "call" }
const savedCallDad = reminder("Call Dad", "2026-11-20T17:00:00.000Z", { created_at: "2026-11-18T09:20:00.000Z" })

async function ask(page: Page, question: string) {
  await openBar(page)
  await page.keyboard.type(question)
  await page.keyboard.press("Enter")
  await expect(followUp(page)).toBeFocused()
}

const textOf = (message: { parts: { type: string; text?: string }[] }) => message.parts.map((part) => part.text ?? "").join("")

// A colour token as the browser paints it, like rgb(223, 244, 251).
const painted = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("i")
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

test("a sentence no command matches is offered as a question, and Enter sends it with your timezone", async ({ page }) => {
  const requests = await fakeAgent(page, turn(says("You have nothing on Friday.")))
  await goHome(page)
  await openBar(page)

  await page.keyboard.type("anything on friday?")
  await expect(commands(page)).toHaveCount(1)
  await expectHighlighted(page, page.getByRole("option", { name: "Ask “anything on friday?”" }))
  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("anything on friday?")).toBeVisible()
  await expect(conversation(page).getByText("You have nothing on Friday.")).toBeVisible()
  await expect(followUp(page)).toBeFocused()
  expect(requests).toHaveLength(1)
  expect(Object.keys(requests[0]).sort()).toEqual(["messages", "timezone"])
  expect(requests[0].timezone).toBe("Africa/Lagos")
  expect(requests[0].messages.map(textOf)).toEqual(["anything on friday?"])
})

test("a command that matches stays first, and asking isn't offered", async ({ page }) => {
  await goHome(page)
  await openBar(page)

  await page.keyboard.type("note")

  await expect(commands(page)).toHaveCount(2)
  await expect(page.getByRole("option", { name: /^Ask/ })).toHaveCount(0)
})

test("an action waits for your OK on a preview card, and nothing is sent until you answer", async ({ page }) => {
  const requests = await fakeAgent(page, turn(says("Here it is."), proposes("createReminder", callDadInput, callDad)))
  await goHome(page)

  await ask(page, "remind me to call dad friday at 6")

  const preview = card(page, "New reminder")
  await expect(preview).toContainText("Call Dad")
  // On a soft grey card, with its category's dot and grey icon, as it will look in the week.
  await expect(preview).toHaveAttribute("data-category", "call")
  await expect(preview.locator("div").first()).toHaveCSS("background-color", await painted(page, "--soft"))
  await expect(preview.locator(".bg-call")).toHaveCount(1)
  await expect(preview).toContainText("Friday 20 Nov, 18:00")
  // The day stands out, so a wrong one is noticed before saying yes.
  await expect(preview.locator("[data-weekday]")).toHaveText("Friday")
  await expect(preview.locator("[data-weekday]")).toHaveCSS("font-weight", "700")
  await expect(preview.getByRole("button", { name: "Save", exact: true })).toBeVisible()
  await expect(preview.getByRole("button", { name: "Don't save" })).toBeVisible()
  await expect(hints(page)).toHaveText(["↵save", "escdon't save"])
  await expect(followUp(page)).toHaveAttribute("readonly", "")
  await expect(followUp(page)).toHaveAccessibleDescription("Enter: Save. Escape: Don't save.")
  expect(requests).toHaveLength(1)
  await expect(day(page, "Friday 20 November").getByRole("option")).toHaveCount(0)
})

test("Enter on the card says yes: the reminder is saved, the bar says so in its own words, and the week shows it", async ({ page }) => {
  const requests = await fakeAgent(page, turn(proposes("createReminder", callDadInput, callDad)), turn(did("create", savedCallDad)))
  await goHome(page)
  await ask(page, "remind me to call dad friday at 6")
  await expect(card(page, "New reminder")).toBeVisible()

  await page.keyboard.press("Enter")

  await expect(card(page, "New reminder")).toContainText("Saved")
  await expect(conversation(page).getByText("Saved: Call Dad, Friday 20 Nov, 18:00")).toBeVisible()
  expect(requests).toHaveLength(2)
  const answered = requests[1].messages.at(-1)!.parts.find((part) => part.type === "tool-createReminder")
  expect(answered).toMatchObject({ state: "approval-responded", approval: { id: "approval-call-1", approved: true } })

  const friday = day(page, "Friday 20 November").getByRole("option")
  await expect(friday).toHaveCount(1)
  await expect(friday).toContainText("Call Dad")
  await expect(friday).toHaveAttribute("data-newest", "")
  await expect(status(page)).toHaveText("Saved Call Dad for Fri 20 Nov, 18:00")
  await expect(bar(page)).toBeVisible()
  await expect(hints(page)).toHaveText(["↵send", "escback"])
})

test("Esc on the card says no: nothing is saved, the server hears it, and no words follow the card", async ({ page }) => {
  const requests = await fakeAgent(page, turn(proposes("createReminder", callDadInput, callDad)), turn(declined()))
  await goHome(page)
  await ask(page, "remind me to call dad friday at 6")
  await expect(card(page, "New reminder")).toBeVisible()

  await page.keyboard.press("Escape")

  await expect(card(page, "New reminder")).toContainText("Not saved")
  await expect(conversation(page).locator("section + p")).toHaveCount(0)
  await expect(bar(page)).toBeVisible()
  const answered = requests[1].messages.at(-1)!.parts.find((part) => part.type === "tool-createReminder")
  expect(answered).toMatchObject({ state: "approval-responded", approval: { approved: false } })
  await expect(day(page, "Friday 20 November").getByRole("option")).toHaveCount(0)
  await expect(status(page)).toBeEmpty()
})

test("the card's buttons answer it with a pointer too, and the cursor goes back to the follow-up", async ({ page }) => {
  const requests = await fakeAgent(page, turn(proposes("createReminder", callDadInput, callDad)), turn(declined()))
  await goHome(page)
  await ask(page, "remind me to call dad friday at 6")

  await card(page, "New reminder").getByRole("button", { name: "Don't save" }).click()

  await expect(card(page, "New reminder")).toContainText("Not saved")
  await expect(followUp(page)).toBeFocused()
  expect(requests[1].messages.at(-1)!.parts.find((part) => part.type === "tool-createReminder")).toMatchObject({
    approval: { approved: false },
  })
})

test("a change shows before and after, and approving moves the card to its new day", async ({ page }) => {
  const dentist = reminder("Dentist", "2026-11-18T08:00:00.000Z")
  const moved = { ...dentist, due_at: "2026-11-19T08:00:00.000Z" }
  const change = {
    action: "change",
    before: { title: "Dentist", description: null, date: "2026-11-18", time: "09:00", category: "health" },
    after: { title: "Dentist", description: null, date: "2026-11-19", time: "09:00", category: "health" },
  } as const
  await fakeAgent(
    page,
    turn(proposes("changeReminder", { id: dentist.id, date: "2026-11-19" }, change)),
    turn(did("change", moved))
  )
  await goHome(page, [dentist])
  await ask(page, "move the dentist to tomorrow")

  const preview = card(page, "Change reminder")
  await expect(preview).toHaveAttribute("data-category", "health")
  await expect(preview.locator("del")).toHaveText("was Wednesday 18 Nov, 09:00")
  await expect(preview.locator("ins")).toHaveText("now Thursday 19 Nov, 09:00")
  await expect(preview.locator("ins [data-weekday]")).toHaveCSS("font-weight", "700")
  await expect(preview.locator("del [data-weekday]")).toHaveCSS("font-weight", "500")
  await expect(hints(page)).toHaveText(["↵save changes", "esckeep as is"])
  await page.keyboard.press("Enter")

  await expect(preview).toContainText("Changed")
  await expect(conversation(page).getByText("Changed: Dentist, Thursday 19 Nov, 09:00")).toBeVisible()
  await expect(day(page, "Wednesday 18 November").getByRole("option")).toHaveCount(0)
  await expect(day(page, "Thursday 19 November").getByRole("option")).toContainText("Dentist")
  await expect(status(page)).toHaveText("Changed Dentist, now Thu 19 Nov, 09:00")
})

test("cancelling takes the card out of the week", async ({ page }) => {
  const dentist = reminder("Dentist", "2026-11-18T08:00:00.000Z")
  const cancel = { action: "cancel", reminder: { title: "Dentist", description: null, date: "2026-11-18", time: "09:00", category: "health" } } as const
  await fakeAgent(
    page,
    turn(proposes("cancelReminder", { id: dentist.id }, cancel)),
    turn(did("cancel", { ...dentist, status: "cancelled" }))
  )
  await goHome(page, [dentist])
  await ask(page, "cancel the dentist")

  await expect(card(page, "Cancel reminder").getByRole("button", { name: "Keep it" })).toBeVisible()
  // Red, with white words that reach 4.5:1.
  const confirm = card(page, "Cancel reminder").getByRole("button", { name: "Cancel reminder" })
  await expect(confirm).toHaveCSS("background-color", "rgb(220, 38, 38)")
  await expect(confirm).toHaveCSS("color", "rgb(255, 255, 255)")
  await page.keyboard.press("Enter")

  await expect(card(page, "Cancel reminder")).toContainText("Cancelled")
  await expect(conversation(page).getByText("Cancelled: Dentist, Wednesday 18 Nov, 09:00")).toBeVisible()
  await expect(day(page, "Wednesday 18 November").getByRole("option")).toHaveCount(0)
  await expect(status(page)).toHaveText("Cancelled Dentist")
})

test("if the server turns your yes down, the card says why instead of pretending you declined", async ({ page }) => {
  const dentist = reminder("Dentist", "2026-11-18T08:00:00.000Z")
  const cancel = { action: "cancel", reminder: { title: "Dentist", description: null, date: "2026-11-18", time: "09:00", category: "health" } } as const
  const reason = "This reminder was already sent, so it can't be cancelled."
  await fakeAgent(page, turn(proposes("cancelReminder", { id: dentist.id }, cancel)), turn(refused(reason)))
  await goHome(page, [dentist])
  await ask(page, "cancel the dentist")
  await expect(card(page, "Cancel reminder")).toBeVisible()

  await page.keyboard.press("Enter")

  await expect(card(page, "Cancel reminder").getByRole("alert")).toHaveText(reason)
  await expect(card(page, "Cancel reminder")).not.toContainText("Kept")
  await expect(day(page, "Wednesday 18 November").getByRole("option")).toContainText("Dentist")
  await expect(status(page)).toBeEmpty()
})

test("a follow-up goes into the same conversation", async ({ page }) => {
  const requests = await fakeAgent(page, turn(says("You have the dentist at 09:00.")), turn(says("Nothing after that.")))
  await goHome(page)
  await ask(page, "what's on today?")
  await expect(conversation(page).getByText("You have the dentist at 09:00.")).toBeVisible()

  await page.keyboard.type("and later?")
  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("Nothing after that.")).toBeVisible()
  await expect(followUp(page)).toHaveValue("")
  expect(requests[1].messages.map((message) => message.role)).toEqual(["user", "assistant", "user"])
  expect(textOf(requests[1].messages[2])).toBe("and later?")
})

test("Esc stops a reply that's still coming; then Esc goes back to the list, and again closes the bar", async ({ page }) => {
  await fakeAgent(page, "never")
  await goHome(page)
  const field = await addTextField(page)
  await field.click()
  await ask(page, "what's on today?")
  await expect(conversation(page).getByText("Thinking…")).toBeVisible()
  await expect(hints(page)).toHaveText(["escstop"])

  await page.keyboard.press("Escape")
  await expect(conversation(page).getByText("Thinking…")).toBeHidden()
  await expect(hints(page)).toHaveText(["↵send", "escback"])
  await expect(followUp(page)).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(search(page)).toBeFocused()
  await expect(search(page)).toHaveValue("")

  await page.keyboard.press("Escape")
  await expect(bar(page)).toBeHidden()
  await expect(field).toBeFocused()
})

test("a request the server refuses says why, and you can ask again", async ({ page }) => {
  const requests = await fakeAgent(
    page,
    { status: 400, body: JSON.stringify({ error: "Start a new conversation: this one is too long" }) },
    turn(says("Here you go."))
  )
  await goHome(page)
  await ask(page, "what's on today?")

  await expect(conversation(page).getByRole("alert")).toHaveText("Start a new conversation: this one is too long")
  await page.keyboard.type("try again")
  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("Here you go.")).toBeVisible()
  await expect(conversation(page).getByRole("alert")).toHaveCount(0)
  expect(requests).toHaveLength(2)
})

test("a lost connection says so in plain words", async ({ page }) => {
  await page.route("**/api/agent", (route) => route.abort("internetdisconnected"))
  await goHome(page)
  await ask(page, "what's on today?")

  await expect(conversation(page).getByRole("alert")).toHaveText("Ask couldn't get an answer. Check your connection and ask again.")
})

test("when Groq is busy, the reply says so in plain words, and you can ask again", async ({ page }) => {
  const requests = await fakeAgent(page, stopsWith(problems.busy), turn(says("Here you go.")))
  await goHome(page)
  await ask(page, "what's on today?")

  await expect(conversation(page).getByRole("alert")).toHaveText("Lots of people are trying Ask right now. Try again in a minute. Create reminder still works.")
  await page.keyboard.type("try again")
  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("Here you go.")).toBeVisible()
  await expect(conversation(page).getByRole("alert")).toHaveCount(0)
  expect(requests).toHaveLength(2)
})

test("today's limit says when you can ask again", async ({ page }) => {
  await fakeAgent(page, { status: 429, body: JSON.stringify({ error: usedUp.visitor(10, "01:00") }) })
  await goHome(page)
  await ask(page, "what's on today?")

  await expect(conversation(page).getByRole("alert")).toHaveText(
    "You've used today's 10 questions. You can ask again from 01:00. Create reminder still works."
  )
})

test("closing the bar forgets the conversation", async ({ page }) => {
  const requests = await fakeAgent(page, turn(says("You have the dentist at 09:00.")), turn(says("Hello again.")))
  await goHome(page)
  await ask(page, "what's on today?")
  await expect(conversation(page).getByText("You have the dentist at 09:00.")).toBeVisible()

  await page.keyboard.press(openShortcut)
  await expect(bar(page)).toBeHidden()
  await ask(page, "hello")

  await expect(conversation(page).getByText("Hello again.")).toBeVisible()
  await expect(conversation(page).getByText("You have the dentist at 09:00.")).toHaveCount(0)
  expect(requests[1].messages.map(textOf)).toEqual(["hello"])
})

test("a test that forgets to fake /api/agent never reaches a server", async ({ page }) => {
  await goHome(page)

  // A body the route turns away before any model call, so even a broken block couldn't reach Groq.
  const sent = await page.evaluate(() => fetch("/api/agent", { method: "POST", body: "{}" }).then(() => "reached a server", () => "blocked"))

  expect(sent).toBe("blocked")
})

test("a reply the server asked again shows only its card: no examples, no words back in the field, and Enter still saves", async ({ page }) => {
  const requests = await fakeAgent(
    page,
    turn(askedAgain("off-topic"), proposes("createReminder", callDadInput, callDad)),
    turn(did("create", savedCallDad))
  )
  await goHome(page)
  await ask(page, "call dad friday at 6pm")

  await expect(card(page, "New reminder")).toBeVisible()
  await expect(conversation(page).getByText("Try something like")).toHaveCount(0)
  await expect(conversation(page).getByText(/date or time/)).toHaveCount(0)
  await expect(followUp(page)).toHaveValue("")

  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("Saved: Call Dad, Friday 20 Nov, 18:00")).toBeVisible()
  expect(requests).toHaveLength(2)
})

test("a message Ask doesn't understand says so, offers sentences to try, and gives your words back to fix", async ({ page }) => {
  const requests = await fakeAgent(page, turn(doesNotUnderstand("gibberish")), turn(says("You have nothing on Friday.")))
  await goHome(page)
  await openBar(page)
  await page.keyboard.type("asdfgh")
  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("I didn't understand that. Try something like:")).toBeVisible()
  for (const example of examples) await expect(conversation(page).getByText(`“${example}”`)).toBeVisible()
  await expect(followUp(page)).toBeFocused()
  await expect(followUp(page)).toHaveValue("asdfgh")
  expect(await followUp(page).evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd])).toEqual([6, 6])

  // Fixing it in place, rather than typing it all again.
  await page.keyboard.press("Shift+Home")
  await page.keyboard.type("What's on Friday?")
  await page.keyboard.press("Enter")

  await expect(conversation(page).getByText("You have nothing on Friday.")).toBeVisible()
  expect(requests[1].messages.filter((message) => message.role === "user").map(textOf)).toEqual(["asdfgh", "What's on Friday?"])
  await expect(followUp(page)).toHaveValue("")
})
