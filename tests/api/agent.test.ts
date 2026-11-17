import { Chat } from "@ai-sdk/react"
import { readUIMessageStream, simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, test, vi } from "vitest"
import { POST } from "@/app/api/agent/route"
import { agentStream, MAX_STEPS, type AgentMessage } from "@/lib/agent/agent"
import { agentChat } from "@/lib/agent/client"
import { db } from "@/lib/db"
import { currentUserId } from "@/lib/user"
import { nextYear, request, saveReminder, setUpTestDatabase } from "./helpers"

// The route asks lib/agent/model for its model; here it gets the scripted one, so no test reaches Groq.
const routeModel = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock("@/lib/agent/model", () => ({ agentModel: () => routeModel.current }))

setUpTestDatabase()

// A scripted stand-in for the model: each entry is what it "says" on one step. No API is called.
type Step = Extract<NonNullable<NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>["doStream"]>, unknown[]>[number]
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}
const callsTool = (toolName: string, input: object): Step => ({
  stream: simulateReadableStream({
    chunks: [
      { type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
      { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage },
    ],
  }),
})
const says = (text: string): Step => ({
  stream: simulateReadableStream({
    chunks: [
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: text },
      { type: "text-end" as const, id: "text-1" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
    ],
  }),
})
const fakeModel = (...steps: Step[]) => new MockLanguageModelV4({ doStream: steps })

const LAGOS = "Africa/Lagos"
const asking = (text: string): AgentMessage => ({ id: "you", role: "user", parts: [{ type: "text", text }] })

type ToolPart = {
  type: string
  state: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  approval?: { id: string; approved?: boolean; reason?: string }
}
const toolParts = (message: AgentMessage) => message.parts.filter((part) => part.type.startsWith("tool-")) as unknown as ToolPart[]
const previews = (message: AgentMessage) => message.parts.filter((part) => part.type === "data-preview").map((part) => (part as { data: unknown }).data)

// Runs one request to the agent and returns the assistant's message as the bar would hold it.
async function run(model: MockLanguageModelV4, conversation: AgentMessage[]) {
  const stream = agentStream({ model, messages: conversation, userId: await currentUserId(), timezone: LAGOS, now: new Date() })
  const continuing = conversation.at(-1)?.role === "assistant" ? conversation.at(-1) : undefined
  let latest: AgentMessage | undefined
  for await (const message of readUIMessageStream<AgentMessage>({ stream, message: continuing })) latest = message
  return latest!
}

// What pressing Enter (or Esc) on the preview does: answers the pending approval, as useChat does.
function answer(message: AgentMessage, approved: boolean): AgentMessage {
  return {
    ...message,
    parts: message.parts.map((part) => {
      const tool = part as unknown as ToolPart
      return tool.state === "approval-requested" ? ({ ...part, state: "approval-responded", approval: { ...tool.approval, approved } } as typeof part) : part
    }),
  }
}

async function approveThenRun(model: MockLanguageModelV4, question: AgentMessage, approved = true) {
  const proposed = await run(model, [question])
  const finished = await run(model, [question, answer(proposed, approved)])
  return { proposed, finished }
}

describe("reading", () => {
  test("a question only reads: the list runs without asking, in local time, leaving out cancelled and other people's", async () => {
    const gym = await saveReminder({ title: "Gym", dueAt: new Date(`${nextYear}-03-10T07:00:00Z`) })
    await saveReminder({ title: "Cancelled", dueAt: new Date(`${nextYear}-03-10T09:00:00Z`), status: "cancelled" })
    await saveReminder({ title: "Theirs", dueAt: new Date(`${nextYear}-03-10T10:00:00Z`), userId: "someone-else" })
    const model = fakeModel(callsTool("listReminders", { from: `${nextYear}-03-10`, to: `${nextYear}-03-10` }), says("You have Gym at 08:00."))

    const reply = await run(model, [asking("What's on March 10?")])

    const [list] = toolParts(reply)
    expect(list.state).toBe("output-available")
    expect(list.output).toEqual({
      reminders: [{ id: gym.id, title: "Gym", description: null, date: `${nextYear}-03-10`, time: "08:00", status: "pending" }],
    })
    expect(previews(reply)).toEqual([])
    expect(model.doStreamCalls).toHaveLength(2)
  })
})

describe("creating", () => {
  const question = asking("Remind me to call mum on the 13th at 6pm")
  // A function, not a value: a scripted stream can only be read once.
  const proposal = () => callsTool("createReminder", { title: "Call mum", date: `${nextYear}-03-13`, time: "18:00" })

  test("waits for your OK with a preview, and saves nothing yet", async () => {
    const model = fakeModel(proposal())

    const reply = await run(model, [question])

    expect(toolParts(reply).map((part) => part.state)).toEqual(["approval-requested"])
    expect(previews(reply)).toEqual([
      { action: "create", reminder: { title: "Call mum", description: null, date: `${nextYear}-03-13`, time: "18:00" } },
    ])
    expect(await db.reminder.count()).toBe(0)
    expect(model.doStreamCalls).toHaveLength(1)
  })

  test("approving saves it, with the exact moment worked out by the server", async () => {
    const model = fakeModel(proposal(), says("Done."))

    const { finished } = await approveThenRun(model, question)

    const saved = await db.reminder.findFirstOrThrow()
    expect(saved).toMatchObject({ title: "Call mum", timezone: LAGOS, status: "pending", userId: await currentUserId() })
    expect(saved.dueAt.toISOString()).toBe(`${nextYear}-03-13T17:00:00.000Z`)
    expect(toolParts(finished)[0]).toMatchObject({ state: "output-available", output: { done: "create" } })
  })

  test("declining saves nothing, and the model is told", async () => {
    const model = fakeModel(proposal(), says("OK, I won't."))

    await approveThenRun(model, question, false)

    expect(await db.reminder.count()).toBe(0)
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain("denied")
  })

  test("a time that has passed is refused before you see a preview, and the model is told why", async () => {
    const model = fakeModel(callsTool("createReminder", { title: "Call mum", date: "2020-01-01", time: "18:00" }), says("I can't do that."))

    const reply = await run(model, [question])

    expect(previews(reply)).toEqual([])
    expect(toolParts(reply)[0]).toMatchObject({ state: "output-denied", approval: { approved: false, reason: "Pick a time in the future" } })
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain("Pick a time in the future")
    expect(await db.reminder.count()).toBe(0)
  })
})

// The tool's own schema or the server's check refuses it, whichever comes first; either way you never see a card.
test.each([
  ["creating", "createReminder", () => ({ title: "   ", date: `${nextYear}-03-13`, time: "18:00" })],
  ["changing", "changeReminder", (id: string) => ({ id, title: "   " })],
])("a title of only spaces never reaches a preview when %s, and the model hears why", async (_case, toolName, input) => {
  const dentist = await saveReminder({ title: "Dentist" })
  const model = fakeModel(callsTool(toolName, input(dentist.id)), says("What should it be called?"))

  const reply = await run(model, [asking("Call it nothing")])

  expect(previews(reply)).toEqual([])
  expect(JSON.stringify(model.doStreamCalls[1].prompt.at(-1))).toMatch(/too_small|Add a title/)
  expect(await db.reminder.findMany()).toEqual([dentist])
})

describe("changing", () => {
  test("a new date keeps the time, and the preview shows before and after", async () => {
    const dentist = await saveReminder({ title: "Dentist", dueAt: new Date(`${nextYear}-03-10T08:00:00Z`) })
    const model = fakeModel(callsTool("changeReminder", { id: dentist.id, date: `${nextYear}-03-12` }), says("Moved."))

    const { proposed } = await approveThenRun(model, asking("Move the dentist to the 12th"))

    expect(previews(proposed)).toEqual([
      {
        action: "change",
        before: { title: "Dentist", description: null, date: `${nextYear}-03-10`, time: "09:00" },
        after: { title: "Dentist", description: null, date: `${nextYear}-03-12`, time: "09:00" },
      },
    ])
    const saved = await db.reminder.findUniqueOrThrow({ where: { id: dentist.id } })
    expect(saved.dueAt.toISOString()).toBe(`${nextYear}-03-12T08:00:00.000Z`)
    expect(saved.title).toBe("Dentist")
  })

  test("cancelling, then bringing back", async () => {
    const dentist = await saveReminder({ title: "Dentist" })

    await approveThenRun(fakeModel(callsTool("cancelReminder", { id: dentist.id }), says("Cancelled.")), asking("Cancel the dentist"))
    expect((await db.reminder.findUniqueOrThrow({ where: { id: dentist.id } })).status).toBe("cancelled")

    await approveThenRun(fakeModel(callsTool("restoreReminder", { id: dentist.id }), says("It's back.")), asking("Bring it back"))
    expect((await db.reminder.findUniqueOrThrow({ where: { id: dentist.id } })).status).toBe("pending")
  })

  test("if the reminder is sent while its card waits, your yes is turned down, and the card and the model hear why", async () => {
    const dentist = await saveReminder({ title: "Dentist" })
    const model = fakeModel(callsTool("cancelReminder", { id: dentist.id }), says("It was already sent."))
    const question = asking("Cancel the dentist")
    const proposed = await run(model, [question])
    await db.reminder.update({ where: { id: dentist.id }, data: { status: "sent", sentAt: new Date() } })

    const finished = await run(model, [question, answer(proposed, true)])

    const reason = "This reminder was already sent, so it can't be cancelled."
    expect(toolParts(finished)[0]).toMatchObject({ state: "output-denied", approval: { approved: true } })
    expect(finished.parts).toContainEqual({ type: "data-refused", id: "call-cancelReminder", data: { reason } })
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(reason)
    expect((await db.reminder.findUniqueOrThrow({ where: { id: dentist.id } })).status).toBe("sent")
  })

  test.each([
    ["a reminder that was already sent", { status: "sent" as const }, "already sent"],
    ["someone else's reminder", { userId: "someone-else" }, "No reminder has that id"],
  ])("%s is refused before you see a preview", async (_case, extra, reason) => {
    const reminder = await saveReminder(extra)
    const model = fakeModel(callsTool("cancelReminder", { id: reminder.id }), says("I can't."))

    const reply = await run(model, [asking("Cancel it")])

    expect(previews(reply)).toEqual([])
    expect(toolParts(reply)[0].approval?.reason).toContain(reason)
    expect((await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe(reminder.status)
  })
})

test("a reply stopped part way through a tool call doesn't break the next question", async () => {
  const model = fakeModel(says("You have nothing on Friday."))
  const stopped: AgentMessage = {
    id: "stopped",
    role: "assistant",
    parts: [{ type: "tool-listReminders", toolCallId: "call-1", state: "input-available", input: { from: `${nextYear}-03-13`, to: `${nextYear}-03-13` } }],
  }

  const reply = await run(model, [asking("What's on Friday?"), stopped, asking("What's on Friday, then?")])

  expect(reply.parts).toContainEqual(expect.objectContaining({ type: "text", text: "You have nothing on Friday." }))
  expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain("call-1")
})

test(`the agent stops after ${MAX_STEPS} steps, however often the model calls a tool`, async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => callsTool("listReminders", { from: `${nextYear}-03-10`, to: `${nextYear}-03-10` }),
  })

  await run(model, [asking("Keep looking")])

  expect(model.doStreamCalls).toHaveLength(MAX_STEPS)
})

describe("the agent route", () => {
  const post = (body: unknown) => POST(request("POST", "/api/agent", body))

  test.each([
    ["an unknown timezone", { messages: [asking("Hi")], timezone: "Mars/Olympus" }],
    ["no messages", { messages: [], timezone: LAGOS }],
    ["messages in the wrong shape", { messages: [{ hello: "there" }], timezone: LAGOS }],
    ["a body that isn't JSON", "not json"],
  ])("refuses %s before calling any model", async (_case, body) => {
    expect((await post(body)).status).toBe(400)
  })

  test("the bar's own conversation goes through: it asks, you approve, and the reminder is saved", async () => {
    routeModel.current = fakeModel(
      callsTool("createReminder", { title: "Call mum", date: `${nextYear}-03-13`, time: "18:00" }),
      says("Saved.")
    )
    const sent: Record<string, unknown>[] = []
    const chat = new Chat<AgentMessage>(
      agentChat({
        timezone: () => LAGOS,
        fetch: async (url, init) => {
          sent.push(JSON.parse(String(init?.body)))
          return POST(new Request(new URL(String(url), "http://localhost"), init))
        },
      })
    )

    await chat.sendMessage({ text: "Remind me to call mum on the 13th at 6pm" })
    const card = chat.messages.at(-1)!.parts.find((part) => part.type === "tool-createReminder")
    expect(card).toMatchObject({ state: "approval-requested" })
    expect(await db.reminder.count()).toBe(0)

    await chat.addToolApprovalResponse({ id: (card as { approval: { id: string } }).approval.id, approved: true })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    await vi.waitFor(() => expect(chat.status).toBe("ready"))

    expect(sent.map((body) => Object.keys(body).sort())).toEqual([["messages", "timezone"], ["messages", "timezone"]])
    expect(sent[0].timezone).toBe(LAGOS)
    expect(await db.reminder.count()).toBe(1)
    const reply = chat.messages.at(-1)!
    expect(reply.parts.find((part) => part.type === "tool-createReminder")).toMatchObject({
      state: "output-available",
      output: { done: "create", reminder: { title: "Call mum", due_at: `${nextYear}-03-13T17:00:00.000Z` } },
    })
    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: "Saved." })
  })
})
