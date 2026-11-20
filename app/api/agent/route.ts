import { createUIMessageStreamResponse, safeValidateUIMessages } from "ai"
import { z } from "zod"
import { agentStream, type AgentMessage } from "@/lib/agent/agent"
import { countedModel, isNewQuestion, takeQuestion } from "@/lib/agent/limits"
import { agentModel } from "@/lib/agent/model"
import { check } from "@/lib/api"
import { weekQuery } from "@/lib/reminders"
import { noVisitor, visitorFrom } from "@/lib/visitor"

const MAX_BODY = 100_000

// The conversation lives in the browser while the bar is open, so every request carries all of it.
const body = z.strictObject({
  messages: z.array(z.unknown()).min(1, "Send at least one message").max(40, "Start a new conversation: this one is too long"),
  timezone: z.string(),
})

export async function POST(request: Request) {
  const visitor = visitorFrom(request)
  if (!visitor) return noVisitor()

  const text = await request.text()
  if (text.length > MAX_BODY) return Response.json({ error: "The conversation is too long to send" }, { status: 413 })

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return Response.json({ error: "Send the request body as JSON" }, { status: 400 })
  }
  const parsed = check(body, json)
  if (!parsed.ok) return parsed.response
  const zone = check(weekQuery, { timezone: parsed.data.timezone })
  if (!zone.ok) return zone.response

  const messages = await safeValidateUIMessages<AgentMessage>({ messages: parsed.data.messages })
  if (!messages.success) return Response.json({ error: "Those messages aren't in a shape Ask can read" }, { status: 400 })

  // Made first, so a server without its Groq key fails before it counts anyone's question.
  const model = countedModel(agentModel())

  // A new question is turned away here, before any model call, once today's limits are reached.
  const question = isNewQuestion(messages.data) ? await takeQuestion(visitor, zone.data.timezone) : undefined
  if (question && !question.ok) return question.response

  const stream = agentStream({
    model,
    messages: messages.data,
    userId: visitor,
    timezone: zone.data.timezone,
    now: new Date(),
    onNoRoom: question?.giveBack,
  })
  return createUIMessageStreamResponse({ stream })
}
