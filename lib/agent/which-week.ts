import type { LanguageModelMiddleware } from "ai"
import { daysFrom, localDateTime } from "@/lib/time"
import type { StreamPart } from "./limits"

// "Next Friday" can mean the coming Friday or the one a week later. The model is told to ask which; this makes sure,
// so it doesn't depend on the model obeying. While the person's latest words leave the week open, a step in which
// the model proposes an action is thrown away and the reply becomes a question naming both dates.

const WEEKDAYS: Record<string, string> = {
  sun: "Sun", sunday: "Sun", mon: "Mon", monday: "Mon", tue: "Tue", tues: "Tue", tuesday: "Tue",
  wed: "Wed", wednesday: "Wed", thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
  fri: "Fri", friday: "Fri", sat: "Sat", saturday: "Sat",
}
const NEXT_WEEKDAY = new RegExp(`\\bnext\\s+(${Object.keys(WEEKDAYS).join("|")})\\b`, "i")

// A day of the month settles the week: "the 27th", "27 November", "Nov 27", "27/11", "2026-11-27". Times like 9.30 don't.
const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
const NAMES_A_DATE = new RegExp(
  [`\\b\\d{1,2}(?:st|nd|rd|th)\\b`, `\\b\\d{1,2}\\s+(?:of\\s+)?(?:${MONTH})\\b`, `\\b(?:${MONTH})\\s+\\d{1,2}\\b`, `\\b\\d{1,2}/\\d{1,2}\\b`, `\\b\\d{4}-\\d{2}-\\d{2}\\b`].join("|"),
  "i"
)

const inWords = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))

// The question to ask instead of an action, or nothing when the person's words already settle the week.
function whichWeek(said: string, now: Date, timezone: string) {
  const weekday = said.match(NEXT_WEEKDAY)?.[1]
  if (!weekday || NAMES_A_DATE.test(said)) return undefined
  const target = WEEKDAYS[weekday.toLowerCase()]
  const [coming, weekLater] = daysFrom(localDateTime(now, timezone).date, 15)
    .slice(1)
    .filter((day) => day.weekday === target)
  return `Do you mean ${inWords(coming.date)} or ${inWords(weekLater.date)}?`
}

const ACTIONS = new Set(["createReminder", "changeReminder", "cancelReminder", "restoreReminder"])
const proposes = (part: StreamPart) => part.type === "tool-call" && ACTIONS.has(part.toolName)
// What the model said or called in the step. The rest, like the usage in its finish, is kept.
const SAID_OR_CALLED = /^(?:text|reasoning|tool-input)-|^tool-call$/

// Holds each step until it ends: a step that only reads or talks goes on as it was; one that proposes an action
// becomes the question, so there's no card and nothing for the person to approve.
function asksInstead(question: string): LanguageModelMiddleware {
  return {
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream()
      const step: StreamPart[] = []
      const holding = new TransformStream<StreamPart, StreamPart>({
        transform(part) {
          step.push(part)
        },
        flush(controller) {
          const proposal = step.find(proposes)
          if (!proposal) return step.forEach((part) => controller.enqueue(part))
          console.info(`Asked which week instead of: ${proposal.type === "tool-call" ? proposal.toolName : proposal.type}`)
          const finish = step.find((part) => part.type === "finish")
          for (const part of step) if (part !== finish && !SAID_OR_CALLED.test(part.type)) controller.enqueue(part)
          controller.enqueue({ type: "text-start", id: "which-week" })
          controller.enqueue({ type: "text-delta", id: "which-week", delta: question })
          controller.enqueue({ type: "text-end", id: "which-week" })
          if (finish?.type === "finish") controller.enqueue({ ...finish, finishReason: { unified: "stop", raw: finish.finishReason.raw } })
        },
      })
      return { ...rest, stream: stream.pipeThrough(holding) }
    },
  }
}

export { asksInstead, NAMES_A_DATE, whichWeek }
