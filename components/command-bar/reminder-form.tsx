"use client"

import { Button } from "@ui-sdk/react/button"
import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { Select, SelectContent, SelectItem, SelectItemIcon, SelectItemIndicator, SelectTrigger, SelectValue } from "@ui-sdk/react/select"
import { Textarea } from "@ui-sdk/react/textarea"
import { TimeInput } from "@ui-sdk/react/time-input"
import { useRef, useState, type FormEvent } from "react"
import { CategoryDot, CategoryIcon, categoryName } from "@/components/week/category-look"
import { CATEGORIES, guessCategory, type Category } from "@/lib/categories"
import type { ReminderJson } from "@/lib/reminders"
import { localDateTime } from "@/lib/time"
import { CheckIcon } from "./icons"

type Problems = { title?: string; when?: string; note?: string; form?: string }

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

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
    else if (field === "description") problems.note ??= message
    else problems.form ??= message
  }
  return problems
}

const label = "text-[12px] font-semibold text-muted data-invalid:text-error"
const line = "flex h-10 w-full items-center border-b-[1.5px] border-line text-[17px] font-medium focus-within:border-accent data-invalid:border-error"
// The category's grey icon on a soft tile, then its dot and name: colour is never the only clue.
const categoryTile = "grid place-items-center rounded-lg bg-soft text-muted"
const error = "mt-1.5 text-[13px] font-semibold text-error"

// A new reminder, or with `editing`, one from the week, filled in and saved with "Save changes".
// `onDeleted` follows "Delete reminder", which only an edit has.
type ReminderFormProps = { editing?: ReminderJson; onSaved: (reminder: ReminderJson) => void; onDeleted?: (reminder: ReminderJson) => void }

function ReminderForm({ editing, onSaved, onDeleted }: ReminderFormProps) {
  // Delete asks once, "Delete for good?", and a second press deletes. It can't be undone.
  const [confirming, setConfirming] = useState(false)
  // A reminder being edited starts at its own date and time, on this browser's clock, like the form saves it.
  const [defaults] = useState(() => (editing ? localDateTime(new Date(editing.due_at), browserZone()) : nextFullHour()))
  // The browser's language, not the page's: it orders the date and picks the clock people are used to.
  const [locale] = useState(() => new Intl.DateTimeFormat().resolvedOptions().locale)
  const [saving, setSaving] = useState(false)
  const [problems, setProblems] = useState<Problems>({})
  // The title's keyword guess, until the person picks a category themselves. A saved reminder's category counts as
  // picked, so editing its title never guesses again.
  const [category, setCategory] = useState<Category>(editing?.category ?? "other")
  const [picked, setPicked] = useState(editing !== undefined)
  const inFlight = useRef(false)

  const clear = (key: keyof Problems) => setProblems((current) => (current[key] ? { ...current, [key]: undefined } : current))

  async function remove() {
    if (!editing || inFlight.current) return
    if (!confirming) return setConfirming(true)
    inFlight.current = true
    setSaving(true)
    setProblems({})
    try {
      const response = await fetch(`/api/reminders/${encodeURIComponent(editing.id)}`, { method: "DELETE" })
      if (response.ok) return onDeleted?.(editing)
      setProblems({ form: "Ask couldn't delete this reminder. Try again." })
    } catch {
      setProblems({ form: "Ask couldn't reach the server. Check your connection and try again." })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    const form = new FormData(event.currentTarget)
    const dueAt = new Date(`${form.get("date")}T${form.get("time")}`).toISOString()
    // An edit sends the time only when it changed: the server turns down any time that has passed, even the same one.
    const when = editing && new Date(editing.due_at).getTime() === new Date(dueAt).getTime() ? {} : { due_at: dueAt, timezone: browserZone() }
    setSaving(true)
    setProblems({})
    try {
      const response = await fetch(editing ? `/api/reminders/${encodeURIComponent(editing.id)}` : "/api/reminders", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          // An empty note clears it.
          description: form.get("note"),
          ...when,
          category,
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
    <form onSubmit={save} className="flex flex-col gap-5 px-5 pt-1 pb-3">
      <Field invalid={problems.title ? true : undefined}>
        <FieldLabel className={label}>Title</FieldLabel>
        <Input
          name="title"
          defaultValue={editing?.title}
          required
          pattern=".*\S.*"
          autoFocus
          autoComplete="off"
          placeholder="Remind me to…"
          onValueChange={(value) => {
            clear("title")
            if (!picked) setCategory(guessCategory(value))
          }}
          className="h-10 w-full border-b-[1.5px] border-line bg-transparent text-[17px] font-medium text-ink outline-none placeholder:font-medium placeholder:text-muted focus:border-accent data-invalid:border-error"
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
      <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
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
        <Field>
          <FieldLabel className={label}>Category</FieldLabel>
          <Select
            name="category"
            value={category}
            onValueChange={(value) => {
              if (!value) return
              setCategory(value as Category)
              setPicked(true)
            }}
          >
            <SelectTrigger className="flex h-10 items-center gap-2 rounded-2xl border border-line bg-surface pr-3 pl-1.5 text-[14px] font-semibold text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent data-open:border-accent">
              <span aria-hidden="true" className={`size-7 ${categoryTile}`}>
                <CategoryIcon category={category} />
              </span>
              <CategoryDot category={category} />
              <SelectValue />
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </SelectTrigger>
            <SelectContent className="max-h-72 min-w-44 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-bar">
              {CATEGORIES.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                  className="flex cursor-default items-center gap-2.5 rounded-xl px-2 py-1.5 text-[14px] font-semibold data-highlighted:bg-selected"
                >
                  <SelectItemIcon>
                    <span className={`size-6 ${categoryTile}`}>
                      <CategoryIcon category={option} />
                    </span>
                  </SelectItemIcon>
                  <CategoryDot category={option} />
                  {categoryName[option]}
                  <SelectItemIndicator className="ml-auto">
                    <CheckIcon className="size-3.5" />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field invalid={problems.note ? true : undefined}>
        <FieldLabel className={label}>Note</FieldLabel>
        {/* Enter starts a new line here; Save saves. */}
        <Textarea
          name="note"
          autoResize
          rows={1}
          defaultValue={editing?.description ?? ""}
          placeholder="Optional"
          onValueChange={() => clear("note")}
          className="max-h-32 min-h-10 w-full resize-none border-b-[1.5px] border-line bg-transparent py-2 text-[15px] font-medium text-ink outline-none placeholder:text-muted focus:border-accent data-invalid:border-error"
        />
        {problems.note && (
          <FieldError match className={error}>
            {problems.note}
          </FieldError>
        )}
      </Field>
      <div className="flex items-center justify-end gap-4">
        {problems.form && (
          <p role="alert" data-problem="" className="mr-auto text-[13px] font-semibold text-error">
            {problems.form}
          </p>
        )}
        {editing && (
          <Button
            type="button"
            onClick={remove}
            disabled={saving}
            focusableWhenDisabled
            className="min-h-12 rounded-2xl bg-danger px-5 text-[15px] font-semibold text-on-danger outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent data-disabled:opacity-70"
          >
            {confirming ? "Delete for good?" : "Delete reminder"}
          </Button>
        )}
        <Button
          type="submit"
          disabled={saving}
          focusableWhenDisabled
          className="min-h-12 rounded-2xl bg-strong px-6 text-[15px] font-semibold text-on-strong transition-transform duration-160 ease-out outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] data-disabled:opacity-70 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  )
}

export { ReminderForm }
