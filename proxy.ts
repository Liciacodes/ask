import { NextResponse, type NextRequest } from "next/server"
import { isVisitorId, LOCAL_COOKIE, SECURE_COOKIE, visitorCookie } from "@/lib/visitor"

// Gives each visitor their id. It only runs on the API, so the page itself stays static and cookie-free.
export function proxy(request: NextRequest) {
  const known = [SECURE_COOKIE, LOCAL_COOKIE].map((name) => request.cookies.get(name)?.value).find(isVisitorId)

  // A change with no id gets none: the route turns it down, so another site can't act through a new visitor.
  if (request.method !== "GET") return privately(NextResponse.next())

  const cookie = visitorCookie(request.nextUrl.protocol, known ?? crypto.randomUUID())
  // The request goes on carrying the id, so a first visit's own request already has one.
  request.cookies.set(cookie.name, cookie.value)
  const response = NextResponse.next({ request: { headers: request.headers } })
  response.cookies.set(cookie)
  return privately(response)
}

// Every answer is one visitor's own, often with their cookie: no shared cache may keep it and hand it to someone else.
function privately(response: NextResponse) {
  response.headers.set("cache-control", "private, no-store")
  return response
}

// Every API route but the two no browser calls: QStash's callback (/api/notify) and Vercel's cron (/api/cron/…),
// which need no visitor id.
export const config = { matcher: "/api/((?!notify$|cron/).*)" }
