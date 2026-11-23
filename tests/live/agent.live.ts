// Real Groq calls, on the sentences in tests/agent-cases.ts: run `npm run test:live` only when the person paying says yes.
// Its own config keeps it out of `npm run test:api` and CI.
//
// All 32 take about 52 calls and, at the last live run's 1,150 tokens in and up to 180 out a call, about 70,000
// tokens: a third of Groq's free day, which the live site shares. Run them when the site is quiet, or a few at a
// time: `npm run test:live -- -t "dentist"`.
import { APICallError, readUIMessageStream, wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { afterEach, expect, test, vi } from "vitest"
import { agentStream, type AgentMessage } from "@/lib/agent/agent"
import { agentModel } from "@/lib/agent/model"
import type { Preview } from "@/lib/agent/plans"
import { agentCases } from "../agent-cases"
import { saveAll, setUpTestDatabase, TEST_VISITOR } from "../api/helpers"

setUpTestDatabase()

const MAX_CALLS_PER_CASE = 3

// Groq's free tier takes 8,000 tokens a minute, so each call waits until the last minute's calls leave room for one
// as big as the biggest so far. If that guess is still short, Groq says how long to wait, and the live run waits it
// out (the site doesn't: see waitsBriefly in lib/agent/limits.ts). Each sentence's log line says how long it waited.
const TOKENS_PER_MINUTE = 8_000
const FIRST_GUESS_PER_CALL = 2_500
const GROQ_WAITS_PER_CALL = 3
const spent: { at: number; tokens: number }[] = []
let biggestCall = FIRST_GUESS_PER_CALL

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>
type StreamPart = Awaited<ReturnType<Parameters<WrapStream>[0]["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never
// What one sentence cost: each call's tokens in (instructions, tools, conversation) and out (reasoning and reply),
// and the time spent waiting for room.
type Cost = { calls: { input: number; output: number }[]; pacedMs: number; groqMs: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function roomForACall() {
  for (;;) {
    const minuteAgo = performance.now() - 60_000
    while (spent.length > 0 && spent[0].at < minuteAgo) spent.shift()
    const used = spent.reduce((sum, call) => sum + call.tokens, 0)
    if (spent.length === 0 || used + biggestCall <= TOKENS_PER_MINUTE) return
    await sleep(spent[0].at - minuteAgo + 100)
  }
}

async function waitingForGroq<T>(call: () => PromiseLike<T>, cost: Cost) {
  for (let waits = 0; ; waits++) {
    try {
      return await call()
    } catch (error) {
      if (waits === GROQ_WAITS_PER_CALL || !APICallError.isInstance(error) || error.statusCode !== 429) throw error
      const seconds = Number(error.responseHeaders?.["retry-after"])
      const ms = (Number.isFinite(seconds) ? seconds * 1000 : 10_000) + 250
      cost.groqMs += ms
      await sleep(ms)
    }
  }
}

function pacedModel(cost: Cost) {
  let calls = 0
  return wrapLanguageModel({
    model: agentModel(),
    middleware: {
      wrapStream: async ({ doStream }) => {
        if (++calls > MAX_CALLS_PER_CASE) throw new Error(`More than ${MAX_CALLS_PER_CASE} Groq calls for one sentence`)
        const pacing = performance.now()
        await roomForACall()
        cost.pacedMs += performance.now() - pacing
        const { stream, ...rest } = await waitingForGroq(doStream, cost)
        const counting = new TransformStream<StreamPart, StreamPart>({
          transform(part, controller) {
            if (part.type === "finish") {
              const call = { input: part.usage.inputTokens.total ?? 0, output: part.usage.outputTokens.total ?? 0 }
              spent.push({ at: performance.now(), tokens: call.input + call.output })
              biggestCall = Math.max(biggestCall, call.input + call.output)
              cost.calls.push(call)
            }
            controller.enqueue(part)
          },
        })
        return { ...rest, stream: stream.pipeThrough(counting) }
      },
    },
  })
}

const seconds = (ms: number) => `${Math.round(ms / 1000)}s`
const costOf = ({ calls, pacedMs, groqMs }: Cost) =>
  `${calls.length} call${calls.length === 1 ? "" : "s"}, tokens in + out: ${calls.map(({ input, output }) => `${input} + ${output}`).join(", ")}; ` +
  `waited ${seconds(pacedMs)} for the minute's tokens, ${seconds(groqMs)} for Groq`

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

  const cost: Cost = { calls: [], pacedMs: 0, groqMs: 0 }
  const stream = agentStream({
    model: pacedModel(cost),
    messages: [{ id: "you", role: "user", parts: [{ type: "text", text: agentCase.say }] }],
    userId: TEST_VISITOR,
    timezone: agentCase.timezone,
    now: new Date(agentCase.now),
  })
  let reply: AgentMessage | undefined
  for await (const message of readUIMessageStream<AgentMessage>({ stream })) reply = message

  // What the person would see: the cards, the lists the model looked at, why it didn't understand, and its words.
  const parts = reply?.parts ?? []
  const cards = parts.flatMap((part) => (part.type === "data-preview" ? [part.data as Preview] : []))
  const lists = parts.flatMap((part) => (part.type === "tool-listReminders" && "input" in part && part.input ? [part.input] : []))
  const tried = parts.filter((part) => actions.has(part.type)).map((part) => ("input" in part ? { [part.type]: part.input } : part.type))
  const notUnderstood = parts.flatMap((part) => (part.type === "tool-didNotUnderstand" && "input" in part && part.input ? [part.input.reason] : []))
  const text = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")
  const did = JSON.stringify({ cards, lists, tried, notUnderstood, text })
  console.log(`“${agentCase.say}” → ${did}\n  ${costOf(cost)}`)

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
    case "notUnderstood":
      expect(cards, did).toEqual([])
      // Gibberish and too vague are close, so either is right for both; off topic must be off topic.
      expect(notUnderstood, did).toEqual([expected.reason === "off-topic" ? "off-topic" : expect.stringMatching(/^(gibberish|too-vague)$/)])
      break
  }
})
