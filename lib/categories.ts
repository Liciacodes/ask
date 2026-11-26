// What a reminder is about, for its colour and icon in the week. The same list as the database's
// reminder_category enum (prisma/schema.prisma); a test keeps the two in step.

const CATEGORIES = ["work", "health", "call", "message", "food", "travel", "exercise", "shopping", "hobby", "other"] as const

type Category = (typeof CATEGORIES)[number]

// The fallback when nobody picked one: words in the title, whole words only, in this order. The first category with
// a match wins, so "call the bank" is a call, not work, and "pick up groceries" is shopping, not travel.
const KEYWORDS: [Category, string[]][] = [
  ["call", ["call", "calls", "calling", "ring", "phone", "facetime"]],
  ["message", ["text", "texts", "message", "messages", "email", "emails", "reply", "dm", "whatsapp", "write to"]],
  ["health", ["dentist", "doctor", "gp", "medicine", "meds", "pills", "vitamins", "pharmacy", "hospital", "therapy", "physio", "check-up", "checkup"]],
  ["food", ["lunch", "dinner", "breakfast", "brunch", "coffee", "cook", "cooking", "eat", "restaurant", "bake"]],
  ["shopping", ["buy", "groceries", "grocery", "shop", "shopping", "order"]],
  ["travel", ["flight", "flights", "train", "airport", "pick up", "drop off", "trip", "taxi", "bus", "drive", "hotel", "passport", "visa"]],
  ["exercise", ["gym", "run", "running", "jog", "walk", "yoga", "swim", "swimming", "tennis", "football", "workout", "cycling", "pilates"]],
  ["hobby", ["piano", "guitar", "read", "reading", "paint", "painting", "draw", "drawing", "practice", "practise", "knit", "gardening", "sing"]],
  ["work", ["meeting", "meetings", "report", "invoice", "client", "clients", "interview", "standup", "deadline", "presentation", "project", "office", "work", "job", "jobs"]],
]

const PATTERNS = KEYWORDS.map(([category, words]) => {
  const alternatives = words.map((word) => word.replace(/[-]/g, "\\-").replace(/ /g, "\\s+")).join("|")
  return [category, new RegExp(`\\b(?:${alternatives})\\b`, "i")] as const
})

function guessCategory(title: string): Category {
  return PATTERNS.find(([, pattern]) => pattern.test(title))?.[0] ?? "other"
}

export { CATEGORIES, guessCategory, type Category }
