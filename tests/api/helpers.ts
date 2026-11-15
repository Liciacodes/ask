import { afterAll, beforeAll, beforeEach } from "vitest"
import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { currentUserId } from "@/lib/user"

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
    await db.$executeRaw`TRUNCATE TABLE reminders`
  })
  afterAll(async () => {
    await db.$disconnect()
  })
}

function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

const context = (id: string) => ({ params: Promise.resolve({ id }) })

const nextYear = new Date().getUTCFullYear() + 1

async function saveReminder(data: Partial<Prisma.ReminderUncheckedCreateInput> = {}) {
  return db.reminder.create({
    data: {
      userId: await currentUserId(),
      title: "Buy milk",
      dueAt: new Date(`${nextYear}-03-10T08:00:00Z`),
      timezone: "Africa/Lagos",
      ...data,
    },
  })
}

export { context, nextYear, request, saveReminder, setUpTestDatabase }
