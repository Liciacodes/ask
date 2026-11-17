import { expect, test, type Page } from "@playwright/test"
import { fakeSave, goHome, openBar, openForm, reminder, status } from "./helpers"

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
const ALLOWED = ["transform", "opacity", "clipPath"]

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

type Started = {
  at: number
  target: string
  properties: string[]
  delay: number
  duration: number
  easings: string[]
  first: Record<string, string>
  last: Record<string, string>
}

// Logs every animation as it starts, Web Animations and CSS transitions alike, with when it started.
const recordMotion = () => {
  const started: unknown[] = []
  Object.assign(window, { __started: started })
  const describe = (el: HTMLElement) =>
    el.dataset.flying !== undefined
      ? "flying card"
      : el.dataset.marker !== undefined
        ? "highlighter"
        : el.dataset.id
          ? `card ${el.querySelector("p:last-of-type > span:last-child")?.textContent?.trim()}`
          : el.dataset.barLayer !== undefined
            ? "bar"
            : el.closest("[data-flying]")
              ? "flying card text"
              : el.tagName.toLowerCase()
  const log = (el: HTMLElement, animation: Animation) => {
    const effect = animation.effect as KeyframeEffect
    const keyframes = effect.getKeyframes()
    const timing = effect.getTiming()
    const skip = ["offset", "computedOffset", "easing", "composite"]
    const pick = (k: ComputedKeyframe) => Object.fromEntries(Object.entries(k).filter(([p]) => !skip.includes(p)).map(([p, v]) => [p, String(v)]))
    started.push({
      at: document.timeline.currentTime,
      target: describe(el),
      properties: [...new Set(keyframes.flatMap((k) => Object.keys(pick(k))))],
      delay: Number(timing.delay ?? 0),
      duration: Number(timing.duration),
      easings: [...new Set([timing.easing, ...keyframes.slice(0, -1).map((k) => k.easing)].filter((e) => e && e !== "linear"))],
      first: pick(keyframes[0]),
      last: pick(keyframes[keyframes.length - 1]),
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
  // The flying card lives for about half a second, so note its state the moment it's added.
  // Also note any command list appearing, which would mean the fading bar flipped back from the form.
  const flying: unknown[] = []
  const lists: string[] = []
  Object.assign(window, { __flying: flying, __lists: lists })
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) {
        const el = node as HTMLElement
        if (el.dataset?.flying !== undefined) flying.push({ open: el.matches(":popover-open"), hidden: el.getAttribute("aria-hidden") })
        if (el.querySelector?.("[role=listbox]") || el.getAttribute?.("role") === "listbox") lists.push("command list")
      }
  }).observe(document, { childList: true, subtree: true })
}

const flyingCards = (page: Page) => page.evaluate(() => (window as unknown as { __flying: unknown[] }).__flying)
const listsShown = (page: Page) => page.evaluate(() => (window as unknown as { __lists: string[] }).__lists)
const resetLists = (page: Page) => page.evaluate(() => ((window as unknown as { __lists: string[] }).__lists.length = 0))
const startedSince = async (page: Page) => (await page.evaluate(() => (window as unknown as { __started: Started[] }).__started)) as Started[]
const resetLog = (page: Page) => page.evaluate(() => ((window as unknown as { __started: unknown[] }).__started.length = 0))
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().length === 0 && !document.querySelector("[data-flying]"))

const week = () => [reminder("Gym", "2026-11-18T07:00:00Z"), reminder("Lunch with Ada", "2026-11-18T12:00:00Z")]

async function saveDentist(page: Page, date?: string) {
  await openForm(page)
  await page.waitForFunction(() => document.getAnimations().length === 0)
  await page.keyboard.type("Dentist")
  if (date) {
    await page.keyboard.press("Tab")
    await page.keyboard.type(date)
  }
  await resetLog(page)
  await resetLists(page)
  await page.keyboard.press("Enter")
  await expect(status(page)).toContainText("Saved Dentist")
}

const pageErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(recordMotion)
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
  await fakeSave(page)
})

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), "errors thrown in the page").toEqual([])
})

test("saving flies the card into its day: transform, opacity and clip-path only, one curve, done within 800ms", async ({ page }) => {
  await goHome(page, week())
  await saveDentist(page)
  await settled(page)

  const started = await startedSince(page)
  const t0 = Math.min(...started.map((s) => s.at))
  for (const s of started) {
    expect(ALLOWED, `${s.target} animates ${s.properties}`).toEqual(expect.arrayContaining(s.properties))
    expect(s.easings, s.target).toEqual([EASE_OUT])
  }
  const end = Math.max(...started.map((s) => s.at - t0 + s.delay + s.duration))
  expect(end).toBeLessThanOrEqual(800)

  const targets = started.map((s) => `${s.target}: ${s.properties.join(",")}`)
  expect(targets).toEqual(
    expect.arrayContaining(["bar: opacity", "flying card: transform", "card Lunch with Ada: transform", "highlighter: clipPath"])
  )
  expect(targets.filter((t) => t.startsWith("card Gym"))).toEqual([])
})

test("the cards below slide down to make room, finishing as the new card lands", async ({ page }) => {
  await goHome(page, week())
  await saveDentist(page)
  await settled(page)

  const started = await startedSince(page)
  const flight = started.find((s) => s.target === "flying card" && s.properties.includes("transform"))!
  const lunch = started.find((s) => s.target === "card Lunch with Ada")!
  expect(lunch.first.transform).toMatch(/translateY\(-\d+(\.\d+)?px\)/)
  expect(lunch.last.transform).toBe("translateY(0px)")
  expect(lunch.delay + lunch.duration).toBe(flight.duration)
})

test("then the highlighter draws across the new title from left to right, and stays", async ({ page }) => {
  await goHome(page, week())
  await saveDentist(page)
  await settled(page)

  const started = await startedSince(page)
  const flight = started.find((s) => s.target === "flying card" && s.properties.includes("transform"))!
  const draw = started.find((s) => s.target === "highlighter")!
  expect(draw.first.clipPath).toBe("inset(0px 100% 0px 0px)")
  expect(draw.last.clipPath).toBe("inset(0px)")
  expect(draw.delay).toBe(flight.duration)

  const marker = page.locator("[data-marker]")
  await expect(marker).toHaveCount(1)
  await expect(marker).toHaveCSS("clip-path", "none")
  await expect(marker).toHaveText("Dentist")
})

test("the flying card is a hidden copy above the closing bar, and nothing is left behind", async ({ page }) => {
  await goHome(page, week())
  await saveDentist(page)
  await settled(page)

  expect(await flyingCards(page)).toEqual([{ open: true, hidden: "true" }])
  await expect(page.locator("[data-flying]")).toHaveCount(0)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const card = page.locator("[data-id]").filter({ hasText: "Dentist" })
  await expect(card).toHaveCSS("opacity", "1")
})

test("the bar fades out after a save, still showing the form, but Esc still closes it instantly", async ({ page }) => {
  await goHome(page, week())
  await saveDentist(page)
  await settled(page)
  const bar = (await startedSince(page)).filter((s) => s.target === "bar")
  expect(bar.map((s) => [s.properties.join(), s.duration])).toEqual([
    ["opacity", 150],
    ["opacity", 150],
  ])
  expect(await listsShown(page), "the fading bar switched back to the command list").toEqual([])

  await openBar(page)
  await resetLog(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await startedSince(page)).toEqual([])
})

test("with reduced motion nothing moves: the bar, the card and the highlighter just fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await goHome(page, week())
  await saveDentist(page)
  await settled(page)

  const started = await startedSince(page)
  expect(started.map((s) => s.target)).toEqual(expect.arrayContaining(["bar", "card Dentist", "highlighter"]))
  expect(started.map((s) => s.target)).not.toContain("flying card")
  for (const s of started) {
    expect(s.properties, s.target).toEqual(["opacity"])
    expect(s.delay + s.duration, s.target).toBeLessThanOrEqual(150)
  }
})

test("a reminder for another week doesn't fly; only the bar fades", async ({ page }) => {
  await goHome(page, week())
  await saveDentist(page, "02122026")
  await settled(page)

  expect(new Set((await startedSince(page)).map((s) => s.target))).toEqual(new Set(["bar"]))
})

test("when the day is off screen there's nowhere to fly: the card fades in, then the highlighter draws", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 })
  await goHome(page, week())
  await saveDentist(page, "22112026")
  await settled(page)

  const started = await startedSince(page)
  expect(started.map((s) => s.target)).not.toContain("flying card")
  expect(started.map((s) => `${s.target}: ${s.properties.join(",")}`)).toEqual(
    expect.arrayContaining(["card Dentist: opacity", "highlighter: clipPath"])
  )
})
