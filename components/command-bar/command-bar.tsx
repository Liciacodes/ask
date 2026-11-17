"use client"

import { createParts } from "@ui-sdk/react/primitive"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { ReminderJson } from "@/lib/reminders"
import { commands, type Command } from "./commands"
import { Conversation, wording } from "./conversation"
import { AskIcon, BellIcon, SearchIcon } from "./icons"
import { ASK, commandBar, createCommandBarController } from "./primitive"
import { ReminderForm } from "./reminder-form"
import { useAgent, type Agent, type Done } from "./use-agent"
import { playSwap, snapshot, type Snapshot } from "./view-swap"

const parts = createParts(commandBar, {
  root: "div",
  shortcut: "kbd",
  backdrop: "div",
  content: "div",
  title: "h2",
  panel: "div",
  input: "input",
  list: "div",
  item: "div",
  empty: "p",
})

const keycap =
  "inline-grid min-w-5 place-items-center rounded-[4px] border border-b-2 border-rule bg-card px-1.5 py-1 font-sans text-[11.5px] leading-none font-medium text-ink"

type Hint = readonly [keys: readonly string[], action: string]

const hints = {
  list: [
    [["↑", "↓"], "move"],
    [["↵"], "choose"],
    [["esc"], "close"],
  ],
  reminder: [
    [["↵"], "save"],
    [["tab"], "next field"],
    [["esc"], "back"],
  ],
} satisfies Record<string, Hint[]>

type View = keyof typeof hints | "conversation"

// What Enter and Esc do right now in the conversation. Nothing while an action you approved is running.
function conversationHints(agent: Agent): Hint[] {
  if (agent.waiting) {
    const words = wording[agent.waiting.preview.action]
    return [
      [["↵"], words.approve.toLowerCase()],
      [["esc"], words.decline.toLowerCase()],
    ]
  }
  if (agent.saving) return []
  if (agent.busy) return [[["esc"], "stop"]]
  return [
    [["↵"], "send"],
    [["esc"], "back"],
  ]
}

type CommandBarProps = {
  // `from` is where the bar's card was on screen, for the saved reminder to fly from.
  onReminderSaved?: (reminder: ReminderJson, from: DOMRect) => void
  // An action you approved in a conversation, once the server has carried it out.
  onAgentDone?: (done: Done) => void
  onChoose?: (command: Command) => void
  children?: ReactNode
  className?: string
}

const ignore = () => {}

function CommandBar({ onChoose, onReminderSaved, onAgentDone = ignore, children, className }: CommandBarProps) {
  const [bar] = useState(createCommandBarController)
  const [view, setView] = useState<View>("list")
  const agent = useAgent(onAgentDone)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLDivElement>(null)
  const hintRow = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLDivElement>(null)
  const leaving = useRef<Snapshot | null>(null)
  const stopSwap = useRef<(() => void) | null>(null)

  const swapTo = (next: View) => {
    if (paper.current && footer.current && current.current) {
      leaving.current = snapshot({ paper: paper.current, footer: footer.current, view: current.current })
    }
    stopSwap.current?.()
    stopSwap.current = null
    setView(next)
  }

  const jumpTo = (next: View) => {
    stopSwap.current?.()
    stopSwap.current = null
    leaving.current = null
    setView(next)
  }

  useLayoutEffect(() => {
    const copy = leaving.current
    leaving.current = null
    if (!copy || !panel.current || !paper.current || !footer.current || !hintRow.current || !current.current) return
    stopSwap.current = playSwap(
      { panel: panel.current, paper: paper.current, footer: footer.current, hints: hintRow.current, view: current.current },
      copy
    )
  }, [view])

  return (
    <parts.Root
      ref={root}
      controller={bar}
      className={className}
      onOpenChange={(open, details) => {
        if (open) {
          delete root.current?.dataset.closing
          agent.reset()
          jumpTo("list")
          return
        }
        if (view === "reminder" && details.reason === "escape-key") {
          details.cancel()
          swapTo("list")
          return
        }
        // Esc answers a waiting card with no, stops a reply still arriving, and otherwise goes back to the list.
        if (view === "conversation" && details.reason === "escape-key") {
          details.cancel()
          if (agent.waiting) agent.answer(false)
          else if (agent.saving) return
          else if (agent.busy) agent.stop()
          else swapTo("list")
          return
        }
        // After a save the bar fades out showing the form, so it stays put until the next open.
        if (root.current?.dataset.closing !== "saved") jumpTo("list")
      }}
      onChoose={(value, details) => {
        if (value === "create-reminder") {
          details.cancel()
          swapTo("reminder")
          return
        }
        const command = commands.find((item) => item.value === value)
        if (command) onChoose?.(command)
      }}
      onAsk={(question) => {
        agent.ask(question)
        swapTo("conversation")
      }}
    >
      {children}
      <parts.Backdrop data-bar-layer="" className="fixed inset-0 m-0 size-auto max-h-none max-w-none border-0 bg-veil p-0" />
      <parts.Content data-bar-layer="" className="fixed inset-x-0 top-[14vh] bottom-auto mx-auto my-0 h-fit w-[min(560px,calc(100vw-32px))] border-0 bg-transparent p-0 text-left text-ink">
        <div ref={paper} data-paper="" aria-hidden="true" className="absolute inset-0 -z-10 origin-top rounded-[5px] bg-card shadow-card" />
        <parts.Title className="sr-only">Ask</parts.Title>
        <parts.Panel ref={panel} className="relative">
          <div ref={current} key={view} className="origin-top">
          {view === "list" ? (
            <>
              <div className="flex items-center gap-3 border-b-[1.5px] border-red-line px-4">
                <SearchIcon className="shrink-0 text-hint" />
                <parts.Input
                  autoFocus
                  placeholder="Type a command"
                  className="h-13 w-full min-w-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-hint"
                />
              </div>
              <parts.List className="max-h-[min(360px,50vh)] overflow-y-auto">
                {commands.map(({ value, label, Icon }) => (
                  <parts.Item
                    key={value}
                    value={value}
                    label={label}
                    className="group flex cursor-default items-center gap-3 border-b border-rule px-4 py-2.5 text-[15px] last:border-b-0 data-highlighted:bg-row-tint"
                  >
                    <Icon className="shrink-0 text-hint group-data-highlighted:text-ink" />
                    <span className="-mx-1 rounded-[2px] px-1 group-data-highlighted:highlighter">{label}</span>
                    <span aria-hidden="true" className="invisible ml-auto text-[13px] text-hint group-data-highlighted:visible">
                      ↵
                    </span>
                  </parts.Item>
                ))}
                <parts.Item
                  value={ASK}
                  className="group flex cursor-default items-center gap-3 px-4 py-2.5 text-[15px] data-highlighted:bg-row-tint"
                >
                  {({ query }) => (
                    <>
                      <AskIcon className="shrink-0 text-hint group-data-highlighted:text-ink" />
                      <span className="-mx-1 min-w-0 truncate rounded-[2px] px-1 group-data-highlighted:highlighter">Ask “{query}”</span>
                      <span aria-hidden="true" className="invisible ml-auto text-[13px] text-hint group-data-highlighted:visible">
                        ↵
                      </span>
                    </>
                  )}
                </parts.Item>
              </parts.List>
              <parts.Empty className="px-4 py-6 text-[15px] text-hint">
                {({ query }) => <>No commands match “{query}”</>}
              </parts.Empty>
            </>
          ) : view === "conversation" ? (
            <Conversation agent={agent} />
          ) : (
            <>
              <div className="flex h-13 items-center gap-3 border-b-[1.5px] border-red-line px-4">
                <BellIcon className="shrink-0 text-hint" />
                <p className="text-[17px]">New reminder</p>
              </div>
              <ReminderForm
                onSaved={(reminder) => {
                  const from = paper.current!.getBoundingClientRect()
                  if (root.current) root.current.dataset.closing = "saved"
                  onReminderSaved?.(reminder, from)
                  bar.close()
                }}
              />
            </>
          )}
          </div>
          <div ref={footer} aria-hidden="true" className="border-t border-rule px-4 py-2.5 text-[12.5px] text-hint">
            <div ref={hintRow} className="flex min-h-[22.5px] flex-wrap gap-x-5 gap-y-1.5">
              {(view === "conversation" ? conversationHints(agent) : hints[view]).map(([keys, action]) => (
                <span key={action} className="inline-flex items-center gap-1.5">
                  {keys.map((key) => (
                    <kbd key={key} className={keycap}>
                      {key}
                    </kbd>
                  ))}
                  {action}
                </span>
              ))}
            </div>
          </div>
        </parts.Panel>
      </parts.Content>
    </parts.Root>
  )
}

const CommandBarShortcut = parts.Shortcut

export { CommandBar, CommandBarShortcut, keycap }
