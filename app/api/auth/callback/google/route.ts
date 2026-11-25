import { NextResponse } from "next/server"
import { signInFinish, type GoogleProfile } from "@/lib/google"
import { sessionCookie, signIn, signInCookie, signInCookieFrom } from "@/lib/session"
import { visitorFrom } from "@/lib/visitor"

// Google sends the browser back here. The state must match the one we set, the code is swapped for the person's
// ID token, and then this browser's guest reminders move to their account and a session starts. Anything wrong
// goes back to the page with ?signin=failed, signed in as nobody new.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const [state, verifier] = signInCookieFrom(request)?.split(".") ?? []
  const code = url.searchParams.get("code")

  let profile: GoogleProfile | null = null
  if (state && verifier && code && url.searchParams.get("state") === state) {
    try {
      profile = await signInFinish(url.origin, code, verifier)
    } catch {
      profile = null
    }
  }

  const response = NextResponse.redirect(new URL(profile ? "/" : "/?signin=failed", url))
  response.cookies.set(signInCookie(url.protocol, null))
  if (profile) response.cookies.set(sessionCookie(url.protocol, await signIn(profile, visitorFrom(request))))
  return response
}
