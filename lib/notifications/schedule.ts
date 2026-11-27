import { Client } from "@upstash/qstash"
import { db } from "@/lib/db"
import { Prisma, type Reminder } from "@/lib/generated/prisma/client"
import { qstashSettings } from "./config"

// Asks QStash to call POST /api/notify at a reminder's time. QStash's free plan delays at most 7 days, so only
// reminders due within 7 days get a message; the daily cron (scheduleComingWeek) catches the rest as they come
// near. Only owners with at least one push subscription get messages: a guest who never turns reminders on uses
// none of the day's messages.

const WINDOW_MS = 7 * 86_400_000
const PUBLISH_TIMEOUT_MS = 5_000

type Due = { id: string; dueAt: Date }

// What QStash brings back at the reminder's time: its id and the time it was scheduled for, nothing more. A
// reminder moved since then no longer matches, and its new time has a message of its own.
type NotifyMessage = { id: string; due_at: string }

const inWindow = (dueAt: Date, now: Date) => dueAt.getTime() > now.getTime() && dueAt.getTime() <= now.getTime() + WINDOW_MS

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer in ${ms}ms`)), ms))])
}

// Publishes one reminder's message and records the time it's for. The deduplication id is the reminder and its
// time, so publishing the same one twice (a save and the cron at once) makes one message.
async function publish({ id, dueAt }: Due) {
  const settings = qstashSettings()
  if (!settings) return false
  const client = new Client({ token: settings.token, baseUrl: settings.baseUrl, retry: { retries: 1 } })
  const message: NotifyMessage = { id, due_at: dueAt.toISOString() }
  await withTimeout(
    client.publishJSON({
      url: settings.notifyUrl,
      body: message,
      notBefore: Math.floor(dueAt.getTime() / 1000),
      deduplicationId: `${id}-${dueAt.getTime()}`,
      // A failed call to /api/notify is only ever one that sent nothing (see lib/notifications/send.ts).
      retries: 3,
    }),
    PUBLISH_TIMEOUT_MS
  )
  await db.reminder.updateMany({ where: { id, dueAt }, data: { notifyScheduledFor: dueAt } })
  return true
}

// Publishes each, and carries on past one that fails: the next cron tries it again.
async function publishAll(reminders: Due[]) {
  let scheduled = 0
  let failed = 0
  for (const reminder of reminders) {
    try {
      if (await publish(reminder)) scheduled++
    } catch (error) {
      failed++
      console.warn(`Couldn't schedule reminder ${reminder.id}:`, error)
    }
  }
  return { scheduled, failed }
}

// Pending reminders due in the next 7 days, not yet scheduled for their time, whose owner has a subscription.
function unscheduled(now: Date, ownerId?: string) {
  const end = new Date(now.getTime() + WINDOW_MS)
  return db.$queryRaw<Due[]>`
    SELECT r.id, r.due_at AS "dueAt"
    FROM reminders r
    WHERE r.status = 'pending'
      AND r.due_at > ${now} AND r.due_at <= ${end}
      AND r.notify_scheduled_for IS DISTINCT FROM r.due_at
      AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.owner_id = r.user_id)
      ${ownerId === undefined ? Prisma.empty : Prisma.sql`AND r.user_id = ${ownerId}`}
    ORDER BY r.due_at`
}

// After a reminder is saved: schedules it if it needs a message. Never fails the save: a publish that fails is
// logged, and the daily cron picks it up, unless it's due before the cron runs.
async function scheduleIfDue(reminder: Reminder, now = new Date()) {
  if (reminder.status !== "pending" || !inWindow(reminder.dueAt, now)) return
  if (reminder.notifyScheduledFor?.getTime() === reminder.dueAt.getTime()) return
  if (!qstashSettings()) return
  if (!(await db.pushSubscription.findFirst({ where: { ownerId: reminder.userId }, select: { id: true } }))) return
  await publishAll([reminder])
}

// When someone turns reminders on: their reminders for the next 7 days, at once, rather than at the next cron.
async function scheduleOwnerWeek(ownerId: string, now = new Date()) {
  if (!qstashSettings()) return { scheduled: 0, failed: 0 }
  return publishAll(await unscheduled(now, ownerId))
}

// The daily cron: everyone's reminders coming within 7 days that have no message yet.
async function scheduleComingWeek(now = new Date()) {
  if (!qstashSettings()) return { scheduled: 0, failed: 0 }
  return publishAll(await unscheduled(now))
}

export { scheduleComingWeek, scheduleIfDue, scheduleOwnerWeek, WINDOW_MS, type NotifyMessage }
