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

  const add = (reminder: ReminderJson) => {
    if (state.status !== "ready") return retry()
    setState({ status: "ready", reminders: [...state.reminders, reminder] })
  }

  return { state, retry, add }
}

export { useWeek, type WeekState }
