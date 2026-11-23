import { expect, test, type Page } from "@playwright/test"
import { bar, goHome, openBar, openForm, search, title } from "./helpers"

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
const ALLOWED = ["transform", "scale", "translate", "rotate", "opacity", "clipPath", "filter"]

type Running = { target: string; properties: string[]; duration: number; easing: string; filters: string[] }

// Every animation the browser is running right now, CSS transitions and Web Animations alike, or null if none.
const runningOrNull = () => {
  const list = document.getAnimations().map((animation) => {
    const effect = animation.effect as KeyframeEffect
    const keyframes = effect.getKeyframes()
    const timing = effect.getTiming()
    const properties = [
      ...new Set(keyframes.flatMap((k) => Object.keys(k).filter((p) => !["offset", "computedOffset", "easing", "composite"].includes(p)))),
    ]
    const target = effect.target as HTMLElement
    return {
      target: target.dataset.slot ?? (target.dataset.leaving !== undefined ? "leaving view" : target.tagName.toLowerCase()),
      properties,
      duration: Number(timing.duration),
      // A CSS transition keeps its curve on the first keyframe; a Web Animation keeps it in its timing.
      easing: String(timing.easing !== "linear" ? timing.easing : (keyframes[0]?.easing ?? "linear")),
      filters: keyframes.map((k) => String(k.filter ?? "")).filter(Boolean),
    }
  })
  return list.length > 0 ? list : null
}

const running = async (page: Page): Promise<Running[]> => (await page.evaluate(runningOrNull)) ?? []

// Waits for animations and reads them in the same step, so a short one can't finish in between.
async function startedAnimations(page: Page): Promise<Running[]> {
  return (await page.waitForFunction(runningOrNull)).jsonValue() as Promise<Running[]>
}

const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().length === 0)

// The card's height as drawn on screen, mid-animation included. A real jump is tens of pixels; even at a
// ten-thousandth of normal speed the curve's steep start can move a pixel or two between the test's readings.
const cardHeight = (page: Page) => page.evaluate(() => document.querySelector("[data-paper]")!.getBoundingClientRect().height)

function expectWithinRules(animations: Running[], duration: number) {
  expect(animations.length).toBeGreaterThan(0)
  for (const animation of animations) {
    expect(ALLOWED, `${animation.target} animates ${animation.properties}`).toEqual(expect.arrayContaining(animation.properties))
    expect(animation.easing, animation.target).toBe(EASE_OUT)
    expect(animation.duration, animation.target).toBe(duration)
    for (const filter of animation.filters) expect(["blur(0px)", "blur(2px)"]).toContain(filter)
  }
}

// Sets the speed of the page's animation clock: 0.1 plays everything at a tenth, 0 freezes it.
// Durations and curves read the same; only the clock changes.
async function animationSpeed(page: Page, playbackRate: number) {
  const devtools = await page.context().newCDPSession(page)
  await devtools.send("Animation.enable")
  await devtools.send("Animation.setPlaybackRate", { playbackRate })
}

test.beforeEach(async ({ page }) => {
  await goHome(page)
  await animationSpeed(page, 0.1)
})

test("opening the bar starts no animation", async ({ page }) => {
  await openBar(page)

  expect(await running(page)).toEqual([])
})

test("list to form is one 180ms crossfade, moving only transform, opacity, clip-path and a 2px blur", async ({ page }) => {
  await openBar(page)
  await page.keyboard.type("remind")
  await page.keyboard.press("Enter")

  const animations = await startedAnimations(page)
  expectWithinRules(animations, 180)
  expect(animations.map((a) => a.target)).toContain("leaving view")
  const views = animations.filter((a) => a.properties.includes("opacity") && a.properties.includes("clipPath"))
  expect(views).toHaveLength(2)
  for (const view of views) expect(view.properties, "a view never just fades").toContain("transform")

  await settled(page)
  await expect(page.locator("[data-leaving]")).toHaveCount(0)
  await expect(title(page)).toBeFocused()
})

test("Esc crossfades back to one working list, starting from the card's size", async ({ page }) => {
  await openBar(page)
  await page.keyboard.type("remind")
  await page.keyboard.press("Enter")
  await settled(page)
  await animationSpeed(page, 0.0001)
  const before = await cardHeight(page)
  await page.keyboard.press("Escape")

  const animations = await startedAnimations(page)
  await page.waitForFunction(() => document.getAnimations().every((animation) => !animation.pending))
  expect(Math.abs((await cardHeight(page)) - before)).toBeLessThan(8)
  expectWithinRules(animations, 180)
  await animationSpeed(page, 0.1)

  await settled(page)
  await expect(page.locator("[data-leaving]")).toHaveCount(0)
  await expect(bar(page).getByRole("listbox")).toHaveCount(1)
  await expect(search(page)).toBeFocused()
})

test("going back mid-swap starts from where the card is, and leaves one clean list", async ({ page }) => {
  await openBar(page)
  await page.keyboard.type("remind")
  await page.keyboard.press("Enter")
  await startedAnimations(page)
  // Nearly frozen, not stopped: a stopped clock never starts the new animations, so nothing would apply.
  await animationSpeed(page, 0.0001)
  const before = await cardHeight(page)
  await page.keyboard.press("Escape")
  await expect(search(page)).toBeFocused()
  // The reverse swap starts a frame after Esc; an empty list would pass "nothing pending" too early.
  await page.waitForFunction(() => document.getAnimations().length > 0 && document.getAnimations().every((animation) => !animation.pending))

  expect(Math.abs((await cardHeight(page)) - before)).toBeLessThan(8)
  await expect(page.locator("[data-leaving]")).toHaveCount(1)

  await animationSpeed(page, 0.1)
  await settled(page)
  await expect(bar(page)).toBeVisible()
  await expect(page.locator("[data-leaving]")).toHaveCount(0)
  await expect(bar(page).getByRole("listbox")).toHaveCount(1)
  await expect(search(page)).toBeFocused()
})

test("with reduced motion, the swap only fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openBar(page)
  await page.keyboard.type("remind")
  await page.keyboard.press("Enter")

  const animations = await startedAnimations(page)
  expectWithinRules(animations, 120)
  for (const animation of animations) expect(animation.properties).toEqual(["opacity"])
})

test("an error eases in under its field: a short fade and drop, nothing shakes", async ({ page }) => {
  await openForm(page)
  await settled(page)
  await page.keyboard.press("Enter")

  const animations = await startedAnimations(page)
  expectWithinRules(animations, 150)
  for (const animation of animations) expect(animation.target).toBe("field-error")
})

test("with reduced motion, an error only fades in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openForm(page)
  await settled(page)
  await page.keyboard.press("Enter")

  const animations = await startedAnimations(page)
  for (const animation of animations) expect(animation.properties).toEqual(["opacity"])
})

test("pressing Save scales it to 0.97 over 160ms", async ({ page }) => {
  await openForm(page)
  await settled(page)
  const save = page.getByRole("button", { name: "Save" })
  const box = (await save.boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()

  const animations = await startedAnimations(page)
  expectWithinRules(animations, 160)
  await expect(save).toHaveCSS("scale", "0.97")
  await page.mouse.up()
})
