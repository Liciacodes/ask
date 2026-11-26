// A guest is a random visitor id, kept in a cookie, and their reminders belong to it until they sign in
// (lib/session.ts). proxy.ts gives a visitor their id; routes ask ownerFrom in lib/session.ts whose reminders to use.

// On HTTPS the __Host- prefix makes the browser refuse the cookie unless it's Secure, on this host only, for the
// whole site. Plain-http localhost can't have Secure cookies, so local runs use the plain name.
const SECURE_COOKIE = "__Host-ask-visitor"
const LOCAL_COOKIE = "ask-visitor"

// 400 days, the most a browser keeps a cookie. Every visit starts the count again.
const MAX_AGE = 400 * 24 * 60 * 60

const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const isVisitorId = (value: string | undefined): value is string => value !== undefined && VISITOR_ID.test(value)

function cookieIn(header: string | null, name: string) {
  for (const pair of header?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=")
    if (key === name) return value.join("=")
  }
}

// The visitor making this request, or null when there's no well-formed id: then nothing is read or changed.
function visitorFrom(request: Request) {
  const header = request.headers.get("cookie")
  return [SECURE_COOKIE, LOCAL_COOKIE].map((name) => cookieIn(header, name)).find(isVisitorId) ?? null
}

const noVisitor = () => Response.json({ error: "Ask couldn't tell this browser apart. Reload the page to continue." }, { status: 401 })

// The cookie for a request made over `protocol`, holding `id`. HttpOnly keeps it from page scripts, and
// SameSite=Lax keeps the browser from sending it with another site's POST, PATCH or DELETE.
function visitorCookie(protocol: string, id: string) {
  const secure = protocol === "https:"
  return {
    name: secure ? SECURE_COOKIE : LOCAL_COOKIE,
    value: id,
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  }
}

export { cookieIn, isVisitorId, LOCAL_COOKIE, MAX_AGE, noVisitor, SECURE_COOKIE, visitorCookie, visitorFrom }
