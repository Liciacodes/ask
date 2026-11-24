import { NAMES_A_DATE } from "./which-week"

// Whether a message says when: a clock time, a day, a date or a span from now. Such a message is almost always a
// reminder to set, so a first "didn't understand" for it is turned down and the model is asked again (agent.ts).

const NUMBER_WORD = "\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty-five|a few|a couple of"

const SAYS_WHEN = [
  // 7pm, 10 am, 9.30pm, 6:15 p.m.
  /\b\d{1,2}(?:[:.][0-5]\d)?\s*(?:am|pm|a\.m\.|p\.m\.)(?![a-z])/i,
  // 18:00, 7:30, and "at 9" or "at 9.30" with no am or pm
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,
  /\bat\s+\d{1,2}(?:[:.][0-5]\d)?\b/i,
  // noon, midday, midnight, 7 o'clock
  /\b(?:noon|midday|midnight)\b/i,
  /\b\d{1,2}\s*o['’]?clock\b/i,
  // today, tonight, tomorrow, and the weekdays in full: "sun" and "sat" are words of their own.
  /\b(?:today|tonight|tomorrow)\b/i,
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)days?\b/i,
  // the 1st, 3 December, Dec 3, 27/11, 2026-11-27
  NAMES_A_DATE,
  // in 2 hours, in an hour, in half an hour, in a few days
  new RegExp(`\\bin\\s+(?:half\\s+an|${NUMBER_WORD})\\s+(?:min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?)\\b`, "i"),
]

function mentionsWhen(text: string) {
  return SAYS_WHEN.some((pattern) => pattern.test(text))
}

export { mentionsWhen }
