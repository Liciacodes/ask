import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

// A scripted stand-in for the model: each entry is what it "says" on one step. No API is called.
type Step = Extract<NonNullable<NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>["doStream"]>, unknown[]>[number]

// Each step reports using 15 tokens.
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

// Two calls of the same tool in one reply need ids of their own.
const callsTool = (toolName: string, input: object, toolCallId = `call-${toolName}`): Step => ({
  stream: simulateReadableStream({
    chunks: [
      { type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) },
      { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage },
    ],
  }),
})

// Several pieces arrive one after another, as a real model's words stream in.
const says = (...pieces: string[]): Step => ({
  stream: simulateReadableStream({
    chunks: [
      { type: "text-start" as const, id: "text-1" },
      ...pieces.map((delta) => ({ type: "text-delta" as const, id: "text-1", delta })),
      { type: "text-end" as const, id: "text-1" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
    ],
  }),
})

// Thinks before it answers, the way gpt-oss sends its reasoning: apart from its words.
const thinksThenSays = (reasoning: string, text: string): Step => ({
  stream: simulateReadableStream({
    chunks: [
      { type: "reasoning-start" as const, id: "reasoning-1" },
      { type: "reasoning-delta" as const, id: "reasoning-1", delta: reasoning },
      { type: "reasoning-end" as const, id: "reasoning-1" },
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: text },
      { type: "text-end" as const, id: "text-1" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
    ],
  }),
})

const fakeModel = (...steps: Step[]) => new MockLanguageModelV4({ doStream: steps })

export { callsTool, fakeModel, says, thinksThenSays }
