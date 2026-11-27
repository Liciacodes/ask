import { NextResponse } from "next/server"
import { sessionCookie, signOut } from "@/lib/session"

// Ends this browser's session. It's a guest again, with its visitor id; its reminders stay in the account. The
// browser may send its push subscription's endpoint, which is removed too, so it stops showing the account's
// reminders.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const endpoint = typeof body === "object" && body !== null && "endpoint" in body && typeof body.endpoint === "string" ? body.endpoint : undefined
  await signOut(request, endpoint)
  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(sessionCookie(new URL(request.url).protocol, null))
  return response
}
