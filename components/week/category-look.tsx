import type { SVGProps } from "react"
import type { Category } from "@/lib/categories"

// Each kind of reminder's dot, as whole class names so Tailwind finds them. The dot sits beside the category's grey
// icon or its name, so colour is never the only clue.
const categoryDot: Record<Category, string> = {
  work: "bg-work",
  health: "bg-health",
  call: "bg-call",
  message: "bg-message",
  food: "bg-food",
  travel: "bg-travel",
  exercise: "bg-exercise",
  shopping: "bg-shopping",
  hobby: "bg-hobby",
  other: "bg-other",
}

const categoryName: Record<Category, string> = {
  work: "Work",
  health: "Health",
  call: "Call",
  message: "Message",
  food: "Food",
  travel: "Travel",
  exercise: "Exercise",
  shopping: "Shopping",
  hobby: "Hobby",
  other: "Other",
}

// The design's icons, on a 24px grid. Call and message share a dot colour, so their icons tell them apart.
const paths: Record<Category, string> = {
  work: "M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  health: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z",
  call: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  food: "M5 3v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M7 12v9M17 3c-2 2-2.5 6 0 8v10",
  travel: "M3 13l2-6h14l2 6v5H3zM7 18v2M17 18v2M3 13h18",
  exercise: "M22 12h-4l-3 9L9 3l-3 9H2",
  shopping: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  hobby: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  other: "M6 3h12v18l-6-4-6 4z",
}

function CategoryIcon({ category, ...props }: SVGProps<SVGSVGElement> & { category: Category }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[category]} />
    </svg>
  )
}

// The clock before a reminder's time, on the cards and in the bar.
function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

// A reminder's colour, as a small round dot before its title.
function CategoryDot({ category, className = "size-2" }: { category: Category; className?: string }) {
  return <span aria-hidden="true" className={`shrink-0 rounded-full ${categoryDot[category]} ${className}`} />
}

export { CategoryDot, CategoryIcon, ClockIcon, categoryName }
