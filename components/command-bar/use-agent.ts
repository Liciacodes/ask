"use client"

import { useChat } from "@ai-sdk/react"
import { useEffect, useRef, useState } from "react"
import type { AgentMessage } from "@/lib/agent/agent"
import { agentChat } from "@/lib/agent/client"
import type { Preview } from "@/lib/agent/plans"
import { isReplyProblem } from "@/lib/agent/problems"
import type { ReminderJson } from "@/lib/reminders"

type Done = { done: Preview["action"]; reminder: ReminderJson }

// The action on a card that hasn't been carried out yet: waiting for your OK, or saving after your yes. `replaces`
// is the reminder a change, cancel or restore is about.
type Proposal = { id: string; preview: Preview; replaces?: string }

type Part = AgentMessage["parts"][number]
type ActionPart = Extract<Part, { type: "tool-createReminder" | "tool-changeReminder" | "tool-cancelReminder" | "tool-restoreReminder" }>

const actions = new Set(["tool-createReminder", "tool-changeReminder", "tool-cancelReminder", "tool-restoreReminder"])
const isAction = (part: Part): part is ActionPart => actions.has(part.type)

const options = agentChat({ timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone })

// The server's error text is JSON for a refused request, and a plain sentence for a failure mid-reply:
// one about room (Groq busy, today's calls used up) is shown as it is.
function problemOf(error: Error | undefined) {
  if (!error) return null
  try {
    const { error: message } = JSON.parse(error.message) as { error?: unknown }
    if (typeof message === "string") return message
  } catch {}
  if (isReplyProblem(error.message)) return error.message
  return "Ask couldn't get an answer. Check your connection and ask again."
}

// One conversation per opening of the bar: `reset` starts the next one, and the old one is let go.
function useAgent(onDone: (done: Done) => void) {
  const [conversation, setConversation] = useState(0)
  const chat = useChat<AgentMessage>({ id: `conversation-${conversation}`, ...options })
  const applied = useRef(new Set<string>())

  const parts = chat.messages.flatMap((message) => message.parts)
  const previews = new Map(parts.flatMap((part) => (part.type === "data-preview" ? [[part.id ?? "", part.data] as const] : [])))
  const refusals = new Map(parts.flatMap((part) => (part.type === "data-refused" ? [[part.id ?? "", part.data.reason] as const] : [])))
  const cards = parts.filter(isAction).filter((part) => previews.has(part.toolCallId))
  const waiting = cards.find((part) => part.state === "approval-requested")
  const approved = cards.find((part) => part.state === "approval-responded" && part.approval.approved)
  const saving = approved !== undefined
  const busy = chat.status === "submitted" || chat.status === "streaming"
  const pending = waiting ?? approved
  const input = pending?.input as { id?: string } | undefined

  // Each finished action reaches the week once, as soon as the server confirms it, even with the bar closed.
  useEffect(() => {
    for (const part of chat.messages.flatMap((message) => message.parts)) {
      if (!isAction(part) || part.state !== "output-available") continue
      const key = `${chat.id}:${part.toolCallId}`
      if (applied.current.has(key)) continue
      applied.current.add(key)
      onDone(part.output)
    }
  }, [chat.messages, chat.id, onDone])

  return {
    messages: chat.messages,
    previews,
    refusals,
    waiting: waiting && { toolCallId: waiting.toolCallId, preview: previews.get(waiting.toolCallId)! },
    proposal: pending && ({ id: pending.toolCallId, preview: previews.get(pending.toolCallId)!, replaces: input?.id } satisfies Proposal),
    saving,
    busy,
    problem: problemOf(chat.error),
    ask: (question: string) => {
      chat.clearError()
      void chat.sendMessage({ text: question })
    },
    answer: (approved: boolean) => {
      if (waiting?.state === "approval-requested") void chat.addToolApprovalResponse({ id: waiting.approval.id, approved })
    },
    stop: () => void chat.stop(),
    reset: () => setConversation((count) => count + 1),
  }
}

type Agent = ReturnType<typeof useAgent>

export { isAction, useAgent, type ActionPart, type Agent, type Done, type Proposal }
