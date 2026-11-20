// What Ask says when a reply stops part way for lack of room. The server writes these into the reply and
// the bar shows them as they are; any other failure reads as a lost connection.

const STILL_WORKS = "Create reminder still works."

const problems = {
  busy: "Lots of people are trying Ask right now. Try again in a minute. The New reminder form still works.",
  siteUsedUp: `Ask has answered all it can for today. ${STILL_WORKS}`,
}

// The same limits, met before a reply starts: then there's time to say when they come back.
const usedUp = {
  visitor: (questions: number, from: string) => `You've used today's ${questions} questions. You can ask again from ${from}. ${STILL_WORKS}`,
  site: (from: string) => `Ask has answered all it can for today. You can ask again from ${from}. ${STILL_WORKS}`,
}

const isReplyProblem = (text: string) => Object.values(problems).includes(text)

export { isReplyProblem, problems, usedUp }
