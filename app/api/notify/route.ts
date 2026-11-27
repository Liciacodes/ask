import { Receiver } from "@upstash/qstash"
import { z } from "zod"
import { notifyUrl, signingKeys } from "@/lib/notifications/config"
import { NotReady, notifyDue } from "@/lib/notifications/send"

// QStash calls this at a reminder's time (lib/notifications/schedule.ts). Only a request QStash signed for exactly
// this URL gets in; anything else is 401. The answer is 200 whatever happened to the reminder, so QStash never
// retries a message that may have sent something. Only a failure before anything was claimed is 5xx, and retried.

const message = z.object({ id: z.uuid(), due_at: z.iso.datetime({ offset: true }) })

const unauthorized = () => Response.json({ error: "Not signed by QStash" }, { status: 401 })

async function signedByQStash(signature: string, body: string, url: string) {
  const keys = signingKeys()
  if (!keys) return false
  // devMode false: the local QStash dev server's built-in keys are never trusted, whatever QSTASH_DEV says.
  const receiver = new Receiver({ currentSigningKey: keys.current, nextSigningKey: keys.next, devMode: false })
  try {
    return await receiver.verify({ signature, body, url })
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const url = notifyUrl()
  const signature = request.headers.get("upstash-signature")
  const body = await request.text()
  if (!url || !signature || !(await signedByQStash(signature, body, url))) return unauthorized()

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = null
  }
  const parsed = message.safeParse(json)
  // Signed, but not a message Ask sent: retrying won't change it.
  if (!parsed.success) return Response.json({ error: "Not a reminder message" }, { status: 400 })

  try {
    const outcome = await notifyDue({ id: parsed.data.id, dueAt: new Date(parsed.data.due_at) })
    return Response.json({ outcome })
  } catch (error) {
    // Nothing was claimed, so nothing was sent: QStash may safely try again.
    console.error("Reminder notification not started:", error)
    return Response.json({ error: error instanceof NotReady ? "Notifications aren't set up" : "Try again" }, { status: 503 })
  }
}
