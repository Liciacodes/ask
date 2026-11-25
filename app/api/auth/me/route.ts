import { userFrom } from "@/lib/session"

// Who's signed in, for the header. The page itself stays static, so it asks here.
export async function GET(request: Request) {
  const user = await userFrom(request)
  return Response.json({ user: user && { name: user.name, email: user.email, picture: user.picture } })
}
