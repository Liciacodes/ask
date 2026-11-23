import type { z } from "zod"
import type { notUnderstoodInput } from "@/lib/agent-actions"

// What Ask says when a message can't become an action, a question or a list. The model only names the reason, with
// the didNotUnderstand tool; these words are the server's own, and the bar shows them with the person's message
// back in the field to fix.

type Reason = z.output<typeof notUnderstoodInput>["reason"]

const openings: Record<Reason, string> = {
  gibberish: "I didn't understand that.",
  "too-vague": "I need a bit more to go on.",
  "off-topic": "I can only help with reminders.",
}

// One of each thing Ask does: create, list and change.
const examples = ["Remind me to call Dad tomorrow at 6pm", "What's on Friday?", "Move the dentist to 10am"]

export { examples, openings, type Reason }
