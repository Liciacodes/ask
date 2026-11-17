"use client"

import { Button } from "@ui-sdk/react/button"
import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { TimeInput } from "@ui-sdk/react/time-input"
import { useRef, useState, type FormEvent } from "react"
import type { ReminderJson } from "@/lib/reminders"

type Problems = { title?: string; when?: string; form?: string }

const pad = (n: number) => String(n).padStart(2, "0")

function nextFullHour() {
  const next = new Date()
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return {
    date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
    time: `${pad(next.getHours())}:00`,
  }
}

function problemsFrom(body: unknown): Problems {
  const issues = (body as { issues?: { field: string | null; message: string }[] } | null)?.issues
  if (!issues?.length) return { form: "Ask couldn't save this reminder. Try again." }
  const problems: Problems = {}
  for (const { field, message } of issues) {
    if (field === "title") problems.title ??= message
    else if (field === "due_at") problems.when ??= message
    else problems.form ??= message
  }
  return problems
}

const label = "text-[12.5px] text-hint data-invalid:text-error"
const line = "flex h-10 w-full items-center border-b-[1.5px] border-rule text-[17px] focus-within:border-ink data-invalid:border-error"
const error = "mt-1.5 text-[13px] text-error"

function ReminderForm({ onSaved }: { onSaved: (reminder: ReminderJson) => void }) {
  const [defaults] = useState(nextFullHour)
  // The browser's language, not the page's: it orders the date and picks the clock people are used to.
  const [locale] = useState(() => new Intl.DateTimeFormat().resolvedOptions().locale)
  const [saving, setSaving] = useState(false)
  const [problems, setProblems] = useState<Problems>({})
  const inFlight = useRef(false)

  const clear = (key: keyof Problems) => setProblems((current) => (current[key] ? { ...current, [key]: undefined } : current))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setProblems({})
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          due_at: new Date(`${form.get("date")}T${form.get("time")}`).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const body = await response.json().catch(() => null)
      if (response.ok) return onSaved(body)
      setProblems(problemsFrom(body))
    } catch {
      setProblems({ form: "Ask couldn't reach the server. Check your connection and try again." })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5 px-4 pt-4 pb-4">
      <Field invalid={problems.title ? true : undefined}>
        <FieldLabel className={label}>Title</FieldLabel>
        <Input
          name="title"
          required
          pattern=".*\S.*"
          autoFocus
          autoComplete="off"
          placeholder="Remind me to…"
          onValueChange={() => clear("title")}
          className="h-10 w-full border-b-[1.5px] border-rule bg-transparent text-[17px] text-ink outline-none placeholder:text-hint focus:border-ink data-invalid:border-error"
        />
        <FieldError match="valueMissing" className={error}>
          Add a title
        </FieldError>
        <FieldError match="patternMismatch" className={error}>
          Add a title
        </FieldError>
        {problems.title && (
          <FieldError match className={error}>
            {problems.title}
          </FieldError>
        )}
      </Field>
      <div className="grid grid-cols-[auto_auto] justify-start gap-x-8">
        <Field>
          <FieldLabel className={label}>Date</FieldLabel>
          <DateInput name="date" required locale={locale} defaultValue={defaults.date} onValueChange={() => clear("when")} className={line} />
          <FieldError className={error} />
        </Field>
        <Field invalid={problems.when ? true : undefined}>
          <FieldLabel className={label}>Time</FieldLabel>
          <TimeInput name="time" required locale={locale} defaultValue={defaults.time} onValueChange={() => clear("when")} className={line} />
          {problems.when ? (
            <FieldError match className={error}>
              {problems.when}
            </FieldError>
          ) : (
            <FieldError className={error} />
          )}
        </Field>
      </div>
      <div className="flex items-center justify-end gap-4">
        {problems.form && (
          <p role="alert" data-problem="" className="mr-auto text-[13px] text-error">
            {problems.form}
          </p>
        )}
        <Button
          type="submit"
          disabled={saving}
          focusableWhenDisabled
          className="rounded-sm bg-ink px-4 py-2 text-[14px] font-medium text-card transition-transform duration-160 ease-out outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink active:scale-[0.97] data-disabled:opacity-70 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}

export { ReminderForm }
