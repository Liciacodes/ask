import { BellIcon, CalendarAddIcon, CalendarIcon, NoteAddIcon, NotesIcon } from "./icons"

const commands = [
  { value: "create-reminder", label: "Create reminder", Icon: BellIcon },
  { value: "add-note", label: "Add note", Icon: NoteAddIcon },
  { value: "show-this-week", label: "Show this week", Icon: CalendarIcon },
  { value: "show-notes", label: "Show notes", Icon: NotesIcon },
   { value: "add-event", label: "Add Event", Icon: CalendarAddIcon },
] as const

type Command = (typeof commands)[number]

export { commands, type Command }
