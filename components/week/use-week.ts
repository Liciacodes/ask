"use client"

import { useEffect, useState } from "react"
import type { ReminderJson } from "@/lib/reminders"

type WeekState = { status: "loading" } | { status: "error" } | { status: "ready"; reminders: ReminderJson[] }

function useWeek(timezone: string | null) {
  const [state, setState] = useState<WeekState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

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

  return { state, retry, put }
}

export { useWeek, type WeekState }
