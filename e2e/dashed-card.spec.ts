import { expect, test, type Locator, type Page } from "@playwright/test"
import type { Preview } from "@/lib/agent/plans"
import { declined, did, fakeAgent, proposes, turn } from "./fake-agent"
import { bar, goHome, openBar, reminder } from "./helpers"

// While the bar waits for your OK on a new or changed reminder, the week shows where it would go: a dashed card.

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

// Wednesday 18 November, 10:20 in Lagos.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
  await page.addInitScript(recordMotion)
})

type Started = { target: string; properties: string[]; duration: number; easing: string; first: string; last: string }

// Notes every animation as it starts, Web Animations and CSS transitions alike.
const recordMotion = () => {
  const started: unknown[] = []
  Object.assign(window, { __started: started })
  const describe = (el: HTMLElement) =>
    el.dataset.dashed !== undefined
      ? "dashed card"
      : el.dataset.landing !== undefined
        ? "dashed face"
        : el.dataset.id
          ? `card ${el.getAttribute("aria-label")?.split(",")[0]}`
          : el.dataset.barLayer !== undefined || el.closest("[data-bar-layer]")
            ? "bar"
            : el.tagName.toLowerCase()
  const log = (el: HTMLElement, animation: Animation) => {
    const effect = animation.effect as KeyframeEffect
    const keyframes = effect.getKeyframes()
    const skip = ["offset", "computedOffset", "easing", "composite"]
    const properties = [...new Set(keyframes.flatMap((k) => Object.keys(k).filter((p) => !skip.includes(p))))]
    const value = (k: ComputedKeyframe) => properties.map((p) => String(k[p])).join(" ")
    started.push({
      target: describe(el),
      properties,
      duration: Number(effect.getTiming().duration),
      easing: String(effect.getTiming().easing),
      first: value(keyframes[0]),
      last: value(keyframes[keyframes.length - 1]),
    })
  }
  const animate = Element.prototype.animate
  Element.prototype.animate = function (this: HTMLElement, keyframes, options) {
    const animation = animate.call(this, keyframes, options)
    log(this, animation)
    return animation
  }
  document.addEventListener(
    "transitionrun",
    (event) => {
      const el = event.target as HTMLElement
      const animation = el.getAnimations().find((a) => (a as CSSTransition).transitionProperty === event.propertyName)
      if (animation) log(el, animation)
    },
    true
  )
}

const started = (page: Page) => page.evaluate(() => (window as unknown as { __started: Started[] }).__started) as Promise<Started[]>
const forget = (page: Page) => page.evaluate(() => ((window as unknown as { __started: unknown[] }).__started.length = 0))
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"))

const day = (page: Page, name: string) =>
  page.getByRole("list", { name: "Days this week" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name }) })
const dashed = (page: Page) => page.locator("[data-dashed]")
// Where a card sits in its day, whatever the page's scroll.
const placeInDay = (locator: Locator) =>
  locator.evaluate((el: HTMLElement) => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight }))
// The bar's hint line, under its card: the keys, and where the dashed card is.
const footer = (page: Page) => bar(page).locator("[aria-hidden]").filter({ has: page.locator("kbd") })

// A colour token as the browser paints it.
const painted = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("i")
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

const callAdaInput = { title: "Call Ada", date: "2026-11-20", time: "18:00", category: "call" }
const callAda: Preview = { action: "create", reminder: { description: null, ...callAdaInput, category: "call" } }
const savedCallAda = reminder("Call Ada", "2026-11-20T17:00:00.000Z", { category: "call", created_at: "2026-11-18T09:20:00.000Z" })

const create = (date: string, time: string, title = "Call Ada"): [Record<string, string>, Preview] => [
  { title, date, time, category: "call" },
  { action: "create", reminder: { title, description: null, date, time, category: "call" } },
]

async function ask(page: Page, question: string) {
  await openBar(page)
  await page.keyboard.type(question)
  await page.keyboard.press("Enter")
}

const dentist = reminder("Dentist", "2026-11-18T08:00:00.000Z")
const dentistCard = { title: "Dentist", description: null, time: "09:00", category: "health" } as const
const moveDentist: Preview = { action: "change", before: { ...dentistCard, date: "2026-11-18" }, after: { ...dentistCard, date: "2026-11-19" } }
const moveDentistInput = { id: dentist.id, date: "2026-11-19" }

test("while a new reminder waits for your OK, a dashed card shows its day, time and category, not saved", async ({ page }) => {
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)))
  await goHome(page)
  await ask(page, "call ada friday at 6pm")

  const card = day(page, "Friday 20 November").locator("[data-dashed]")
  await expect(card).toBeVisible()
  await expect(card).toHaveText("Call Ada18:00Not saved")
  await expect(card.getByText("Not saved", { exact: true })).toHaveCSS("background-color", await painted(page, "--unsaved"))
  // Its category's dot, as the saved card will have.
  await expect(card.locator(".bg-call")).toHaveCount(1)
  // At 18:00 in the grid, which starts at 8:00 with 54px an hour.
  await expect(card).toHaveCSS("top", `${(18 - 8) * 54 + 3}px`)
  await expect(card).toHaveCSS("border-top-style", "dashed")
  await expect(card).toHaveCSS("border-top-color", await painted(page, "--dashed-line"))
  await expect(card).toHaveCSS("background-color", await painted(page, "--surface"))
  await expect(footer(page)).toContainText("the dashed card on Friday shows where it will go")
})

test("the dashed card is the bar's card again, so screen readers don't hear it, and it can't be reached or dragged", async ({ page }) => {
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)))
  await goHome(page)
  await ask(page, "call ada friday at 6pm")

  await expect(dashed(page)).toHaveAttribute("aria-hidden", "true")
  await expect(dashed(page)).not.toHaveAttribute("tabindex")
  await expect(dashed(page)).toHaveCSS("pointer-events", "none")
  await expect(day(page, "Friday 20 November").getByRole("option")).toHaveCount(0)
})

test("Esc says no: the dashed card fades out in 150ms, and the week is as it was", async ({ page }) => {
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)))
  await goHome(page)
  await ask(page, "call ada friday at 6pm")
  await expect(dashed(page)).toBeVisible()
  await settled(page)
  await forget(page)

  await page.keyboard.press("Escape")

  await expect(dashed(page)).toHaveCount(0)
  expect((await started(page)).filter((s) => s.target === "dashed card")).toEqual([
    { target: "dashed card", properties: ["opacity"], duration: 150, easing: "cubic-bezier(0.23, 1, 0.32, 1)", first: "1", last: "0" },
  ])
  await expect(day(page, "Friday 20 November").getByRole("option")).toHaveCount(0)
})

test("Enter says yes: the dashed card stays while it saves, then becomes the card in its place, filling to solid in 200ms", async ({ page }) => {
  let answer = () => {}
  const answered = new Promise<void>((resolve) => (answer = resolve))
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)), { until: answered, chunks: turn(did("create", savedCallAda)) })
  await goHome(page)
  await ask(page, "call ada friday at 6pm")
  await expect(dashed(page)).toBeVisible()
  const was = await placeInDay(dashed(page))
  await settled(page)
  await forget(page)

  await page.keyboard.press("Enter")
  await expect(bar(page).getByText("Saving…")).toBeVisible()
  await expect(dashed(page)).toBeVisible()
  answer()

  const card = day(page, "Friday 20 November").getByRole("option", { name: "Call Ada, 18:00, call" })
  await expect(card).toBeVisible()
  await expect(dashed(page)).toHaveCount(0)
  expect(await placeInDay(card)).toEqual(was)
  await settled(page)
  expect((await started(page)).filter((s) => s.target === "dashed face")).toEqual([
    { target: "dashed face", properties: ["opacity"], duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)", first: "1", last: "0" },
  ])
  await expect(page.locator("[data-landing]")).toHaveCount(0)
  // No flight: the bar stays open over the week.
  await expect(page.locator("[data-flying]")).toHaveCount(0)
})

test("the new card keeps an accent ring", async ({ page }) => {
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)), turn(did("create", savedCallAda)))
  await goHome(page, [dentist])
  await ask(page, "call ada friday at 6pm")
  await expect(dashed(page)).toBeVisible()
  await page.keyboard.press("Enter")

  const card = day(page, "Friday 20 November").getByRole("option")
  await expect(card).toHaveAttribute("data-newest", "")
  expect(await card.evaluate((el) => getComputedStyle(el, "::after").borderTopColor)).toBe(await painted(page, "--accent"))
  await expect(day(page, "Wednesday 18 November").getByRole("option")).not.toHaveAttribute("data-newest")
})

test("a change: the card it would move fades to half strength, the dashed card shows its new place, and no puts it back", async ({ page }) => {
  await fakeAgent(page, turn(proposes("changeReminder", moveDentistInput, moveDentist)))
  await goHome(page, [dentist])
  await ask(page, "move the dentist to tomorrow")

  const original = day(page, "Wednesday 18 November").getByRole("option", { name: /^Dentist/ })
  await expect(day(page, "Thursday 19 November").locator("[data-dashed]")).toHaveText("Dentist09:00Not saved")
  await expect(original).toHaveCSS("opacity", "0.5")
  await expect(footer(page)).toContainText("the dashed card on Thursday shows where it will go")

  await page.keyboard.press("Escape")

  await expect(dashed(page)).toHaveCount(0)
  await expect(original).toHaveCSS("opacity", "1")
})

test("a change saved: the card moves into the dashed card's place, at full strength", async ({ page }) => {
  await fakeAgent(page, turn(proposes("changeReminder", moveDentistInput, moveDentist)), turn(did("change", { ...dentist, due_at: "2026-11-19T08:00:00.000Z" })))
  await goHome(page, [dentist])
  await ask(page, "move the dentist to tomorrow")
  const was = await placeInDay(day(page, "Thursday 19 November").locator("[data-dashed]"))

  await page.keyboard.press("Enter")

  const moved = day(page, "Thursday 19 November").getByRole("option", { name: /^Dentist/ })
  await expect(moved).toBeVisible()
  await expect(dashed(page)).toHaveCount(0)
  await expect(day(page, "Wednesday 18 November").getByRole("option")).toHaveCount(0)
  await settled(page)
  await expect(moved).toHaveCSS("opacity", "1")
  expect(await placeInDay(moved)).toEqual(was)
})

test("cancelling, bringing back, and a day outside this week show no dashed card", async ({ page }) => {
  const [lateInput, late] = create("2026-12-02", "18:00")
  await fakeAgent(
    page,
    turn(proposes("cancelReminder", { id: dentist.id }, { action: "cancel", reminder: { ...dentistCard, date: "2026-11-18" } })),
    // Saying no sends the conversation back, so the server hears it.
    turn(declined()),
    turn(proposes("createReminder", lateInput, late))
  )
  await goHome(page, [dentist])
  await ask(page, "cancel the dentist")
  await expect(bar(page).getByRole("button", { name: "Keep it" })).toBeVisible()

  await expect(dashed(page)).toHaveCount(0)
  await expect(day(page, "Wednesday 18 November").getByRole("option")).toHaveCSS("opacity", "1")
  await expect(footer(page)).not.toContainText("dashed")

  await page.keyboard.press("Escape")
  // The field takes words again once the server has heard the no.
  await expect(bar(page).getByText("Kept")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Ask a follow-up" })).not.toHaveAttribute("readonly")
  await page.keyboard.type("call ada on 2 December at 6pm")
  await page.keyboard.press("Enter")
  await expect(bar(page).getByRole("button", { name: "Save", exact: true })).toBeVisible()
  await expect(dashed(page)).toHaveCount(0)
  await expect(footer(page)).not.toContainText("dashed")
})

test("closing the bar with a card waiting takes the dashed card away", async ({ page }) => {
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)))
  await goHome(page)
  await ask(page, "call ada friday at 6pm")
  await expect(dashed(page)).toBeVisible()

  await page.keyboard.press("ControlOrMeta+k")

  await expect(bar(page)).toHaveCount(0)
  await expect(dashed(page)).toHaveCount(0)
})

test("a dashed card under the bar scrolls just far enough into view, and the card it becomes stays clear of the bar", async ({ page }) => {
  const [input, preview] = create("2026-11-20", "22:00")
  await fakeAgent(page, turn(proposes("createReminder", input, preview)), turn(did("create", { ...savedCallAda, due_at: "2026-11-20T21:00:00.000Z" })))
  await goHome(page)
  await ask(page, "call ada friday at 10pm")

  // How far above the bar a card's bottom edge is, rounded: scrolling lands on fractions of a pixel.
  const clearance = (locator: Locator) =>
    locator.evaluate((el) => Math.round(document.querySelector('[data-slot="command-bar-content"]')!.getBoundingClientRect().top - el.getBoundingClientRect().bottom))
  const justClear = async (locator: Locator) => Math.abs((await clearance(locator)) - 12) <= 1
  await expect(dashed(page)).toBeVisible()
  await expect.poll(() => justClear(dashed(page))).toBe(true)
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)

  await page.keyboard.press("Enter")

  const card = day(page, "Friday 20 November").getByRole("option")
  await expect(bar(page).getByText("Saved: Call Ada")).toBeVisible()
  await expect.poll(() => justClear(card)).toBe(true)
})

test("a dashed card already in view doesn't scroll the page", async ({ page }) => {
  const [input, preview] = create("2026-11-19", "09:00")
  await fakeAgent(page, turn(proposes("createReminder", input, preview)))
  await goHome(page)
  await ask(page, "call ada tomorrow at 9am")

  await expect(dashed(page)).toBeVisible()
  await settled(page)
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test("on a phone, the dashed card takes its place in the day's list, in time order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const [input, preview] = create("2026-11-18", "12:00")
  await fakeAgent(page, turn(proposes("createReminder", input, preview)))
  await goHome(page, [dentist, reminder("Gym", "2026-11-18T17:00:00.000Z")])
  await ask(page, "call ada at noon")

  const today = day(page, "Wednesday 18 November")
  await expect(today.locator("[data-dashed]")).toBeVisible()
  const order = await today.locator("[data-id], [data-dashed]").evaluateAll((els) => els.map((el) => el.textContent?.slice(0, 8)))
  expect(order).toEqual(["Dentist0", "Call Ada", "Gym18:00"])
})

test("with reduced motion, the dashed card goes and fills at once, and nothing moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await fakeAgent(page, turn(proposes("createReminder", callAdaInput, callAda)), turn(did("create", savedCallAda)))
  await goHome(page)
  await ask(page, "call ada friday at 6pm")
  await expect(dashed(page)).toBeVisible()
  await settled(page)
  await forget(page)

  await page.keyboard.press("Enter")

  await expect(day(page, "Friday 20 November").getByRole("option")).toBeVisible()
  await expect(dashed(page)).toHaveCount(0)
  await expect(page.locator("[data-landing]")).toHaveCount(0)
  expect((await started(page)).filter((s) => s.target === "dashed card" || s.target === "dashed face")).toEqual([])
})

test("with reduced motion, no takes the dashed card away at once, and the card a change would move comes back at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await fakeAgent(page, turn(proposes("changeReminder", moveDentistInput, moveDentist)))
  await goHome(page, [dentist])
  await ask(page, "move the dentist to tomorrow")
  await expect(dashed(page)).toBeVisible()
  await settled(page)
  await forget(page)

  await page.keyboard.press("Escape")

  await expect(dashed(page)).toHaveCount(0)
  expect((await started(page)).filter((s) => s.target !== "bar")).toEqual([])
})

test("only transform and opacity animate, from asking to saving", async ({ page }) => {
  await fakeAgent(page, turn(proposes("changeReminder", moveDentistInput, moveDentist)), turn(did("change", { ...dentist, due_at: "2026-11-19T08:00:00.000Z" })))
  await goHome(page, [dentist])
  await ask(page, "move the dentist to tomorrow")
  await expect(dashed(page)).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(bar(page).getByText("Changed: Dentist")).toBeVisible()
  await settled(page)

  const week = (await started(page)).filter((s) => s.target !== "bar")
  expect(week.map((s) => s.target)).toEqual(expect.arrayContaining(["card Dentist", "dashed face"]))
  for (const s of week) expect(s.properties.every((p) => ["opacity", "transform"].includes(p)), `${s.target}: ${s.properties}`).toBe(true)
})
