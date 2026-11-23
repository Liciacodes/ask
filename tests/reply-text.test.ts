import { expect, test, vi } from "vitest"
import { withoutLeakedReasoning } from "@/lib/agent/reply-text"

const reasoning = "We need to respond correctly. The instructions say don't say it's done until the tool's result comes back. Let's produce final."

test.each([
  ["the switch with its special tokens stripped", `${reasoning}assistantfinalYou have nothing on Friday.`],
  ["the raw switch", `${reasoning}<|start|>assistant<|channel|>final<|message|>You have nothing on Friday.`],
  ["the switch without its start", `${reasoning}<|channel|>final<|message|>You have nothing on Friday.`],
  ["the raw switch and the end marker", `${reasoning}<|channel|>final<|message|> You have nothing on Friday.<|end|>`],
])("reasoning that leaked into the answer is cut at %s", (_case, text) => {
  const onLeak = vi.fn()

  expect(withoutLeakedReasoning(text, onLeak)).toBe("You have nothing on Friday.")
  expect(onLeak).toHaveBeenCalledOnce()
})

test("an answer with no switch in it stays exactly as it was", () => {
  const onLeak = vi.fn()
  const answer = "You have the dentist on Friday 20 November at 09:00, and nothing final yet."

  expect(withoutLeakedReasoning(answer, onLeak)).toBe(answer)
  expect(onLeak).not.toHaveBeenCalled()
})
