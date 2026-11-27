import { expect, test, type Page } from "@playwright/test"
import { goHome } from "./helpers"

// "Turn on reminders" in the browser. The browser's own push subscription is faked by an init script, so Chromium
// never registers with a real push service, and /api/push/subscriptions is faked too. The service worker is real.

test.use({ timezoneId: "Africa/Lagos", locale: "en-GB" })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:20:00+01:00"))
})

type Fakes = { permissionAsks: number; subscribed: { endpoint: string } | null; answer: NotificationPermission }

// Stands in for the notification permission and the PushManager, counting what's asked. `answer` is what the person
// says to the permission prompt.
async function fakeBrowserPush(page: Page, answer: NotificationPermission = "granted") {
  await page.addInitScript((answer) => {
    const fakes = { permissionAsks: 0, subscribed: null as { endpoint: string } | null, answer }
    ;(window as unknown as { __push: Fakes }).__push = fakes
    const subscription = (endpoint: string) => ({
      endpoint,
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      unsubscribe: async () => {
        fakes.subscribed = null
        return true
      },
    })
    // A real browser starts undecided ("default"); headless Chromium starts at "denied".
    let permission: NotificationPermission = "default"
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => permission })
    Notification.requestPermission = async () => {
      fakes.permissionAsks++
      permission = fakes.answer
      return fakes.answer
    }
    PushManager.prototype.subscribe = async function () {
      const made = subscription("http://127.0.0.1:3311/push/this-browser")
      fakes.subscribed = made
      return made as unknown as PushSubscription
    }
    PushManager.prototype.getSubscription = async function () {
      return fakes.subscribed as unknown as PushSubscription | null
    }
  }, answer)
}

const fakes = (page: Page) => page.evaluate(() => (window as unknown as { __push: Fakes }).__push)

// Answers /api/push/subscriptions in the browser, recording what's saved and removed.
async function fakeSubscriptions(page: Page, status = 201) {
  const calls: { method: string; body: { endpoint: string; keys?: object } }[] = []
  await page.route("**/api/push/subscriptions", async (route) => {
    calls.push({ method: route.request().method(), body: route.request().postDataJSON() })
    await route.fulfill({ status: route.request().method() === "DELETE" ? 204 : status })
  })
  return calls
}

const turnOn = (page: Page) => page.getByRole("button", { name: "Turn on reminders" })
const turnOff = (page: Page) => page.getByRole("button", { name: "Turn off reminders" })

test("nothing asks for permission, or registers anything, when the page loads", async ({ page }) => {
  await fakeBrowserPush(page)
  await goHome(page)

  await expect(turnOn(page)).toBeVisible()
  expect((await fakes(page)).permissionAsks).toBe(0)
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/")) === undefined)).toBe(true)
})

test("Turn on reminders asks, registers the service worker, subscribes and saves; Turn off undoes it", async ({ page }) => {
  await fakeBrowserPush(page)
  const calls = await fakeSubscriptions(page)
  await goHome(page)

  await turnOn(page).click()

  await expect(turnOff(page)).toBeVisible()
  expect((await fakes(page)).permissionAsks).toBe(1)
  expect(calls).toEqual([{ method: "POST", body: expect.objectContaining({ endpoint: "http://127.0.0.1:3311/push/this-browser", keys: expect.any(Object) }) }])
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.scriptURL)).toMatch(/\/sw\.js$/)

  await turnOff(page).click()

  await expect(turnOn(page)).toBeVisible()
  expect(calls[1]).toEqual({ method: "DELETE", body: { endpoint: "http://127.0.0.1:3311/push/this-browser" } })
  expect((await fakes(page)).subscribed).toBeNull()
})

test("refusing notifications says they're blocked, and nothing is saved", async ({ page }) => {
  await fakeBrowserPush(page, "denied")
  const calls = await fakeSubscriptions(page)
  await goHome(page)

  await turnOn(page).click()

  await expect(page.getByRole("status").filter({ hasText: "Notifications are blocked for Ask." })).toBeVisible()
  await expect(turnOn(page)).toHaveCount(0)
  expect(calls).toEqual([])
})

test("if Ask can't save the subscription, it says so and the browser unsubscribes", async ({ page }) => {
  await fakeBrowserPush(page)
  await fakeSubscriptions(page, 500)
  await goHome(page)

  await turnOn(page).click()

  await expect(page.getByRole("status").filter({ hasText: "Ask couldn't turn on reminders. Try again." })).toBeVisible()
  await expect(turnOn(page)).toBeVisible()
  expect((await fakes(page)).subscribed).toBeNull()
})

test("the button is a 44px tap target, and Tab reaches it with a visible focus ring", async ({ page }) => {
  await fakeBrowserPush(page)
  await goHome(page)

  const box = (await turnOn(page).boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(turnOn(page)).toBeFocused()
  await expect(turnOn(page)).toHaveCSS("outline-style", "solid")
})

test.describe("on an iPhone, outside the Home Screen", () => {
  test.use({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  })

  test("Ask says to add it to the Home Screen, instead of a button that can't work", async ({ page }) => {
    await fakeBrowserPush(page)
    await goHome(page)

    await expect(page.getByRole("status").filter({ hasText: "add Ask to your Home Screen" })).toBeVisible()
    await expect(turnOn(page)).toHaveCount(0)
  })
})

test("the manifest lets a phone add Ask to its Home Screen, with icons that exist", async ({ page, request }) => {
  await goHome(page)
  const href = await page.locator('link[rel="manifest"]').getAttribute("href")
  const manifest = await (await request.get(href!)).json()

  expect(manifest).toMatchObject({ name: "Ask", start_url: "/", display: "standalone" })
  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const image = await request.get(icon.src)
    expect(image.status(), icon.src).toBe(200)
    expect(image.headers()["content-type"]).toBe("image/png")
  }
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0)
})

test("a push asks for a notification with the reminder's title, its time, and one tag per reminder", async ({ page, context, baseURL }) => {
  await fakeBrowserPush(page)
  await fakeSubscriptions(page)
  await goHome(page)
  await turnOn(page).click()
  await expect(turnOff(page)).toBeVisible()

  // Headless Chromium won't let a service worker show notifications, so the worker's showNotification records what
  // it was asked to show instead. Clicking a notification can't be tried here: check that one by hand.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  await worker.evaluate(() => {
    const scope = self as unknown as { registration: ServiceWorkerRegistration; shown: { title: string; body?: string; tag?: string }[] }
    scope.shown = []
    scope.registration.showNotification = async (title: string, options?: NotificationOptions) => {
      scope.shown.push({ title, body: options?.body, tag: options?.tag })
    }
  })

  // A real push event, as the browser delivers one, through the DevTools protocol.
  const cdp = await context.newCDPSession(page)
  const registrations: { registrationId: string; scopeURL: string }[] = []
  cdp.on("ServiceWorker.workerRegistrationUpdated", (event) => registrations.push(...event.registrations))
  await cdp.send("ServiceWorker.enable")
  await expect.poll(() => registrations.length).toBeGreaterThan(0)
  const reminder = { id: "3f0c6a2e-8d1b-4c6e-9a51-2b7d3e4f5a60", title: "Call Dad 📞", due_at: "2026-11-20T17:00:00.000Z", timezone: "Africa/Lagos" }
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: baseURL!, registrationId: registrations[0].registrationId, data: JSON.stringify(reminder) })

  // 18:00 in Lagos, in the browser's own language (en-GB here).
  await expect
    .poll(() => worker.evaluate(() => (self as unknown as { shown: unknown[] }).shown))
    .toEqual([{ title: "Call Dad 📞", body: "Friday 20 Nov, 18:00", tag: `reminder-${reminder.id}` }])
})
