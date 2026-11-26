import { expect, test, type Page } from "@playwright/test"
import { did, fakeAgent, proposes, says, turn } from "./fake-agent"
import { bar, fakeMe, fakeSave, goHome, openBar, openForm, reminder, status, title } from "./helpers"

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

// Every card is white, whatever its category: only its dot takes the category's colour. The dot is decoration, because
// the grey icon and the card's name say the category too, so it isn't measured. The grey icons are: here, as a
// graphic at 3:1, on each surface one is drawn on. Words are all measured where the screens draw them.
async function addIconSwatches(page: Page) {
  await page.evaluate(() => {
    const shelf = document.createElement("div")
    shelf.dataset.iconSwatches = ""
    // A card's icon on the card; the bar card's icon on its white tile, inside the soft grey card; the form's on its
    // soft tile; the bar's command icons on the chosen row's tint.
    for (const surface of ["--surface", "--soft", "--selected", "--today"]) {
      const behind = document.createElement("div")
      behind.style.cssText = `background-color: var(${surface}); padding: 4px`
      const icon = document.createElement("span")
      icon.dataset.graphic = ""
      icon.style.cssText = "color: var(--muted)"
      icon.textContent = `■ icon on ${surface}`
      behind.append(icon)
      shelf.append(behind)
    }
    document.querySelector("main")!.append(shelf)
  })
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })

    test("the header's calendar tile, the week with its Sent and Not sent pills, a status line, and the grey icons", async ({ page }) => {
      await fakeSave(page)
      await goHome(page, [
        // Today's column is tinted, so a card there is measured on it too.
        reminder("Dentist", "2026-11-18T08:00:00Z", { category: "health", description: "Bring the forms" }),
        reminder("Invoice", "2026-11-16T08:00:00Z", { status: "sent", sent_at: "2026-11-16T08:00:01Z", category: "work" }),
        reminder("Call mum", "2026-11-17T17:30:00Z", { status: "failed", category: "call" }),
      ])
      await openForm(page)
      await title(page).fill("Buy milk")
      await page.keyboard.press("Enter")
      await expect(status(page)).toContainText("Saved Buy milk")
      await addIconSwatches(page)

      // Proves the tile, the pills and today's dark circle are among the words measured.
      const words = ["Nov", "18", "Sent", "Not sent"]
      for (const word of words) expect(await page.getByText(word, { exact: true }).count(), word).toBeGreaterThan(0)
      await expectReadable(page)
    })

    test("the header signed in, and a guest's Sign in link after a sign-in that failed", async ({ page }) => {
      await fakeMe(page, () => ({ name: "Ada Lovelace", email: "ada@example.com", picture: null }))
      await goHome(page)
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
      await expectReadable(page)

      await page.unroute("**/api/auth/me")
      await fakeMe(page, () => null)
      await page.goto("/?signin=failed")
      await expect(page.getByText("Couldn't sign in with Google. Try again.")).toBeVisible()
      await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible()
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

    test("a dashed card waiting for your OK, with its Not saved pill", async ({ page }) => {
      const card = { title: "Call Ada", description: null, date: "2026-11-20", time: "18:00", category: "call" } as const
      await fakeAgent(page, turn(proposes("createReminder", { title: "Call Ada", date: "2026-11-20", time: "18:00", category: "call" }, { action: "create", reminder: card })))
      await goHome(page)
      await openBar(page)
      await page.keyboard.type("call ada friday at 6pm")
      await page.keyboard.press("Enter")
      await expect(page.locator("[data-dashed]")).toBeVisible()

      // Proves the dashed card's own words are among those measured.
      expect(await page.locator("[data-dashed]").getByText("Not saved", { exact: true }).count()).toBe(1)
      await expectReadable(page, "[data-dashed]")
    })

    test("a reminder the AI saved, with its Add to Google Calendar link on the soft grey card", async ({ page }) => {
      const card = { title: "Call Ada", description: null, date: "2026-11-20", time: "18:00", category: "call" } as const
      const saved = reminder("Call Ada", "2026-11-20T17:00:00.000Z", { category: "call" })
      await fakeAgent(
        page,
        turn(proposes("createReminder", { title: "Call Ada", date: "2026-11-20", time: "18:00", category: "call" }, { action: "create", reminder: card })),
        turn(did("create", saved))
      )
      await goHome(page)
      await openBar(page)
      await page.keyboard.type("call ada friday at 6pm")
      await page.keyboard.press("Enter")
      await expect(bar(page).getByRole("button", { name: "Save", exact: true })).toBeVisible()
      await page.keyboard.press("Enter")

      await expect(bar(page).getByRole("link", { name: /^Add to Google Calendar/ })).toBeVisible()
      await expectReadable(page)
    })

    test("a cancel waiting for your OK, with its red Cancel reminder button on the soft grey card", async ({ page }) => {
      const dentist = reminder("Dentist", "2026-11-19T08:00:00.000Z", { category: "health" })
      const card = { title: "Dentist", description: null, date: "2026-11-19", time: "09:00", category: "health" } as const
      await fakeAgent(page, turn(proposes("cancelReminder", { id: dentist.id }, { action: "cancel", reminder: card })))
      await goHome(page, [dentist])
      await openBar(page)
      await page.keyboard.type("cancel the dentist")
      await page.keyboard.press("Enter")

      await expect(bar(page).getByRole("button", { name: "Cancel reminder" })).toBeVisible()
      await expectReadable(page)
    })

    test("a reminder opened to edit, with its Add to Google Calendar link and red Delete reminder button", async ({ page }) => {
      await goHome(page, [reminder("Dentist", "2026-11-19T08:00:00.000Z", { description: "Bring the forms" })])
      await page.getByRole("option", { name: /^Dentist/ }).click()

      await expect(bar(page).getByRole("button", { name: "Delete reminder" })).toBeVisible()
      await expect(bar(page).getByRole("link", { name: /^Add to Google Calendar/ })).toBeVisible()
      await expectReadable(page)
    })

    test("the week when it can't load", async ({ page }) => {
      await page.route("**/api/week?*", (route) => route.fulfill({ status: 500, json: { error: "Database unavailable" } }))
      await goHome(page, "already faked")

      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
      await expectReadable(page)
    })
  })
}
