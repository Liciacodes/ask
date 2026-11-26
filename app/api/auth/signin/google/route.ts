import { NextResponse } from "next/server"
import { signInStart } from "@/lib/google"
import { signInCookie } from "@/lib/session"

// Sends the browser to Google, remembering the state and PKCE verifier for the callback.
export function GET(request: Request) {
  const { origin, protocol } = new URL(request.url)
  const { url, state, verifier } = signInStart(origin)
  const response = NextResponse.redirect(url)
  response.cookies.set(signInCookie(protocol, `${state}.${verifier}`))
  return response
}
