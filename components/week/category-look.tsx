import type { SVGProps } from "react"
import type { Category } from "@/lib/categories"

// Each kind of reminder's colours, as whole class names so Tailwind finds them: its card and words, the tile behind
// its icon, and the highlighter on the bar's card title, in a shade its words still read on.
const categoryLook: Record<Category, { card: string; tile: string }> = {
  work: { card: "bg-work text-work-ink shadow-work [--marker:var(--work-marker)]", tile: "bg-work-tile" },
  health: { card: "bg-health text-health-ink [--marker:var(--health-tile)]", tile: "bg-health-tile" },
  call: { card: "bg-call text-call-ink [--marker:var(--call-tile)]", tile: "bg-call-tile" },
  message: { card: "bg-message text-message-ink [--marker:var(--message-tile)]", tile: "bg-message-tile" },
  food: { card: "bg-food text-food-ink [--marker:var(--food-tile)]", tile: "bg-food-tile" },
  travel: { card: "bg-travel text-travel-ink [--marker:var(--travel-tile)]", tile: "bg-travel-tile" },
  exercise: { card: "bg-exercise text-exercise-ink [--marker:var(--exercise-tile)]", tile: "bg-exercise-tile" },
  shopping: { card: "bg-shopping text-shopping-ink [--marker:var(--shopping-tile)]", tile: "bg-shopping-tile" },
  hobby: { card: "bg-hobby text-hobby-ink [--marker:var(--hobby-tile)]", tile: "bg-hobby-tile" },
  other: { card: "bg-other text-other-ink [--marker:var(--other-tile)]", tile: "bg-other-tile" },
}

// A card that isn't saved yet: white, with a dashed border and words in its category's ink. A work card's ink is
// white, so on white it takes the accent, and its tile is the accent itself.
const dashedLook: Record<Category, { card: string; tile: string }> = {
  work: { card: "border-accent text-accent", tile: "bg-work text-work-ink" },
  health: { card: "border-health-ink text-health-ink", tile: "bg-health-tile" },
  call: { card: "border-call-ink text-call-ink", tile: "bg-call-tile" },
  message: { card: "border-message-ink text-message-ink", tile: "bg-message-tile" },
  food: { card: "border-food-ink text-food-ink", tile: "bg-food-tile" },
  travel: { card: "border-travel-ink text-travel-ink", tile: "bg-travel-tile" },
  exercise: { card: "border-exercise-ink text-exercise-ink", tile: "bg-exercise-tile" },
  shopping: { card: "border-shopping-ink text-shopping-ink", tile: "bg-shopping-tile" },
  hobby: { card: "border-hobby-ink text-hobby-ink", tile: "bg-hobby-tile" },
  other: { card: "border-other-ink text-other-ink", tile: "bg-other-tile" },
}

// A small tile on its own, like an option in the New reminder form's picker.
const categoryChip: Record<Category, string> = {
  work: "bg-work text-work-ink",
  health: "bg-health-tile text-health-ink",
  call: "bg-call-tile text-call-ink",
  message: "bg-message-tile text-message-ink",
  food: "bg-food-tile text-food-ink",
  travel: "bg-travel-tile text-travel-ink",
  exercise: "bg-exercise-tile text-exercise-ink",
  shopping: "bg-shopping-tile text-shopping-ink",
  hobby: "bg-hobby-tile text-hobby-ink",
  other: "bg-other-tile text-other-ink",
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

// The design's icons, on a 24px grid. Call and message share a colour, so their icons tell them apart.
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
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[category]} />
    </svg>
  )
}

export { CategoryIcon, categoryChip, categoryLook, categoryName, dashedLook }
