import { NextResponse } from "next/server"
import { sessionCookie, signOut } from "@/lib/session"

// Ends this browser's session. It's a guest again, with its visitor id; its reminders stay in the account.
export async function POST(request: Request) {
  await signOut(request)
  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(sessionCookie(new URL(request.url).protocol, null))
  return response
}
