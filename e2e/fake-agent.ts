import type { Page } from "@playwright/test"
import { UI_MESSAGE_STREAM_HEADERS, type InferUIMessageChunk } from "ai"
import type { AgentMessage } from "@/lib/agent/agent"
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

const turn = (...pieces: Chunk[][]): Chunk[] => [
  { type: "start", messageId: "reply-1" },
  { type: "start-step" },
  ...pieces.flat(),
  { type: "finish-step" },
  { type: "finish" },
]

type Sent = { messages: AgentMessage[]; timezone: string }
// A scripted answer for each request in turn: a stream, an error response, or "never" to leave it waiting.
type Answer = Chunk[] | { status: number; body: string } | "never"

// Answers POST /api/agent in the browser, so no test calls a model or reads a database.
async function fakeAgent(page: Page, ...answers: Answer[]) {
  const requests: Sent[] = []
  await page.route("**/api/agent", async (route) => {
    const answer = answers[requests.length] ?? "never"
    requests.push(route.request().postDataJSON() as Sent)
    if (answer === "never") return
    if ("status" in answer) return route.fulfill(answer)
    await route.fulfill({
      status: 200,
      headers: UI_MESSAGE_STREAM_HEADERS,
      body: [...answer.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join(""),
    })
  })
  return requests
}

export { declined, did, fakeAgent, proposes, refused, says, turn, type Sent }
