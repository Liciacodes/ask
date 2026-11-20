import { Chat } from "@ai-sdk/react"
import { APICallError } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { POST } from "@/app/api/agent/route"
import type { AgentMessage } from "@/lib/agent/agent"
import { agentChat } from "@/lib/agent/client"
import { dailyLimits } from "@/lib/agent/limits"
import { problems } from "@/lib/agent/problems"
import { db } from "@/lib/db"
import { callsTool, fakeModel, says } from "./fake-model"
import { nextYear, OTHER_VISITOR, request, setUpTestDatabase, TEST_VISITOR, visitorCookie } from "./helpers"

// The route asks lib/agent/model for its model; here it gets a scripted one, so no test reaches Groq.
const routeModel = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock("@/lib/agent/model", () => ({ agentModel: () => routeModel.current }))

setUpTestDatabase()

const LAGOS = "Africa/Lagos"
const QUESTIONS = "ASK_VISITOR_QUESTIONS_PER_DAY"
const CALLS = "ASK_SITE_GROQ_CALLS_PER_DAY"

// A model that answers every call with a short reply.
const answering = () => new MockLanguageModelV4({ doStream: async () => says("OK.") })
// A model whose calls all fail before they start, the way Groq turns a call away.
const failing = (error: Error) =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw error
    },
  })
const rateLimited = () =>
  new APICallError({
    message: "Rate limit reached for model openai/gpt-oss-120b",
    url: "https://api.groq.com/openai/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 429,
    // Groq says when to try again; zero keeps the SDK's own retries instant here.
    responseHeaders: { "retry-after": "0" },
  })

let model: MockLanguageModelV4
const using = (next: MockLanguageModelV4) => {
  model = next
  routeModel.current = next
}

// One question from the bar, read to the end: the status, and the error the reply ended with, if any.
async function ask(visitor = TEST_VISITOR, text = "What's on today?") {
  const messages: AgentMessage[] = [{ id: "you", role: "user", parts: [{ type: "text", text }] }]
  const response = await POST(request("POST", "/api/agent", { messages, timezone: LAGOS }, { cookie: visitorCookie(visitor) }))
  const body = await response.text()
  const chunks = response.ok
    ? body
        .split("\n")
        .filter((line) => line.startsWith("data: {"))
        .map((line) => JSON.parse(line.slice(6)) as { type: string; errorText?: string })
    : []
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    refusal: response.ok ? undefined : (JSON.parse(body) as { error: string }).error,
    stoppedWith: chunks.find((chunk) => chunk.type === "error")?.errorText,
  }
}

const usage = async (subject: string) => {
  const row = await db.dailyUsage.findFirst({ where: { subject } })
  return { questions: row?.questions ?? 0, modelCalls: row?.modelCalls ?? 0, tokens: row?.tokens ?? 0 }
}

// The bar's own conversation, as the visitor, so a preview card can be answered the way Enter does.
function barFor(visitor: string) {
  const statuses: number[] = []
  const chat = new Chat<AgentMessage>(
    agentChat({
      timezone: () => LAGOS,
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers)
        headers.set("cookie", visitorCookie(visitor))
        const response = await POST(new Request(new URL(String(url), "http://localhost"), { ...init, headers }))
        statuses.push(response.status)
        return response
      },
    })
  )
  return { chat, statuses }
}

beforeEach(() => {
  using(answering())
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("each visitor's questions", () => {
  test("a visitor can ask 10 questions a day; the 11th is turned away before any model call, saying when to come back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"))

    for (let question = 1; question <= 10; question++) expect((await ask()).status).toBe(200)
    const eleventh = await ask()

    expect(eleventh).toMatchObject({
      status: 429,
      refusal: "You've used today's 10 questions. You can ask again from 01:00. Create reminder still works.",
      retryAfter: String(9 * 60 * 60),
    })
    expect(model.doStreamCalls).toHaveLength(10)
    expect(await usage(TEST_VISITOR)).toMatchObject({ questions: 10 })
  })

  test("the limit is each visitor's own: one visitor using theirs up leaves another's alone", async () => {
    vi.stubEnv(QUESTIONS, "1")

    expect((await ask(TEST_VISITOR)).status).toBe(200)
    expect((await ask(TEST_VISITOR)).status).toBe(429)
    expect((await ask(OTHER_VISITOR)).status).toBe(200)
  })

  test("answering a preview card isn't a new question, so the last question of the day can still be approved", async () => {
    vi.stubEnv(QUESTIONS, "1")
    using(fakeModel(callsTool("createReminder", { title: "Call mum", date: `${nextYear}-03-13`, time: "18:00" }), says("Saved.")))
    const { chat, statuses } = barFor(TEST_VISITOR)

    await chat.sendMessage({ text: "Remind me to call mum on the 13th at 6pm" })
    const card = chat.messages.at(-1)!.parts.find((part) => part.type === "tool-createReminder") as { approval: { id: string } }
    await chat.addToolApprovalResponse({ id: card.approval.id, approved: true })
    await vi.waitFor(() => expect(statuses).toHaveLength(2))
    await vi.waitFor(() => expect(chat.status).toBe("ready"))

    expect(statuses).toEqual([200, 200])
    expect(await db.reminder.count()).toBe(1)
    expect(await usage(TEST_VISITOR)).toMatchObject({ questions: 1 })
    expect((await ask()).status).toBe(429)
  })

  test("a new day starts at midnight UTC, which is 01:00 in Lagos", async () => {
    vi.stubEnv(QUESTIONS, "1")
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-20T23:59:30Z"))
    await ask()

    expect(await ask()).toMatchObject({ status: 429, retryAfter: "30", refusal: expect.stringContaining("from 01:00") })

    vi.setSystemTime(new Date("2026-11-21T00:00:00Z"))
    expect((await ask()).status).toBe(200)
  })

  test("two questions at the same moment can't both take the last one", async () => {
    vi.stubEnv(QUESTIONS, "1")

    const both = await Promise.all([ask(), ask()])

    expect(both.map((reply) => reply.status).sort()).toEqual([200, 429])
    expect(model.doStreamCalls).toHaveLength(1)
  })
})

describe("the site's calls to the model", () => {
  test("every call counts, with the tokens it used, whoever asked", async () => {
    using(fakeModel(callsTool("listReminders", { from: `${nextYear}-03-10`, to: `${nextYear}-03-10` }), says("Nothing then."), says("Hi.")))

    await ask(TEST_VISITOR, "What's on March 10?")
    await ask(OTHER_VISITOR, "Hello")

    expect(await usage("site")).toMatchObject({ modelCalls: 3, tokens: 45 })
  })

  test("once today's calls are used up, a new question is turned away before reaching the model, and costs nothing", async () => {
    vi.stubEnv(CALLS, "1")
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"))
    await ask(OTHER_VISITOR)

    expect(await ask()).toMatchObject({
      status: 429,
      refusal: "Ask has answered all it can for today. You can ask again from 01:00. Create reminder still works.",
      retryAfter: String(9 * 60 * 60),
    })
    expect(model.doStreamCalls).toHaveLength(1)
    expect(await usage(TEST_VISITOR)).toMatchObject({ questions: 0 })
  })

  test("a reply that runs out part way stops there, says so, and gives the visitor's question back", async () => {
    vi.stubEnv(CALLS, "1")
    using(fakeModel(callsTool("listReminders", { from: `${nextYear}-03-10`, to: `${nextYear}-03-10` }), says("Nothing then.")))

    const reply = await ask()

    expect(reply).toMatchObject({ status: 200, stoppedWith: problems.siteUsedUp })
    expect(model.doStreamCalls).toHaveLength(1)
    expect(await usage("site")).toMatchObject({ modelCalls: 1 })
    expect(await usage(TEST_VISITOR)).toMatchObject({ questions: 0 })
  })

  test("questions at the same moment can't make more calls than the day allows", async () => {
    vi.stubEnv(CALLS, "1")

    await Promise.all([ask(TEST_VISITOR), ask(OTHER_VISITOR)])

    expect(model.doStreamCalls).toHaveLength(1)
    expect(await usage("site")).toMatchObject({ modelCalls: 1 })
  })

  test("0 calls a day turns the agent off", async () => {
    vi.stubEnv(CALLS, "0")

    expect(await ask()).toMatchObject({ status: 429, refusal: expect.stringContaining("Ask has answered all it can for today") })
    expect(model.doStreamCalls).toHaveLength(0)
  })
})

describe("when Groq turns calls away", () => {
  test("after the SDK's own retries, the reply says Ask is busy, and gives back the site's calls and the visitor's question", async () => {
    using(failing(rateLimited()))

    const reply = await ask()

    expect(reply).toMatchObject({ status: 200, stoppedWith: "Ask is busy right now. Try again in a minute." })
    expect(model.doStreamCalls).toHaveLength(3)
    expect(await usage("site")).toMatchObject({ modelCalls: 0 })
    expect(await usage(TEST_VISITOR)).toMatchObject({ questions: 0 })
  })

  test("the bar shows the busy reply, and the next question goes through", async () => {
    using(failing(rateLimited()))
    const { chat, statuses } = barFor(TEST_VISITOR)

    await chat.sendMessage({ text: "What's on today?" })
    expect(chat.error?.message).toBe(problems.busy)
    using(answering())
    await chat.sendMessage({ text: "What's on today, then?" })

    expect(statuses).toEqual([200, 200])
    expect(chat.error).toBeUndefined()
    expect(chat.messages.at(-1)!.parts).toContainEqual(expect.objectContaining({ type: "text", text: "OK." }))
  })

  test("any other failure isn't called busy, and its calls are given back too", async () => {
    using(failing(new Error("connect ECONNREFUSED")))

    const reply = await ask()

    expect(reply.stoppedWith).toBe("Ask couldn't get an answer.")
    expect(await usage("site")).toMatchObject({ modelCalls: 0 })
  })
})

describe("the settings", () => {
  test("left empty, a visitor gets 10 questions a day and the site 60 calls", () => {
    vi.stubEnv(QUESTIONS, "")
    vi.stubEnv(CALLS, "")

    expect(dailyLimits()).toEqual({ visitorQuestions: 10, siteModelCalls: 60 })
  })

  test.each([QUESTIONS, CALLS])("%s that isn't a whole number stops the request and names the setting", async (name) => {
    vi.stubEnv(name, "lots")

    await expect(ask()).rejects.toThrow(`${name} must be a whole number`)
    expect(model.doStreamCalls).toHaveLength(0)
  })
})
