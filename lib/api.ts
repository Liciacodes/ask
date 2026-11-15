import type { z } from "zod"

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response }

function check<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.output<S>> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data }
  const issues = result.error.issues.map((issue) => ({
    field: issue.code === "unrecognized_keys" ? issue.keys.join(", ") : issue.path.join(".") || null,
    message: issue.message,
  }))
  return { ok: false, response: Response.json({ error: "Invalid request", issues }, { status: 400 }) }
}

async function checkBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.output<S>>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: Response.json({ error: "Send the request body as JSON" }, { status: 400 }) }
  }
  return check(schema, body)
}

const notFound = () => Response.json({ error: "Reminder not found" }, { status: 404 })

const conflict = (error: string) => Response.json({ error }, { status: 409 })

export { check, checkBody, conflict, notFound }
