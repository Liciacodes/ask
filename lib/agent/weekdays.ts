// Models name the wrong weekday for a date: "Friday December 1st" for a Tuesday, "Thursday 23 November" for a Monday.
// The server knows the calendar, so wherever a reply puts a weekday next to a date, the weekday becomes the date's own.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

const WEEKDAY = "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)"
const MONTH = "(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)"
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?"
const YEAR = "(?:,?\\s+(\\d{4}))?"
// "Thursday 23 November", "Friday, the 20th of November 2026", "Mon 23 Nov"
const DAY_FIRST = new RegExp(`\\b${WEEKDAY}\\.?,?\\s+\\(?(?:the\\s+)?${DAY}(?:\\s+of)?\\s+${MONTH}\\b\\.?${YEAR}`, "gi")
// "Friday December 1st", "Tuesday, December 1, 2026"
const MONTH_FIRST = new RegExp(`\\b${WEEKDAY}\\.?,?\\s+\\(?${MONTH}\\.?\\s+(?:the\\s+)?${DAY}\\b${YEAR}`, "gi")

// The date meant, in the year given or, without one, the year that puts it nearest today. Nothing for 31 November.
function dateOf(day: number, month: number, year: number | undefined, today: string) {
  const [y, m, d] = today.split("-").map(Number)
  const now = Date.UTC(y, m - 1, d)
  const dates = (year ? [year] : [y - 1, y, y + 1])
    .map((candidate) => new Date(Date.UTC(candidate, month, day)))
    .filter((date) => date.getUTCMonth() === month && date.getUTCDate() === day)
  return dates.sort((a, b) => Math.abs(a.getTime() - now) - Math.abs(b.getTime() - now))[0]
}

// The right weekday, written the way the wrong one was: "Thu" stays short, "FRIDAY" stays in capitals.
function asWritten(right: string, written: string) {
  const word = DAY_NAMES.some((name) => name.toLowerCase() === written.toLowerCase()) ? right : right.slice(0, 3)
  if (written === written.toUpperCase()) return word.toUpperCase()
  if (written[0] === written[0].toLowerCase()) return word.toLowerCase()
  return word
}

function rightWeekdays(text: string, today: string, onFix: (fix: string) => void = () => {}) {
  const fix = (match: string, written: string, day: string, month: string, year: string | undefined) => {
    const date = dateOf(Number(day), MONTHS.indexOf(month.slice(0, 3).toLowerCase()), year ? Number(year) : undefined, today)
    if (!date) return match
    const right = DAY_NAMES[date.getUTCDay()]
    if (right.toLowerCase().startsWith(written.toLowerCase())) return match
    onFix(`${written} → ${right} for ${date.toISOString().slice(0, 10)}`)
    return asWritten(right, written) + match.slice(written.length)
  }
  return text
    .replace(DAY_FIRST, (match, written, day, month, year) => fix(match, written, day, month, year))
    .replace(MONTH_FIRST, (match, written, month, day, year) => fix(match, written, day, month, year))
}

export { rightWeekdays }
