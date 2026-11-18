// Sentences that need a date worked out, each with the answer we expect. The API tests check that the model is
// handed that date and that it saves on the right day; `npm run test:live` checks what the real model sends.
const dateCases = [
  {
    say: "go for a run on Saturday at 7am",
    // Wednesday evening in Lagos, when this came back as Friday 20 November.
    now: "2026-11-18T20:36:00+01:00",
    timezone: "Africa/Lagos",
    expected: { date: "2026-11-21", time: "07:00" },
    weekday: "Sat",
    savedAt: "2026-11-21T06:00:00.000Z",
  },
]

export { dateCases }
