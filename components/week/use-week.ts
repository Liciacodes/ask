"use client"

import { useEffect, useState } from "react"
import type { ReminderJson } from "@/lib/reminders"
import { movedDueAt } from "./moves"

type WeekState = { status: "loading" } | { status: "error" } | { status: "ready"; reminders: ReminderJson[] }

type Moved = { ok: true; reminder: ReminderJson } | { ok: false; reason: string }

const UNREACHABLE = "Ask couldn't reach the server. Check your connection and try again."

// The server's reason for a refusal: a field's problem, like "Pick a time in the future", or its error.
function reasonIn(body: unknown) {
  const { issues, error } = (body ?? {}) as { issues?: { message: string }[]; error?: string }
  return issues?.[0]?.message ?? error ?? "Ask couldn't move this reminder. Try again."
}

function useWeek(timezone: string | null) {
  const [state, setState] = useState<WeekState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!timezone) return
    const request = new AbortController()
    fetch(`/api/week?timezone=${encodeURIComponent(timezone)}`, { signal: request.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((body: { reminders: ReminderJson[] }) => setState({ status: "ready", reminders: body.reminders }))
      .catch(() => {
        if (!request.signal.aborted) setState({ status: "error" })
      })
    return () => request.abort()
  }, [timezone, attempt])

  const retry = () => {
    setState({ status: "loading" })
    setAttempt((count) => count + 1)
  }

  // Puts a reminder in the week, replacing its old copy, or takes it out when it no longer belongs there.
  // Before the week has loaded there's nothing to change, so the week loads again and arrives with it.
  const put = (reminder: ReminderJson, inWeek: boolean) => {
    if (state.status !== "ready") return retry()
    setState((current) => {
      if (current.status !== "ready") return current
      const others = current.reminders.filter((other) => other.id !== reminder.id)
      return { status: "ready", reminders: inWeek ? [...others, reminder] : others }
    })
  }

  const lock = (id: string, locked: boolean) =>
    setSaving((current) => {
      const next = new Set(current)
      if (locked) next.add(id)
      else next.delete(id)
      return next
    })

  // A card dragged to another day shows there at once and saves straight away. If the server refuses, or can't
  // be reached, it goes back where it was. Until the answer comes, the card can't be picked up again.
  const move = async (reminder: ReminderJson, day: string): Promise<Moved> => {
    if (!timezone) return { ok: false, reason: UNREACHABLE }
    const due_at = movedDueAt(reminder, day, timezone).toISOString()
    put({ ...reminder, due_at }, true)
    lock(reminder.id, true)
    try {
      const response = await fetch(`/api/reminders/${encodeURIComponent(reminder.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ due_at }),
      })
      const body = await response.json().catch(() => null)
      if (response.ok) {
        put(body as ReminderJson, true)
        return { ok: true, reminder: body as ReminderJson }
      }
      put(reminder, true)
      return { ok: false, reason: reasonIn(body) }
    } catch {
      put(reminder, true)
      return { ok: false, reason: UNREACHABLE }
    } finally {
      lock(reminder.id, false)
    }
  }

  return { state, retry, put, move, saving }
}

export { useWeek, type Moved, type WeekState }
