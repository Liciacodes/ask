// Real Groq calls, on the cases in tests/date-cases.ts: run `npm run test:live` only when the person paying says yes.
// Its own config keeps it out of `npm run test:api` and CI.
import { readUIMessageStream, wrapLanguageModel } from "ai"
import { afterEach, expect, test, vi } from "vitest"
import { agentStream, type AgentMessage } from "@/lib/agent/agent"
import { agentModel } from "@/lib/agent/model"
import { dateCases } from "../date-cases"

const MAX_CALLS_PER_CASE = 2

afterEach(() => {
  vi.useRealTimers()
})

test.each(dateCases)("the real model reads “$say” as $expected.date at $expected.time", async (dateCase) => {
  // The clock reads the moment the sentence was typed, as in the API tests, so the case means the same on any day.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(dateCase.now))
  let calls = 0
  const model = wrapLanguageModel({
    model: agentModel(),
    middleware: {
      wrapStream: async ({ doStream }) => {
        if (++calls > MAX_CALLS_PER_CASE) throw new Error(`More than ${MAX_CALLS_PER_CASE} Groq calls for one case`)
        return doStream()
      },
    },
  })

  const stream = agentStream({
    model,
    messages: [{ id: "you", role: "user", parts: [{ type: "text", text: dateCase.say }] }],
    userId: "live-check",
    timezone: dateCase.timezone,
    now: new Date(dateCase.now),
  })
  let reply: AgentMessage | undefined
  for await (const message of readUIMessageStream<AgentMessage>({ stream })) reply = message

  const call = reply?.parts.find((part) => part.type === "tool-createReminder")
  expect(call && "input" in call ? call.input : reply?.parts).toMatchObject(dateCase.expected)
})
