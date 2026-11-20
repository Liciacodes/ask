import { APICallError, RetryError, wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { db } from "@/lib/db"
import { localDateTime } from "@/lib/time"
import type { AgentMessage } from "./agent"
import { usedUp } from "./problems"

// Ask's daily limits: so many questions for each visitor, and so many model calls for the whole site, which
// keeps Groq's free tier from running out. A day runs from midnight to midnight UTC, which is 01:00 in Lagos.
// The counts live in daily_usage: one row per visitor per day, and a "site" row per day for everyone together.

const SITE = "site"

function setting(name: string, fallback: number) {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number, like ${fallback}`)
  return Number(value)
}

const dailyLimits = () => ({
  visitorQuestions: setting("ASK_VISITOR_QUESTIONS_PER_DAY", 10),
  siteModelCalls: setting("ASK_SITE_GROQ_CALLS_PER_DAY", 60),
})

const today = (now: Date) => now.toISOString().slice(0, 10)
const nextDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
const row = (day: string, subject: string) => ({ day: new Date(day), subject })

// Each take adds one to a count only while it's under the limit, in a single statement,
// so two requests at the same moment can't both take the last one.
async function takeVisitorQuestion(day: string, visitor: string, limit: number) {
  if (limit < 1) return false
  const taken = await db.$queryRaw<unknown[]>`
    INSERT INTO daily_usage (day, subject, questions) VALUES (${day}::date, ${visitor}, 1)
    ON CONFLICT (day, subject) DO UPDATE SET questions = daily_usage.questions + 1
    WHERE daily_usage.questions < ${limit}
    RETURNING 1`
  return taken.length === 1
}

async function takeSiteCall(day: string, limit: number) {
  if (limit < 1) return false
  const taken = await db.$queryRaw<unknown[]>`
    INSERT INTO daily_usage (day, subject, model_calls) VALUES (${day}::date, ${SITE}, 1)
    ON CONFLICT (day, subject) DO UPDATE SET model_calls = daily_usage.model_calls + 1
    WHERE daily_usage.model_calls < ${limit}
    RETURNING 1`
  return taken.length === 1
}

async function siteHasRoom(day: string, limit: number) {
  const site = await db.dailyUsage.findUnique({ where: { day_subject: row(day, SITE) } })
  return (site?.modelCalls ?? 0) < limit
}

function refused(error: string, now: Date) {
  const seconds = Math.ceil((nextDay(now).getTime() - now.getTime()) / 1000)
  return { ok: false as const, response: Response.json({ error }, { status: 429, headers: { "retry-after": String(seconds) } }) }
}

// Pressing Enter or Esc on a preview card sends the conversation back, so the server can carry out your answer.
// That's the same question carrying on, not a new one.
function isNewQuestion(messages: AgentMessage[]) {
  const last = messages.at(-1)
  return !(last?.role === "assistant" && last.parts.some((part) => "state" in part && part.state === "approval-responded"))
}

// A new question needs room today on the site and for the visitor, and takes one of the visitor's.
// If Ask then can't answer it for lack of room, `giveBack` returns it.
async function takeQuestion(visitor: string, timezone: string) {
  const now = new Date()
  const day = today(now)
  const limits = dailyLimits()
  const from = localDateTime(nextDay(now), timezone).time

  if (!(await siteHasRoom(day, limits.siteModelCalls))) return refused(usedUp.site(from), now)
  if (!(await takeVisitorQuestion(day, visitor, limits.visitorQuestions))) return refused(usedUp.visitor(limits.visitorQuestions, from), now)

  const giveBack = async () => {
    await db.dailyUsage.updateMany({ where: { ...row(day, visitor), questions: { gt: 0 } }, data: { questions: { decrement: 1 } } })
  }
  return { ok: true as const, giveBack }
}

class SiteUsedUp extends Error {
  constructor() {
    super("The site has made all its model calls for today")
  }
}

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>
type StreamPart = Awaited<ReturnType<Parameters<WrapStream>[0]["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never
type Usage = { inputTokens: { total?: number }; outputTokens: { total?: number } }

async function addTokens(day: string, usage: Usage) {
  const tokens = (usage.inputTokens.total ?? 0) + (usage.outputTokens.total ?? 0)
  try {
    await db.dailyUsage.updateMany({ where: row(day, SITE), data: { tokens: { increment: tokens } } })
  } catch (error) {
    console.error("Couldn't count a model call's tokens:", error)
  }
}

// Every call to the model goes through here. It takes one of the site's calls for today first, gives it back
// if the call never started (Groq turned it away, say), and adds up the tokens the call used.
function countedModel(model: Parameters<typeof wrapLanguageModel>[0]["model"]) {
  const takeCall = async () => {
    const day = today(new Date())
    if (!(await takeSiteCall(day, dailyLimits().siteModelCalls))) throw new SiteUsedUp()
    return day
  }
  const started = async <T>(day: string, call: () => PromiseLike<T>) => {
    try {
      return await call()
    } catch (error) {
      await db.dailyUsage.updateMany({ where: { ...row(day, SITE), modelCalls: { gt: 0 } }, data: { modelCalls: { decrement: 1 } } })
      throw error
    }
  }

  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        const day = await takeCall()
        const result = await started(day, doGenerate)
        await addTokens(day, result.usage)
        return result
      },
      wrapStream: async ({ doStream }) => {
        const day = await takeCall()
        const { stream, ...rest } = await started(day, doStream)
        let usage: Usage | undefined
        const counting = new TransformStream<StreamPart, StreamPart>({
          transform(part, controller) {
            if (part.type === "finish") usage = part.usage
            controller.enqueue(part)
          },
          async flush() {
            if (usage) await addTokens(day, usage)
          },
        })
        return { ...rest, stream: stream.pipeThrough(counting) }
      },
    },
  })
}

// Whether a reply stopped for lack of room: Groq turning calls away under its own rate limits (after the
// SDK has already waited and retried), or the site's calls for today used up. Null for anything else.
function noRoomIn(error: unknown) {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  if (cause instanceof SiteUsedUp) return "siteUsedUp" as const
  if (APICallError.isInstance(cause) && cause.statusCode === 429) return "busy" as const
  return null
}

export { countedModel, dailyLimits, isNewQuestion, noRoomIn, takeQuestion, type StreamPart }
