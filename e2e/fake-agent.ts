import type { Page } from "@playwright/test"
import { UI_MESSAGE_STREAM_HEADERS, type InferUIMessageChunk } from "ai"
import type { AgentMessage } from "@/lib/agent/agent"
import type { Reason } from "@/lib/agent/not-understood"
import type { Preview } from "@/lib/agent/plans"
import type { ReminderJson } from "@/lib/reminders"

// What /api/agent streams back, in the same shape as the real route (recorded from it with a scripted model).
type Chunk = InferUIMessageChunk<AgentMessage>
type ActionTool = "createReminder" | "changeReminder" | "cancelReminder" | "restoreReminder"

const says = (text: string): Chunk[] => [
  { type: "text-start", id: `text-${text.length}` },
  { type: "text-delta", id: `text-${text.length}`, delta: text },
  { type: "text-end", id: `text-${text.length}` },
]

// The model proposes an action: the server sends its preview card, the call, and a request for your OK.
const proposes = (toolName: ActionTool, input: Record<string, unknown>, preview: Preview, toolCallId = "call-1"): Chunk[] => [
  { type: "data-preview", id: toolCallId, data: preview },
  { type: "tool-input-available", toolCallId, toolName, input },
  { type: "tool-approval-request", approvalId: `approval-${toolCallId}`, toolCallId },
]

const did = (done: Preview["action"], reminder: ReminderJson, toolCallId = "call-1"): Chunk[] => [
  { type: "tool-output-available", toolCallId, output: { done, reminder } },
]

const declined = (toolCallId = "call-1"): Chunk[] => [{ type: "tool-output-denied", toolCallId }]

// You said yes, but the server checked again and something had changed while the card waited.
const refused = (reason: string, toolCallId = "call-1"): Chunk[] => [
  { type: "data-refused", id: toolCallId, data: { reason } },
  { type: "tool-output-denied", toolCallId },
]

// The model couldn't tell what was meant: the reply ends with didNotUnderstand, and the bar says what to try.
const doesNotUnderstand = (reason: Reason, toolCallId = "call-1"): Chunk[] => [
  { type: "tool-input-available", toolCallId, toolName: "didNotUnderstand", input: { reason } },
  { type: "tool-output-available", toolCallId, output: { reason } },
]

// The model didn't understand a message with a date or time: the server turns that down, and the model's second
// answer follows in a step of its own.
const askedAgain = (reason: Reason, toolCallId = "call-0"): Chunk[] => [
  { type: "tool-input-available", toolCallId, toolName: "didNotUnderstand", input: { reason } },
  { type: "tool-output-error", toolCallId, errorText: "Error: The person's message has a date or time, so it's a reminder to set." },
  { type: "finish-step" },
  { type: "start-step" },
]

// The reply stops before a word of it: what the route sends when Groq, or the site's day, has no room for the call.
const stopsWith = (errorText: string): Chunk[] => [
  { type: "start", messageId: "reply-1" },
  { type: "error", errorText },
]

const turn = (...pieces: Chunk[][]): Chunk[] => [
  { type: "start", messageId: "reply-1" },
  { type: "start-step" },
  ...pieces.flat(),
  { type: "finish-step" },
  { type: "finish" },
]

type Sent = { messages: AgentMessage[]; timezone: string }
// A scripted answer for each request in turn: a stream, an error response, "never" to leave it waiting, or a stream
// sent once `until` settles, to see what shows while the answer is on its way.
type Answer = Chunk[] | { status: number; body: string } | { until: Promise<unknown>; chunks: Chunk[] } | "never"

// Answers POST /api/agent in the browser, so no test calls a model or reads a database.
async function fakeAgent(page: Page, ...answers: Answer[]) {
  const requests: Sent[] = []
  await page.route("**/api/agent", async (route) => {
    const answer = answers[requests.length] ?? "never"
    requests.push(route.request().postDataJSON() as Sent)
    if (answer === "never") return
    if ("status" in answer) return route.fulfill(answer)
    if ("until" in answer) await answer.until
    const chunks = "until" in answer ? answer.chunks : answer
    await route.fulfill({
      status: 200,
      headers: UI_MESSAGE_STREAM_HEADERS,
      body: [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join(""),
    })
  })
  return requests
}

export { askedAgain, declined, did, doesNotUnderstand, fakeAgent, proposes, refused, says, stopsWith, turn, type Sent }
