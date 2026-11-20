import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

// A scripted stand-in for the model: each entry is what it "says" on one step. No API is called.
type Step = Extract<NonNullable<NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>["doStream"]>, unknown[]>[number]

// Each step reports using 15 tokens.
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

const fakeModel = (...steps: Step[]) => new MockLanguageModelV4({ doStream: steps })

export { callsTool, fakeModel, says }
