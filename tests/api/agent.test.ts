import { Chat } from "@ai-sdk/react"
import { readUIMessageStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { POST } from "@/app/api/agent/route"
import { agentStream, MAX_STEPS, type AgentMessage } from "@/lib/agent/agent"
import { agentChat } from "@/lib/agent/client"
import { db } from "@/lib/db"
import { localDateTime } from "@/lib/time"
import { agentCases, type AgentCase, type Expected, type Saved } from "../agent-cases"
import { callsTool, fakeModel, says } from "./fake-model"
import { nextYear, OTHER_VISITOR, request, saveAll, saveReminder, setUpTestDatabase, TEST_VISITOR, visitorCookie } from "./helpers"

// The route asks lib/agent/model for its model; here it gets the scripted one, so no test reaches Groq.
const routeModel = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock("@/lib/agent/model", () => ({ agentModel: () => routeModel.current }))

setUpTestDatabase()

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
async function run(model: MockLanguageModelV4, conversation: AgentMessage[], { timezone = LAGOS, now = new Date() } = {}) {
  const stream = agentStream({ model, messages: conversation, userId: TEST_VISITOR, timezone, now })
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
    expect(saved).toMatchObject({ title: "Call mum", timezone: LAGOS, status: "pending", userId: TEST_VISITOR })
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

// What the model is told: its instructions, and the calendar in them.
const toldIn = (model: MockLanguageModelV4) => String(model.doStreamCalls[0].prompt.find((message) => message.role === "system")?.content)
const calendarIn = (model: MockLanguageModelV4) =>
  toldIn(model)
    .split("\n")
    .filter((line) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{4}-\d{2}-\d{2}/.test(line))

describe("dates", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("the model gets the next 14 days with their weekdays, from today, across the end of the month", async () => {
    const model = fakeModel(says("OK."))

    await run(model, [asking("Hi")], { now: new Date("2026-11-18T20:36:00+01:00") })

    const calendar = calendarIn(model)
    expect(calendar).toHaveLength(14)
    expect(calendar.slice(0, 4)).toEqual(["Wed 2026-11-18 (today)", "Thu 2026-11-19 (tomorrow)", "Fri 2026-11-20", "Sat 2026-11-21"])
    expect(calendar.at(-1)).toBe("Tue 2026-12-01")
  })

  test("today is the person's date, not the server's: just after midnight in Lagos it's already Thursday", async () => {
    const model = fakeModel(says("OK."))

    await run(model, [asking("Hi")], { now: new Date("2026-11-19T00:30:00+01:00") })

    expect(calendarIn(model)[0]).toBe("Thu 2026-11-19 (today)")
  })

  test("the calendar is a lookup, not a limit: a date months past it gets its card", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-18T10:20:00+01:00"))
    const flights = { title: "Book flights", date: "2027-03-03", time: "10:00" }
    const model = fakeModel(callsTool("createReminder", flights))

    const reply = await run(model, [asking("book flights on 3 March at 10am")], { now: new Date() })

    expect(toldIn(model)).toContain("It's a lookup, not a limit: any future date is fine, however far ahead.")
    expect(previews(reply)).toEqual([{ action: "create", reminder: { description: null, ...flights } }])
  })

  test("a wrong weekday in the model's words is put right before you see it, even when it arrives in pieces", async () => {
    const model = fakeModel(says("Your rent is due Fri", "day December 1", "st at 09:00, and the report Thursday 23 November."))

    const reply = await run(model, [asking("when are rent and the report due?")], { now: new Date("2026-11-18T10:20:00+01:00") })

    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: "Your rent is due Tuesday December 1st at 09:00, and the report Monday 23 November." })
  })
})

describe("what Groq is sent", () => {
  test("each tool's fields keep their types, descriptions and required list, without the checks only the server needs", async () => {
    const model = fakeModel(says("OK."))

    await run(model, [asking("Hi")])

    const tools = model.doStreamCalls[0].tools!
    expect(tools.map((tool) => tool.name)).toEqual(["listReminders", "createReminder", "changeReminder", "cancelReminder", "restoreReminder"])
    expect(JSON.stringify(tools)).not.toMatch(/"(\$schema|pattern|format|minLength|maxLength|additionalProperties)"/)
    const create = tools.find((tool) => tool.name === "createReminder")!
    expect(create.type === "function" && create.inputSchema).toMatchObject({
      type: "object",
      required: ["title", "date", "time"],
      properties: {
        title: { type: "string", description: expect.any(String) },
        description: { type: "string", description: expect.any(String) },
        date: { type: "string", description: expect.any(String) },
        time: { type: "string", description: expect.any(String) },
      },
    })
  })

  test("an impossible date is still caught by the full schema: no card, nothing saved, and the model is told", async () => {
    const model = fakeModel(callsTool("createReminder", { title: "Pay rent", date: "2026-02-30", time: "09:00" }), says("That date doesn't exist."))

    const reply = await run(model, [asking("pay rent on 30 February at 9am")])

    expect(previews(reply)).toEqual([])
    expect(reply.parts).toContainEqual(expect.objectContaining({ type: "dynamic-tool", toolName: "createReminder", state: "output-error" }))
    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: "That date doesn't exist." })
    expect(await db.reminder.count()).toBe(0)
  })
})

describe("asking only when it must", () => {
  const instructions = async () => {
    const model = fakeModel(says("OK."))
    await run(model, [asking("Hi")])
    return toldIn(model)
  }

  test("the card is the question: knowing what and when, the model is told to call the tool, never to ask in words", async () => {
    const told = await instructions()

    expect(told).toContain("The preview card is your question. When you know what to do and when, call the tool straight away")
    expect(told).toContain('Never ask "Do you want…?" or "Shall I…?" in words.')
  })

  test("a time, a weekday or “the 1st” on its own is read without asking", async () => {
    const told = await instructions()

    expect(told).toContain("a time with no day is the next time it comes round (today if it's still ahead, otherwise tomorrow)")
    expect(told).toContain('a weekday on its own or with "this" is the nearest one that hasn\'t passed')
    expect(told).toContain('a day of the month on its own, like "the 1st", is the next one that hasn\'t passed')
  })

  test("only “next” with a weekday is unclear, and looking never asks", async () => {
    const told = await instructions()

    expect(told).toContain('Only "next" with a weekday, as in next Friday, is unclear')
    expect(told).toContain("looking never needs a question")
    // "Which Friday" as the example of something unclear made the model ask about every Friday.
    expect(told).not.toMatch(/which Friday/i)
  })

  test.each(["call dad on Friday at 6pm", "call dad this Friday at 6pm"])("“%s” gets its card: the server only asks about “next”", async (said) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-18T10:20:00+01:00"))
    const model = fakeModel(callsTool("createReminder", { title: "Call dad", date: "2026-11-20", time: "18:00" }))

    const reply = await run(model, [asking(said)], { now: new Date() })

    expect(previews(reply)).toHaveLength(1)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})

// Each expected answer in tests/agent-cases.ts, sent through the server with a scripted model: the card the person
// would see, and what's saved once they say yes. `npm run test:live` checks the real model gives these answers.
describe("the test sentences", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  type Case<Does extends Expected["does"]> = AgentCase & { expect: Extract<Expected, { does: Does }> }
  const casesThat = <Does extends Expected["does"]>(...does: Does[]) =>
    agentCases.filter((agentCase): agentCase is Case<Does> => (does as string[]).includes(agentCase.expect.does))

  // The clock reads the moment the sentence was typed, so each case means the same on any day.
  async function typed(agentCase: AgentCase) {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(agentCase.now))
    const ids = await saveAll(agentCase.saved, agentCase.timezone)
    const at = { now: new Date(agentCase.now), timezone: agentCase.timezone }
    return { ids, at, question: asking(agentCase.say) }
  }

  const weekdayOf = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
  const card = (saved: Saved) => ({ title: saved.title, description: null, date: saved.date, time: saved.time })

  test("there are 30", () => {
    expect(agentCases).toHaveLength(30)
  })

  test.each(casesThat("create"))("“$say” previews and saves $expect.reminder.date at $expect.reminder.time", async (agentCase) => {
    const { at, question } = await typed(agentCase)
    const { reminder, savedAt } = agentCase.expect
    const model = fakeModel(callsTool("createReminder", reminder), says("Saved."))

    const proposed = await run(model, [question], at)
    await run(model, [question, answer(proposed, true)], at)

    expect(previews(proposed)).toEqual([{ action: "create", reminder: { description: null, ...reminder } }])
    const saved = await db.reminder.findFirstOrThrow()
    expect(saved).toMatchObject({ title: reminder.title, description: reminder.description ?? null, timezone: agentCase.timezone })
    expect(saved.dueAt.toISOString()).toBe(savedAt)
    // A date in the next 14 days is handed to the model with its weekday, so the model never works it out.
    const calendar = calendarIn(model)
    const inCalendar = reminder.date <= calendar.at(-1)!.slice(4, 14)
    expect(calendar.some((line) => line.startsWith(`${weekdayOf(reminder.date)} ${reminder.date}`))).toBe(inCalendar)
  })

  test.each(casesThat("change"))("“$say” previews $expect.reminder before and after, and saying yes saves it", async (agentCase) => {
    const { ids, at, question } = await typed(agentCase)
    const { reminder, input, after } = agentCase.expect
    const id = ids.get(reminder)!
    const model = fakeModel(callsTool("changeReminder", { id, ...input }), says("Changed."))

    const proposed = await run(model, [question], at)
    await run(model, [question, answer(proposed, true)], at)

    const was = agentCase.saved!.find((saved) => saved.title === reminder)!
    expect(previews(proposed)).toEqual([{ action: "change", before: card(was), after: { description: null, ...after } }])
    const saved = await db.reminder.findUniqueOrThrow({ where: { id } })
    expect({ title: saved.title, ...localDateTime(saved.dueAt, agentCase.timezone) }).toEqual(after)
  })

  test.each(casesThat("cancel", "restore"))("“$say” previews $expect.reminder to $expect.does, and saying yes does it", async (agentCase) => {
    const { ids, at, question } = await typed(agentCase)
    const { reminder, does } = agentCase.expect
    const id = ids.get(reminder)!
    const model = fakeModel(callsTool(`${does}Reminder`, { id }), says("Done."))

    const proposed = await run(model, [question], at)
    await run(model, [question, answer(proposed, true)], at)

    expect(previews(proposed)).toEqual([{ action: does, reminder: card(agentCase.saved!.find((saved) => saved.title === reminder)!) }])
    expect((await db.reminder.findUniqueOrThrow({ where: { id } })).status).toBe(does === "cancel" ? "cancelled" : "pending")
  })

  test.each(casesThat("list"))("“$say” lists $expect.from to $expect.to and proposes nothing", async (agentCase) => {
    const { at, question } = await typed(agentCase)
    const { from, to, finds } = agentCase.expect
    const model = fakeModel(callsTool("listReminders", { from, to }), says("Here's what you have."))

    const reply = await run(model, [question], at)

    const [list] = toolParts(reply)
    expect(list.state).toBe("output-available")
    expect((list.output!.reminders as { title: string }[]).map((found) => found.title)).toEqual(finds)
    expect(previews(reply)).toEqual([])
  })

  test.each(casesThat("ask", "refuse"))("“$say” shows no card and changes nothing", async (agentCase) => {
    const { ids, at, question } = await typed(agentCase)
    const expected = agentCase.expect
    const tries = "tries" in expected ? expected.tries : undefined
    const before = await db.reminder.findMany()
    const model = fakeModel(
      ...(tries ? [callsTool(tries.tool, { ...tries.input, ...(tries.on && { id: ids.get(tries.on) }) })] : []),
      says(expected.says)
    )

    const reply = await run(model, [question], at)

    expect(previews(reply)).toEqual([])
    if (tries) expect(reply.parts).toContainEqual({ type: "data-refused", id: `call-${tries.tool}`, data: { reason: tries.reason } })
    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: expected.says })
    expect(await db.reminder.findMany()).toEqual(before)
  })
})

describe("“next” with a weekday", () => {
  // Wednesday 18 November in Lagos, so next Friday could be the 20th or the 27th.
  const at = { now: new Date("2026-11-18T10:20:00+01:00"), timezone: LAGOS }
  const whichFriday = "Do you mean Friday 20 November or Friday 27 November?"
  const dentistOn = (date: string) => callsTool("createReminder", { title: "Dentist", date, time: "09:00" })
  const asked: AgentMessage = { id: "asked", role: "assistant", parts: [{ type: "text", text: whichFriday }] }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(at.now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("a card the model guesses for “next Friday” becomes the question, with nothing to approve", async () => {
    const model = fakeModel(dentistOn("2026-11-20"))

    const reply = await run(model, [asking("dentist next Friday at 9am")], at)

    expect(previews(reply)).toEqual([])
    expect(toolParts(reply)).toEqual([])
    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: whichFriday })
    expect(model.doStreamCalls).toHaveLength(1)
    expect(await db.reminder.count()).toBe(0)
  })

  test("the answer that names the date gets its card", async () => {
    const model = fakeModel(dentistOn("2026-11-27"))

    const reply = await run(model, [asking("dentist next Friday at 9am"), asked, asking("the 27th")], at)

    expect(previews(reply)).toEqual([{ action: "create", reminder: { title: "Dentist", description: null, date: "2026-11-27", time: "09:00" } }])
  })

  test("a date in the same words settles it", async () => {
    const reply = await run(fakeModel(dentistOn("2026-11-27")), [asking("dentist next Friday the 27th at 9am")], at)

    expect(previews(reply)).toHaveLength(1)
  })

  test("looking is never held up: the list runs, and the model's words go through as they were", async () => {
    const model = fakeModel(callsTool("listReminders", { from: "2026-11-20", to: "2026-11-27" }), says("Nothing on either Friday."))

    const reply = await run(model, [asking("what's on next Friday?")], at)

    expect(toolParts(reply).map((part) => part.state)).toEqual(["output-available"])
    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: "Nothing on either Friday." })
  })

  test("cancelling is asked about too, and the reminder stays", async () => {
    const dentist = await saveReminder({ title: "Dentist", dueAt: new Date("2026-11-20T08:00:00Z") })
    const model = fakeModel(callsTool("cancelReminder", { id: dentist.id }))

    const reply = await run(model, [asking("cancel the dentist next Friday")], at)

    expect(previews(reply)).toEqual([])
    expect(reply.parts.at(-1)).toMatchObject({ type: "text", text: whichFriday })
    expect((await db.reminder.findUniqueOrThrow({ where: { id: dentist.id } })).status).toBe("pending")
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

  test("the agent only ever sees and changes the asking visitor's reminders", async () => {
    const mine = await saveReminder({ title: "Mine", dueAt: new Date(`${nextYear}-03-10T08:00:00Z`) })
    await saveReminder({ title: "Theirs", dueAt: new Date(`${nextYear}-03-10T09:00:00Z`), userId: OTHER_VISITOR })
    routeModel.current = fakeModel(
      callsTool("listReminders", { from: `${nextYear}-03-10`, to: `${nextYear}-03-10` }),
      says("You have one."),
      callsTool("cancelReminder", { id: mine.id }),
      says("I can't find that one.")
    )
    const chat = new Chat<AgentMessage>(
      agentChat({
        timezone: () => LAGOS,
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers)
          headers.set("cookie", visitorCookie(OTHER_VISITOR))
          return POST(new Request(new URL(String(url), "http://localhost"), { ...init, headers }))
        },
      })
    )

    await chat.sendMessage({ text: "What's on March 10?" })
    const listed = chat.messages.at(-1)!.parts.find((part) => part.type === "tool-listReminders")
    await chat.sendMessage({ text: `Cancel ${mine.id}` })
    const cancel = chat.messages.at(-1)!.parts.find((part) => part.type === "tool-cancelReminder")

    expect(listed).toMatchObject({ state: "output-available", output: { reminders: [{ title: "Theirs" }] } })
    expect(cancel).toMatchObject({ state: "output-denied", approval: { approved: false, reason: expect.stringContaining("No reminder has that id") } })
    expect((await db.reminder.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("pending")
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
        // The browser adds the visitor's cookie to each request; here the test does.
        fetch: async (url, init) => {
          sent.push(JSON.parse(String(init?.body)))
          const headers = new Headers(init?.headers)
          headers.set("cookie", visitorCookie(TEST_VISITOR))
          return POST(new Request(new URL(String(url), "http://localhost"), { ...init, headers }))
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
