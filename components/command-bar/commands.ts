import { BellIcon, CalendarIcon, NoteAddIcon, NotesIcon } from "./icons"

const commands = [
  { value: "create-reminder", label: "Create reminder", Icon: BellIcon },
  { value: "add-note", label: "Add note", Icon: NoteAddIcon },
  { value: "show-this-week", label: "Show this week", Icon: CalendarIcon },
  { value: "show-notes", label: "Show notes", Icon: NotesIcon },
] as const

type Command = (typeof commands)[number]

export { commands, type Command }
