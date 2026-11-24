import { expect, test, type Page } from "@playwright/test"
import { CATEGORIES } from "@/lib/categories"
import { fakeAgent, proposes, says, turn } from "./fake-agent"
import { bar, fakeSave, goHome, openBar, openForm, reminder, status, title } from "./helpers"

// Every word on the main screens, light and dark, reads at 4.5:1 against what's behind it (3:1 for large text, and
// for icons), measured from the colours the browser paints.

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

type Low = { text: string; ratio: number; needs: number }

// Runs in the page. Each element with words of its own: its colour, faded by any opacity above it, against each
// background that can be behind it (with and without a highlighter stroke), at the worst of them. While the bar is
// open, only the bar counts: the page behind it is dimmed and out of reach. With a `scope`, only what's inside it
// counts, bar or not.
function lowContrast(scope: string | null): Low[] {
  type Rgba = [number, number, number, number]
  const parse = (value: string): Rgba[] =>
    [...value.matchAll(/rgba?\(([^)]*)\)|color\(srgb ([^)]*)\)/g)].map((match) => {
      const parts = (match[1] ?? match[2]).split(/[\s,/]+/).filter(Boolean).map(Number)
      const scale = match[1] !== undefined ? 255 : 1
      return [parts[0] / scale, parts[1] / scale, parts[2] / scale, parts[3] ?? 1]
    })
  const over = (top: Rgba, under: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as Rgba
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = ([r, g, b]: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const ratio = (a: Rgba, b: Rgba) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
  }

  function backgrounds(element: Element): Rgba[] {
    const layers: { fill?: Rgba; strokes: Rgba[] }[] = []
    let base: Rgba = [1, 1, 1, 1]
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      const fill = parse(style.backgroundColor)[0]
      const strokes = parse(style.backgroundImage).filter((color) => color[3] > 0)
      if (fill && fill[3] >= 1) {
        base = fill
        layers.push({ strokes })
        break
      }
      layers.push({ fill: fill && fill[3] > 0 ? fill : undefined, strokes })
    }
    let behind = [base]
    for (const { fill, strokes } of layers.reverse()) {
      if (fill) behind = behind.map((color) => over(fill, color))
      for (const stroke of strokes) behind = [...behind, ...behind.map((color) => over(stroke, color))]
    }
    return behind
  }

  const opacity = (element: Element) => {
    let total = 1
    for (let node: Element | null = element; node; node = node.parentElement) total *= Number(getComputedStyle(node).opacity)
    return total
  }

  const open = document.querySelector("dialog:modal, [role=dialog][aria-modal=true]")
  const low: Low[] = []
  for (const element of document.body.querySelectorAll("*")) {
    if (scope) {
      if (!element.closest(scope)) continue
      // A picker's list opens in a layer of its own, above the bar, so it counts too.
    } else if (open && !open.contains(element) && !element.closest('[data-slot="select-content"]')) continue
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null
    const words = field
      ? field.value || field.placeholder
      : [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim()
    if (!words) continue
    const box = element.getBoundingClientRect()
    if (box.width <= 1 || box.height <= 1 || !element.checkVisibility({ visibilityProperty: true })) continue
    const style = getComputedStyle(element)
    const painted = parse(field && !field.value ? getComputedStyle(field, "::placeholder").color : style.color)[0]
    if (!painted || painted[3] === 0) continue
    const size = parseFloat(style.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
    const needs = element.closest("[data-graphic]") || large ? 3 : 4.5
    const text: Rgba = [painted[0], painted[1], painted[2], painted[3] * opacity(element)]
    const worst = Math.min(...backgrounds(element).map((behind) => ratio(over(text, behind), behind)))
    if (worst < needs) low.push({ text: words.slice(0, 60), ratio: Math.round(worst * 100) / 100, needs })
  }
  return low
}

async function expectReadable(page: Page, scope: string | null = null) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  expect(await page.evaluate(lowContrast, scope)).toEqual([])
}

// Each kind of reminder's dashed card, as the week draws one that isn't saved yet: its words on white, its icon on its
// tile. A work card's words take the accent, and its tile is the accent with a white icon.
async function addDashedSwatches(page: Page, categories: readonly string[]) {
  await page.evaluate((names) => {
    const shelf = document.createElement("div")
    shelf.dataset.dashedSwatches = ""
    for (const name of names) {
      const work = name === "work"
      const card = document.createElement("div")
      card.style.cssText = `background-color: var(--surface); color: var(${work ? "--accent" : `--${name}-ink`}); padding: 8px; font-size: 11px; font-weight: 600`
      const tile = document.createElement("span")
      tile.dataset.graphic = ""
      tile.style.cssText = `background-color: var(--${work ? "work" : `${name}-tile`}); ${work ? "color: var(--work-ink);" : ""} padding: 2px`
      tile.textContent = "■"
      card.append(tile, ` ${name}: 18:00 · not saved`)
      shelf.append(card)
    }
    document.querySelector("main")!.append(shelf)
  }, categories)
}

// Each kind of reminder's colours, before any screen uses them: its words on its card, and its icon on its tile.
async function addCategorySwatches(page: Page, categories: readonly string[]) {
  await page.evaluate((names) => {
    const shelf = document.createElement("div")
    for (const name of names) {
      const card = document.createElement("div")
      card.style.cssText = `background-color: var(--${name}); color: var(--${name}-ink); padding: 8px; font-size: 13px`
      const tile = document.createElement("span")
      tile.dataset.graphic = ""
      tile.style.cssText = `background-color: var(--${name}-tile); padding: 2px`
      tile.textContent = "■"
      card.append(tile, ` ${name}: Dentist, 09:00`)
      shelf.append(card)
    }
    document.querySelector("main")!.append(shelf)
  }, categories)
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })

    test("the week, a status line with its highlighter, and every kind of reminder's colours", async ({ page }) => {
      await fakeSave(page)
      await goHome(page, [
        reminder("Dentist", "2026-11-18T08:00:00Z"),
        reminder("Invoice", "2026-11-16T08:00:00Z", { status: "sent", sent_at: "2026-11-16T08:00:01Z" }),
        reminder("Call mum", "2026-11-17T17:30:00Z", { status: "failed" }),
      ])
      await openForm(page)
      await title(page).fill("Buy milk")
      await page.keyboard.press("Enter")
      await expect(status(page)).toContainText("Saved Buy milk")
      await addCategorySwatches(page, CATEGORIES)

      await expectReadable(page)
    })

    test("the bar's list, with a row chosen", async ({ page }) => {
      await goHome(page)
      await openBar(page)
      await page.keyboard.type("re")

      await expect(bar(page).getByRole("option", { selected: true })).toHaveCount(1)
      await expectReadable(page)
    })

    test("the New reminder form, with a problem under a field", async ({ page }) => {
      await goHome(page)
      await openForm(page)
      await page.keyboard.press("Enter")

      await expect(page.locator('[data-slot="field-error"]').first()).toBeVisible()
      await expectReadable(page)
    })

    test("the New reminder form with its category picker open", async ({ page }) => {
      await goHome(page)
      await openForm(page)
      await page.keyboard.type("Dentist")
      await bar(page).getByRole("combobox", { name: "Category" }).click()

      await expect(page.getByRole("option", { name: "Health", exact: true })).toBeVisible()
      // Proves the picker's own words are among those measured, wherever its list is drawn.
      expect(await page.locator('[data-slot="select-content"]').getByText("Shopping").count()).toBe(1)
      await expectReadable(page)
    })

    test("a conversation with a change waiting for your OK", async ({ page }) => {
      const dentist = reminder("Dentist", "2026-11-18T08:00:00.000Z")
      const card = { title: "Dentist", description: "Bring the forms", date: "2026-11-18", time: "09:00", category: "health" } as const
      await fakeAgent(
        page,
        turn(says("Here it is."), proposes("changeReminder", { id: dentist.id, date: "2026-11-19" }, { action: "change", before: card, after: { ...card, date: "2026-11-19" } }))
      )
      await goHome(page, [dentist])
      await openBar(page)
      await page.keyboard.type("move the dentist to tomorrow")
      await page.keyboard.press("Enter")

      await expect(bar(page).getByRole("button", { name: "Save changes" })).toBeVisible()
      await expectReadable(page)
    })

    test("a dashed card waiting for your OK, in every kind of reminder's colours", async ({ page }) => {
      const card = { title: "Call Ada", description: null, date: "2026-11-20", time: "18:00", category: "call" } as const
      await fakeAgent(page, turn(proposes("createReminder", { title: "Call Ada", date: "2026-11-20", time: "18:00", category: "call" }, { action: "create", reminder: card })))
      await goHome(page)
      await openBar(page)
      await page.keyboard.type("call ada friday at 6pm")
      await page.keyboard.press("Enter")
      await expect(page.locator("[data-dashed]")).toBeVisible()
      await addDashedSwatches(page, CATEGORIES)

      // Proves the dashed card's own words are among those measured.
      expect(await page.locator("[data-dashed]").getByText("18:00 · not saved").count()).toBe(1)
      await expectReadable(page, "[data-dashed], [data-dashed-swatches]")
    })

    test("the week when it can't load", async ({ page }) => {
      await page.route("**/api/week?*", (route) => route.fulfill({ status: 500, json: { error: "Database unavailable" } }))
      await goHome(page, "already faked")

      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
      await expectReadable(page)
    })
  })
}
