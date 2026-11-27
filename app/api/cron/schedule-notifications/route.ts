import { timingSafeEqual } from "node:crypto"
import { scheduleComingWeek } from "@/lib/notifications/schedule"

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer <CRON_SECRET>". It schedules the
// reminders that have come within QStash's 7 days since. Without CRON_SECRET set, nothing gets in.

function fromVercelCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const sent = request.headers.get("authorization")
  if (!secret || !sent) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(sent)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(request: Request) {
  if (!fromVercelCron(request)) return Response.json({ error: "Only Vercel Cron may call this" }, { status: 401 })
  return Response.json(await scheduleComingWeek())
}
