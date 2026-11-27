import { afterAll, beforeAll, beforeEach } from "vitest"
import { guessCategory } from "@/lib/categories"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { instantAt } from "@/lib/time"
import { LOCAL_COOKIE } from "@/lib/visitor"
import type { Saved } from "../agent-cases"

// The visitor every test acts as, unless it says otherwise, and a second one to check they stay apart.
const TEST_VISITOR = "11111111-1111-4111-8111-111111111111"
const OTHER_VISITOR = "22222222-2222-4222-8222-222222222222"

const visitorCookie = (visitor: string) => `${LOCAL_COOKIE}=${visitor}`

function setUpTestDatabase() {
  // A sleeping Neon branch can drop the first connection while it wakes, so only that one is retried.
  beforeAll(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await db.$queryRaw`SELECT 1`
        return
      } catch (error) {
        if (attempt === 3) throw error
      }
    }
  })
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE TABLE reminders, daily_usage, sessions, users, push_subscriptions`
  })
  afterAll(async () => {
    await db.$disconnect()
  })
}

// A request as the browser sends it, with the visitor's cookie; `cookie: null` sends none.
function request(method: string, path: string, body?: unknown, { cookie = visitorCookie(TEST_VISITOR) }: { cookie?: string | null } = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie !== null && { cookie }) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

const context = (id: string) => ({ params: Promise.resolve({ id }) })

const nextYear = new Date().getUTCFullYear() + 1

async function saveReminder(data: Partial<Prisma.ReminderUncheckedCreateInput> = {}) {
  return db.reminder.create({
    data: {
      userId: TEST_VISITOR,
      title: "Buy milk",
      dueAt: new Date(`${nextYear}-03-10T08:00:00Z`),
      timezone: "Africa/Lagos",
      ...data,
    },
  })
}

// The reminders a test sentence starts from, saved for the test visitor, each with the category the New reminder
// form would give it. Returns each one's id by its title.
async function saveAll(saved: Saved[] = [], timezone: string) {
  const ids = new Map<string, string>()
  for (const { title, date, time, status } of saved) {
    const reminder = await saveReminder({ title, dueAt: instantAt(date, time, timezone), timezone, status, category: guessCategory(title) })
    ids.set(title, reminder.id)
  }
  return ids
}

export { context, nextYear, OTHER_VISITOR, request, saveAll, saveReminder, setUpTestDatabase, TEST_VISITOR, visitorCookie }
