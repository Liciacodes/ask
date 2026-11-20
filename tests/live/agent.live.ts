// Real Groq calls, on the sentences in tests/agent-cases.ts: run `npm run test:live` only when the person paying says yes.
// Its own config keeps it out of `npm run test:api` and CI.
//
// All 30 take about 50 calls and 120,000 tokens, over half of Groq's free day, and the live site shares that
// allowance. Run them when the site is quiet, or a few at a time: `npm run test:live -- -t "dentist"`.
import { readUIMessageStream, wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { afterEach, expect, test, vi } from "vitest"
import { agentStream, type AgentMessage } from "@/lib/agent/agent"
import { agentModel } from "@/lib/agent/model"
import type { Preview } from "@/lib/agent/plans"
import { agentCases } from "../agent-cases"
import { saveAll, setUpTestDatabase, TEST_VISITOR } from "../api/helpers"

setUpTestDatabase()

const MAX_CALLS_PER_CASE = 3

// Groq's free tier takes 8,000 tokens a minute, and one call uses about 2,500, so each call waits until the
// last minute's calls leave room for it. Groq's own retry-after covers the rest.
const TOKENS_PER_MINUTE = 8_000
const TOKENS_PER_CALL = 2_500
const spent: { at: number; tokens: number }[] = []

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>
type StreamPart = Awaited<ReturnType<Parameters<WrapStream>[0]["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never

async function roomForACall() {
  for (;;) {
    const minuteAgo = performance.now() - 60_000
    while (spent.length > 0 && spent[0].at < minuteAgo) spent.shift()
    const used = spent.reduce((sum, call) => sum + call.tokens, 0)
    if (used + TOKENS_PER_CALL <= TOKENS_PER_MINUTE) return
    await new Promise((resolve) => setTimeout(resolve, spent[0].at - minuteAgo + 100))
  }
}

function pacedModel() {
  let calls = 0
  return wrapLanguageModel({
    model: agentModel(),
    middleware: {
      wrapStream: async ({ doStream }) => {
        if (++calls > MAX_CALLS_PER_CASE) throw new Error(`More than ${MAX_CALLS_PER_CASE} Groq calls for one sentence`)
        await roomForACall()
        const { stream, ...rest } = await doStream()
        const counting = new TransformStream<StreamPart, StreamPart>({
          transform(part, controller) {
            if (part.type === "finish") spent.push({ at: performance.now(), tokens: (part.usage.inputTokens.total ?? 0) + (part.usage.outputTokens.total ?? 0) })
            controller.enqueue(part)
          },
        })
        return { ...rest, stream: stream.pipeThrough(counting) }
      },
    },
  })
}

afterEach(() => {
  vi.useRealTimers()
})

const actions = new Set(["tool-createReminder", "tool-changeReminder", "tool-cancelReminder", "tool-restoreReminder"])
const containing = (word: string) => expect.stringMatching(new RegExp(word, "i"))

test.each(agentCases)("the real model answers “$say” with: $expect.does", async (agentCase) => {
  // The clock reads the moment the sentence was typed, as in the API tests, so the case means the same on any day.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(agentCase.now))
  await saveAll(agentCase.saved, agentCase.timezone)

  const stream = agentStream({
    model: pacedModel(),
    messages: [{ id: "you", role: "user", parts: [{ type: "text", text: agentCase.say }] }],
    userId: TEST_VISITOR,
    timezone: agentCase.timezone,
    now: new Date(agentCase.now),
  })
  let reply: AgentMessage | undefined
  for await (const message of readUIMessageStream<AgentMessage>({ stream })) reply = message

  // What the person would see: the cards, the lists the model looked at, and its words.
  const parts = reply?.parts ?? []
  const cards = parts.flatMap((part) => (part.type === "data-preview" ? [part.data as Preview] : []))
  const lists = parts.flatMap((part) => (part.type === "tool-listReminders" && "input" in part && part.input ? [part.input] : []))
  const tried = parts.filter((part) => actions.has(part.type)).map((part) => ("input" in part ? { [part.type]: part.input } : part.type))
  const text = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")
  const did = JSON.stringify({ cards, lists, tried, text })
  console.log(`“${agentCase.say}” → ${did}`)

  const expected = agentCase.expect
  switch (expected.does) {
    case "create":
      expect(cards, did).toMatchObject([
        {
          action: "create",
          reminder: {
            title: containing(expected.has.title),
            ...(expected.has.description && { description: containing(expected.has.description) }),
            date: expected.reminder.date,
            time: expected.reminder.time,
          },
        },
      ])
      expect(cards, did).toHaveLength(1)
      break
    case "change":
      expect(cards, did).toMatchObject([
        { action: "change", after: { ...expected.after, title: expected.has ? containing(expected.has.title) : expected.after.title } },
      ])
      expect(cards, did).toHaveLength(1)
      break
    case "cancel":
    case "restore":
      expect(cards, did).toMatchObject([{ action: expected.does, reminder: { title: expected.reminder } }])
      expect(cards, did).toHaveLength(1)
      break
    case "list":
      expect(cards, did).toEqual([])
      expect(lists.some(({ from, to }) => from !== undefined && to !== undefined && from <= expected.from && to >= expected.to), did).toBe(true)
      for (const word of expected.mentions) expect(text, did).toMatch(new RegExp(word, "i"))
      break
    case "ask":
      expect(cards, did).toEqual([])
      expect(text, did).toContain("?")
      break
    case "refuse":
      expect(cards, did).toEqual([])
      break
  }
})
