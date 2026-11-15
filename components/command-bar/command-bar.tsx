"use client"

import { createParts } from "@ui-sdk/react/primitive"
import type { ReactNode } from "react"
import { commands, type Command } from "./commands"
import { SearchIcon } from "./icons"
import { commandBar } from "./primitive"

const parts = createParts(commandBar, {
  root: "div",
  shortcut: "kbd",
  backdrop: "div",
  content: "div",
  title: "h2",
  input: "input",
  list: "div",
  item: "div",
  empty: "p",
})

const keycap =
  "inline-grid min-w-5 place-items-center rounded-[4px] border border-b-2 border-rule bg-card px-1.5 py-1 font-sans text-[11.5px] leading-none font-medium text-ink"

type CommandBarProps = {
  onChoose?: (command: Command) => void
  children?: ReactNode
  className?: string
}

function CommandBar({ onChoose, children, className }: CommandBarProps) {
  return (
    <parts.Root
      className={className}
      onChoose={(value) => {
        const command = commands.find((item) => item.value === value)
        if (command) onChoose?.(command)
      }}
    >
      {children}
      <parts.Backdrop className="fixed inset-0 m-0 size-auto max-h-none max-w-none border-0 bg-veil p-0" />
      <parts.Content className="fixed inset-x-0 top-[14vh] bottom-auto mx-auto my-0 h-fit w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-[5px] border-0 bg-card p-0 text-left text-ink shadow-card">
        <parts.Title className="sr-only">Ask</parts.Title>
        <div className="flex items-center gap-3 border-b-[1.5px] border-red-line px-4">
          <SearchIcon className="shrink-0 text-hint" />
          <parts.Input
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
        </parts.List>
        <parts.Empty className="px-4 py-6 text-[15px] text-hint">
          {({ query }) => <>No commands match “{query}”</>}
        </parts.Empty>
        <div
          aria-hidden="true"
          className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-rule px-4 py-2.5 text-[12.5px] text-hint"
        >
          <span className="inline-flex items-center gap-1.5">
            <kbd className={keycap}>↑</kbd>
            <kbd className={keycap}>↓</kbd>
            move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className={keycap}>↵</kbd>
            choose
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className={keycap}>esc</kbd>
            close
          </span>
        </div>
      </parts.Content>
    </parts.Root>
  )
}

const CommandBarShortcut = parts.Shortcut

export { CommandBar, CommandBarShortcut, keycap }
