"use client"

import { createStickToBottom, isComposing } from "@ui-sdk/core"
import { Button } from "@ui-sdk/react/button"
import { Input } from "@ui-sdk/react/input"
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { CategoryIcon, categoryLook } from "@/components/week/category-look"
import { localWhen } from "@/components/week/days"
import { examples, openings, type Reason } from "@/lib/agent/not-understood"
import type { Card, Preview } from "@/lib/agent/plans"
import type { ReminderJson } from "@/lib/reminders"
import { localDateTime } from "@/lib/time"
import { CheckIcon, SparkleIcon } from "./icons"
import { fieldRow, fieldText } from "./styles"
import { isAction, type ActionPart, type Agent } from "./use-agent"

// One name per action, from the card's button to the line it leaves behind and the key hints.
const wording = {
  create: { heading: "New reminder", approve: "Save", decline: "Don't save", working: "Saving…", done: "Saved", declined: "Not saved" },
  change: { heading: "Change reminder", approve: "Save changes", decline: "Keep as is", working: "Saving…", done: "Changed", declined: "Not changed" },
  cancel: { heading: "Cancel reminder", approve: "Cancel reminder", decline: "Keep it", working: "Cancelling…", done: "Cancelled", declined: "Kept" },
  restore: { heading: "Bring back reminder", approve: "Bring back", decline: "Leave it cancelled", working: "Bringing back…", done: "Brought back", declined: "Left cancelled" },
} satisfies Record<Preview["action"], Record<string, string>>

type CardStatus = "waiting" | "working" | "done" | "declined" | "refused" | "failed"

function statusOf(part: ActionPart): CardStatus {
  switch (part.state) {
    case "approval-responded":
      return part.approval.approved ? "working" : "declined"
    case "output-available":
      return "done"
    // Denied after you said yes: the server checked again and something had changed while the card waited.
    case "output-denied":
      return part.approval?.approved ? "refused" : "declined"
    case "output-error":
      return "failed"
    default:
      return "waiting"
  }
}

type ChangeProps = { was: ReactNode; now: ReactNode; same: boolean; className: string }

function Change({ was, now, same, className }: ChangeProps) {
  if (same) return <p className={className}>{now}</p>
  return (
    <p className={className}>
      <del>
        <span className="sr-only">was </span>
        {was}
      </del>
      <span aria-hidden="true">{" → "}</span>
      <ins className="no-underline">
        <span className="sr-only">now </span>
        {now}
      </ins>
    </p>
  )
}

const titleLine = "text-[20px] leading-tight font-extrabold wrap-break-word"
const whenLine = "text-[14px] font-medium tabular-nums"
const detailsLine = "mt-1 text-[13px] wrap-break-word whitespace-pre-wrap"

// The weekday in bold, so a wrong day catches the eye before you approve. A day being replaced stays plain.
function When({ card, plain = false }: { card: Card; plain?: boolean }) {
  const { weekday, rest } = localWhen(card)
  return (
    <>
      <span data-weekday="" className={plain ? undefined : "font-bold"}>
        {weekday}
      </span>{" "}
      {rest}
    </>
  )
}

function Details({ preview, marked }: { preview: Preview; marked: boolean }) {
  const title = (card: Card) => (marked ? <span className="-mx-1 box-decoration-clone rounded-xs px-1 highlighter">{card.title}</span> : card.title)

  if (preview.action !== "change") {
    const { reminder } = preview
    return (
      <>
        <p className={titleLine}>{title(reminder)}</p>
        <p className={whenLine}>
          <When card={reminder} />
        </p>
        {reminder.description && <p className={detailsLine}>{reminder.description}</p>}
      </>
    )
  }

  const { before, after } = preview
  return (
    <>
      {before.title === after.title ? (
        <p className={titleLine}>{title(after)}</p>
      ) : (
        <Change was={before.title} now={after.title} same={false} className={titleLine} />
      )}
      <Change
        was={<When card={before} plain />}
        now={<When card={after} />}
        same={before.date === after.date && before.time === after.time}
        className={whenLine}
      />
      {(before.description || after.description) && (
        <Change
          was={before.description ?? "No details"}
          now={after.description ?? "No details"}
          same={before.description === after.description}
          className={detailsLine}
        />
      )}
    </>
  )
}

type PreviewCardProps = {
  part: ActionPart
  preview: Preview
  refusal: string | undefined
  active: boolean
  onAnswer: (approved: boolean) => void
}

// The reminder a card is about: after the change, for a change.
const shownOn = (preview: Preview) => (preview.action === "change" ? preview.after : preview.reminder)

const pill = "min-h-11 rounded-full px-4 outline-offset-2 focus-visible:outline-2"
const press = "transition-transform duration-160 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

function PreviewCard({ part, preview, refusal, active, onAnswer }: PreviewCardProps) {
  const words = wording[preview.action]
  const status = statusOf(part)
  const { category } = shownOn(preview)
  const look = categoryLook[category]
  // A work card is the accent itself, so its buttons swap shades to stand out from it.
  const onAccent = category === "work"
  const decline = onAccent ? "border border-work-ink text-work-ink focus-visible:outline-work-ink" : "bg-surface text-ink focus-visible:outline-accent"
  const approve = onAccent ? "bg-surface text-accent focus-visible:outline-work-ink" : "bg-accent-fill px-5 text-on-accent focus-visible:outline-accent"

  return (
    <section aria-label={words.heading} data-status={status} data-category={category} className="data-[status=declined]:opacity-60">
      <div className={`flex flex-wrap items-center justify-between gap-3.5 rounded-[18px] p-3.5 ${look.card}`}>
        {/* At least 14rem for the words: on a narrow screen the buttons move underneath instead of squeezing them. */}
        <div className="flex min-w-0 grow basis-56 items-center gap-3">
          <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-xl ${look.tile}`}>
            <CategoryIcon category={category} className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-[12px] font-bold tracking-[0.08em] uppercase">{words.heading}</h3>
            <Details preview={preview} marked={active} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
          {status === "waiting" && active && (
            <>
              <Button onClick={() => onAnswer(false)} className={`${pill} ${decline}`}>
                {words.decline}
              </Button>
              <Button onClick={() => onAnswer(true)} className={`${pill} ${press} ${approve}`}>
                {words.approve}
              </Button>
            </>
          )}
          {status === "working" && <p>{words.working}</p>}
          {status === "done" && (
            <p className="flex items-center gap-1.5">
              <CheckIcon className="size-3.5" />
              {words.done}
            </p>
          )}
          {status === "declined" && <p>{words.declined}</p>}
        </div>
      </div>
      {/* Below the card, on the bar's own white, where the error colour reads on every category. */}
      {(status === "refused" || status === "failed") && (
        <p role="alert" className="mt-2 px-1 text-[13px] font-semibold text-error">
          {status === "refused" ? (refusal ?? "Ask couldn't do this.") : part.state === "output-error" && part.errorText}
        </p>
      )}
    </section>
  )
}

const textOf = (parts: Agent["messages"][number]["parts"]) =>
  parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")

// The reply to a card you said yes to: no model call, only what the server saved, said the way the cards say it.
function DoneLine({ done, reminder }: { done: Preview["action"]; reminder: ReminderJson }) {
  const { weekday, rest } = localWhen(localDateTime(new Date(reminder.due_at), reminder.timezone))
  return (
    <p className="wrap-break-word">
      {wording[done].done}: {reminder.title}, {weekday} {rest}
    </p>
  )
}

// Ask's own words when it couldn't tell what you meant, and three things it does understand.
function NotUnderstood({ reason }: { reason: Reason }) {
  return (
    <div>
      <p>{openings[reason]} Try something like:</p>
      <ul className="mt-1 flex flex-col gap-0.5 pl-3">
        {examples.map((example) => (
          <li key={example}>“{example}”</li>
        ))}
      </ul>
    </div>
  )
}

// The latest message Ask didn't understand, so its words can go back in the field to fix.
function lastNotUnderstood(messages: Agent["messages"]) {
  let said = ""
  let found: { id: string; said: string } | undefined
  for (const message of messages) {
    if (message.role === "user") said = textOf(message.parts)
    for (const part of message.parts) {
      if (part.type === "tool-didNotUnderstand" && part.state === "output-available") found = { id: part.toolCallId, said }
    }
  }
  return found
}

function Conversation({ agent }: { agent: Agent }) {
  const [draft, setDraft] = useState("")
  const field = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const keysHint = useId()

  useEffect(() => createStickToBottom().connect(log.current!), [])

  // A message Ask didn't understand comes back into the field once, to fix rather than retype.
  const missed = lastNotUnderstood(agent.messages)
  const [restored, setRestored] = useState<string | null>(null)
  if (missed && missed.id !== restored) {
    setRestored(missed.id)
    setDraft(missed.said)
  }
  // ...with the caret at its end, ready to edit.
  useLayoutEffect(() => {
    const input = field.current
    if (!restored || !input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }, [restored])

  const last = agent.messages.at(-1)
  const lastPart = last?.role === "assistant" ? last.parts.at(-1) : undefined
  const writing = lastPart?.type === "text" && lastPart.state === "streaming" && lastPart.text.trim() !== ""
  const thinking = agent.busy && !agent.saving && !writing
  const waiting = agent.waiting && wording[agent.waiting.preview.action]

  const answer = (approved: boolean) => {
    agent.answer(approved)
    field.current?.focus()
  }

  return (
    <>
      <div className={fieldRow}>
        <SparkleIcon className="size-4.5 shrink-0 text-accent" />
        <Input
          ref={field}
          autoFocus
          autoComplete="off"
          aria-label="Ask a follow-up"
          aria-describedby={keysHint}
          placeholder="Ask a follow-up"
          value={draft}
          readOnly={agent.busy || waiting !== undefined}
          onValueChange={setDraft}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || isComposing(event)) return
            event.preventDefault()
            if (waiting) return answer(true)
            const question = draft.trim()
            if (agent.busy || !question) return
            agent.ask(question)
            setDraft("")
          }}
          className={fieldText}
        />
        <p id={keysHint} className="sr-only">
          {waiting && `Enter: ${waiting.approve}. Escape: ${waiting.decline}.`}
        </p>
      </div>
      <div
        ref={log}
        role="log"
        aria-label="Conversation"
        aria-busy={agent.busy}
        className="flex max-h-[min(360px,50vh)] flex-col gap-3 overflow-y-auto px-3 py-1 text-[15px] leading-relaxed [&>p]:px-2"
      >
        {agent.messages.map((message) =>
          message.role === "user" ? (
            <p key={message.id} className="text-muted wrap-break-word">
              {textOf(message.parts)}
            </p>
          ) : (
            // Parts only ever arrive at the end, so a part's place in its message never changes.
            message.parts.map((part, index) => {
              const key = `${message.id}-${index}`
              if (part.type === "text") {
                return part.text.trim() ? (
                  <p key={key} className="whitespace-pre-wrap wrap-break-word">
                    {part.text.trim()}
                  </p>
                ) : null
              }
              if (part.type === "tool-didNotUnderstand") {
                return part.state === "output-available" ? <NotUnderstood key={key} reason={part.output.reason} /> : null
              }
              const preview = isAction(part) ? agent.previews.get(part.toolCallId) : undefined
              if (!isAction(part) || !preview) return null
              return (
                <Fragment key={part.toolCallId}>
                  <PreviewCard
                    part={part}
                    preview={preview}
                    refusal={agent.refusals.get(part.toolCallId)}
                    active={agent.waiting?.toolCallId === part.toolCallId}
                    onAnswer={answer}
                  />
                  {part.state === "output-available" && <DoneLine done={part.output.done} reminder={part.output.reminder} />}
                </Fragment>
              )
            })
          )
        )}
        {thinking && <p className="text-muted">Thinking…</p>}
        {agent.problem && (
          <p role="alert" data-problem="" className="text-[13px] text-error">
            {agent.problem}
          </p>
        )}
      </div>
    </>
  )
}

export { Conversation, wording }
