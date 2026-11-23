import type { LanguageModelMiddleware } from "ai"
import type { StreamPart } from "./limits"

// gpt-oss reasons, then switches channel to write its answer. Groq normally sends the reasoning apart, and the bar
// never shows it. If the switch leaks into the answer, as the raw marker or with its special tokens stripped
// ("…Let's produce final.assistantfinalSaved!"), only the words after it are kept.
const SWITCH_TO_ANSWER = /(?:<\|start\|>assistant)?<\|channel\|>final<\|message\|>|assistantfinal/
const END_OF_ANSWER = /\s*<\|(?:end|return)\|>\s*$/

function withoutLeakedReasoning(text: string, onLeak: () => void = () => {}) {
  const pieces = text.split(SWITCH_TO_ANSWER)
  if (pieces.length === 1) return text
  onLeak()
  return pieces.at(-1)!.replace(END_OF_ANSWER, "").trimStart()
}

// Holds each piece of the model's text until it's complete, then puts it right with `fix`. Replies are a sentence
// or two, so the hold is a fraction of a second.
function fixesReplyText(fix: (text: string) => string): LanguageModelMiddleware {
  return {
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream()
      const held = new Map<string, string>()
      const fixing = new TransformStream<StreamPart, StreamPart>({
        transform(part, controller) {
          if (part.type === "text-delta") {
            held.set(part.id, (held.get(part.id) ?? "") + part.delta)
            return
          }
          if (part.type === "text-end" && held.has(part.id)) {
            controller.enqueue({ type: "text-delta", id: part.id, delta: fix(held.get(part.id)!) })
            held.delete(part.id)
          }
          controller.enqueue(part)
        },
        flush(controller) {
          for (const [id, text] of held) controller.enqueue({ type: "text-delta", id, delta: fix(text) })
        },
      })
      return { ...rest, stream: stream.pipeThrough(fixing) }
    },
  }
}

export { fixesReplyText, withoutLeakedReasoning }
