import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </Icon>
  )
}

function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 13.5h3M4 11V7.5a4 4 0 0 1 8 0V11l1.2 1H2.8L4 11Z" />
    </Icon>
  )
}

function NoteAddIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 2.5h6l3 3v8h-9z" />
      <path d="M9.5 2.5v3h3M8 7.5v4M6 9.5h4" />
    </Icon>
  )
}

function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </Icon>
  )
}

function NotesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 2.5h8v11H4z" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
    </Icon>
  )
}

function CalendarAddIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
      <path d="M8 8.5v3M6.5 10h3" />
    </Icon>
  )
}

function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Icon>
  )
}

export { BellIcon, CalendarIcon, CheckIcon, NoteAddIcon, NotesIcon, SearchIcon, CalendarAddIcon }
