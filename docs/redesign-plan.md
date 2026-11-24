# The colourful week redesign

The new look for Ask, from `docs/design/colourful-week.html`:
- a week time grid with reminders as soft coloured cards, each with an icon by category;
- today highlighted, with a red line at the current minute;
- Plus Jakarta Sans;
- the Ask bar docked at the bottom of the screen.

Work happens on the `redesign` branch, one small step at a time, each reviewed before the next starts.

## Where it stands

| Step | What | Status |
| --- | --- | --- |
| 0 | The branch | Done |
| 1 | Categories in the data | Done |
| 2 | Categories for the agent | Done |
| 3 | The new palette and font | Done |
| 4 | The header | Done |
| 5 | The time grid, and the phone day list | Done |
| 6 | The Ask bar in the new look | Done |
| 6b | Ask again when a message with a date or time "isn't understood" | Next |
| 7 | The dashed "not saved" card | Next |
| 9 | Tidy up, and the deploy notes | Before launch |
| 8 | Drag motion and the phone grip | After launch |

## Ground rules

- **No commits or pushes by Claude.** You commit everything yourself.
- **No real Groq calls without your OK, for a number of calls you name.** The live test enforces that number: run it with `ASK_LIVE_CALLS=<n>` set for the same command, and a call past it is refused before it reaches Groq. `ASK_LIVE_CALLS=0` is a dry run that shows which sentences a `-t` pattern picks, without calling Groq.
- **Databases.**
  - The migration goes to the test database and the dev branch only.
  - Check `.env.local` by endpoint before running anything against a database. Never touch main.
  - Main gets `prisma migrate deploy`, run by you, before the code that reads `category` is deployed (see step 9).
- **`lib/agent-actions.ts` is yours.** Claude reviews it and points out problems, but doesn't edit it.
- **Line endings.** Files in this repo mix Windows and Unix line endings. Change only the lines you need, and never convert a whole file.
- **Every step ends with:**
  - lint, typecheck, `npm run test:api` (from PowerShell) and `npm run test:e2e`, which runs on its own server;
  - deliberate breaks of the step's new behaviour, each caught by a test;
  - a stop for your review.

## Your answers that shaped the plan

- **Phones get a day list.** The grid starts at tablet width, and nothing scrolls sideways.
- **The grid grows to fit.** It shows 8am to 11pm by default, widening for an earlier or later reminder.
- **No week navigation yet.** This week only.
- **Dragging changes the date only.** The time stays.
- **No server override for "other".** The category description in `lib/agent-actions.ts` gives the model examples instead.
- **The bar's buttons keep their wording.** "Don't save" stays, so it can't be confused with cancelling a reminder.

---

## Done

### Step 0: the branch
`redesign`, from `main` at `aa70816`.

### Step 1: categories in the data
- **The list.** `lib/categories.ts` names the categories: work, health, call, message, food, travel, exercise, shopping, hobby and other.
- **The keyword guess.** `guessCategory(title)` guesses from whole words in the title, with call and message checked before work.
- **The database.** A `reminder_category` enum and a `category` column, defaulting to `other`. Migration `20261123183521_add_reminder_category` is applied to the test database and the dev branch.
- **The API.** `POST /api/reminders` takes an optional category and guesses one from the title when it's left out. `PATCH` can change it, and an unknown category is refused.

### Step 2: categories for the agent
- **Your schema.** `createReminderInput` requires a category, and `changeReminderInput` can change it. A call that leaves the category out is refused by the schema, and the model is asked again. There's no server guess for the agent.
- **The server.**
  - Preview cards and `listReminders` carry the category.
  - The change tool's description names category among what it can change.
- **The test sentences** each have an expected category. "Pay rent" accepts either other or shopping.

### Step 3: the new palette and font
- **Colours.** The design's tokens are in `app/globals.css`: page, surface, ink, muted, line, line-faint, today, accent, now and error. Each category has a card colour, an ink and a tile, and every token has a dark variant.
- **Font and weights.** Plus Jakarta Sans. Body text is 500, emphasis 600 to 700, headings 800.
- **Contrast test.** `e2e/contrast.spec.ts` measures every word on the main screens, light and dark, from the colours the browser paints: 4.5:1 for text, and 3:1 for large text and icons.

### Step 4: the header
- **The title.** A calendar tile, then the month: "November 2026", or "Nov – Dec 2026" when the week spans two months (`monthTitle` in `components/week/days.ts`).
- **The "Ask anything" pill** is the bar's UI SDK trigger part. Ctrl+K works as before.
- **Screen readers.** The "This week, 16 – 22 Nov" heading is only read out now.

### Step 5: the time grid, and the phone day list
- **The rules.** `components/week/grid.ts` holds them, unit-tested:
  - the hours shown;
  - 48px an hour;
  - lanes for overlapping cards, from UI SDK's `stackSpans`;
  - the now line.
- **Cards** are in their category's colours, from `components/week/category-look.tsx`. A narrow card drops its icon first, then keeps only the icon.
- **Card names** include the category, e.g. "Dentist, 09:00, health". "Other" is left out.
- **Phones** get a stacked day list, and today's cards line up with the other days.
- **Saving.** In the grid, a new card flies to its time and nothing else makes room. On a phone, the cards below still slide down.

### Step 6: the Ask bar in the new look
- **Placement.** The bar is docked at the bottom, centred and 600px wide, with no veil. It grows upward, and its height animation runs from the bottom edge. On a phone it's a sheet across the bottom.
- **Preview card.** It takes the category's colour and icon tile, with the action label, a 20px title, the date and time, and pill buttons. On a work card, the buttons swap to a white Save and an outlined "Don't save".
- **New reminder form.** A Category picker follows the title's keyword guess until you pick one yourself, and the category is saved with the reminder.

---

## Next

### Step 6b: ask again when a message with a date or time "isn't understood"

**Why.** With the instruction line "A task with a date or time is a reminder to set, even when you can't do the task yourself", tasks Ask can't do itself still sometimes come back as `didNotUnderstand`. In the last live runs:
- "book flights on 3 December at 10am" was off-topic in 1 of 3 runs;
- "Book a table for dinner Friday at 7pm" was off-topic in its one run.

**What.** When the latest message has a date or time and the model calls `didNotUnderstand`, the server turns that down once and asks the model again. A second "didn't understand" is accepted, and the bar shows its examples as it does today.

**How.**
- **Spotting a date or time.** A pure function, `mentionsWhen(text)`, unit-tested. It looks for:
  - clock times (7pm, 10am, 18:00, noon, midnight);
  - day words (today, tonight, tomorrow, the weekdays);
  - dates ("3 December", "the 1st");
  - spans ("in 2 hours").
- **The retry.**
  - The first `didNotUnderstand` call in a reply ends in a tool error instead of a result. The error tells the model the message has a date or time, so it's a reminder to set: propose it, or ask what's missing.
  - The reply no longer stops on any `didNotUnderstand` call, only on one that succeeds.
  - Never more than one retry per reply.
- **Limits.**
  - The retry is part of the same question, so it doesn't take another of the visitor's daily questions (`takeQuestion` runs once per new question).
  - It is a real Groq call, so it does take one of the site's calls for the day through `countedModel`, like every model call.
- **Cost.** One extra call, only when the model would otherwise refuse a message with a date or time.

**Tests, with a fake model:**
- "Didn't understand" with a date or time is retried once, and the second answer stands, card or "didn't understand".
- Without a date or time, it ends in one call, as today.
- A reply is never retried more than once.
- The retry doesn't use one of the visitor's daily questions, but does use a site call.
- The model hears why it was asked again.
- `mentionsWhen` has unit tests for each kind of date and time, and for messages without one ("asdfgh", "do the thing", "what's the weather").

**Breaks.** No retry; retrying without a date or time; retrying more than once; the retry using a question.

**Live check, with your OK for 12 calls (`ASK_LIVE_CALLS=12`).** Run "book flights on 3 December at 10am" and "Book a table for dinner Friday at 7pm" 3 times each. That's at most 2 calls a run.

### Step 7: the dashed "not saved" card
- **When it shows.** While a create or change card waits for your OK, the week shows a white card with a dashed border in the category's colour, at its date and time, reading "6:00 PM · not saved".
  - For a change, the original card fades to half strength.
  - Nothing shows for cancel or restore, or for a date outside this week.
- **How it's wired.**
  - `CommandBar` reports the waiting preview (`onWaiting`), and the page passes it to `Week`.
  - The dashed card is hidden from screen readers, because the bar's card is what they hear.
  - It can't be dragged or focused.
  - If it's off screen or under the docked bar, the page scrolls just enough to show it.
- **Hint line.** It mentions the dashed card when one shows (moved here from step 6).
- **On yes:** the dashed card becomes the real one in place, its dashed border filling to solid in one 200ms ease-out. Agent saves don't fly.
- **On no:** it fades out over 150ms.
- **Reduced motion:** both happen instantly.
- **Form saves** keep their flight from the bar into the slot.
- **Highlighter.** The highlighter on a new card's title becomes an accent ring that stays.
- **Tests.**
  - The dashed card's place and text.
  - It goes on no and becomes the card on yes.
  - It scrolls into view.
  - Reduced motion.
  - Only transform and opacity animate.

### Step 9: tidy up, before launch
- **Leftovers.** Remove what the old Index card look left behind, like `--veil`, which is unused since step 6, and the highlighter once step 7 replaces it.
- **CLAUDE.md.** Update the week notes for the grid, lanes and phone list.
- **Deploy notes.** Main needs `prisma migrate deploy`, run by you, before the code that reads `category` is deployed.
- **Final checks.**
  - Full suites, plus contrast in light and dark.
  - Screenshots of desktop, tablet and phone in both themes.
  - A test on a real phone: the on-screen keyboard may cover the bottom sheet, especially in iOS Safari.

## After launch

### Step 8: drag motion and the phone grip
- **Pointer drag.**
  - Pickup: the card lifts to scale 1.03 with a stronger shadow, over 150ms.
  - Follow: it moves 1:1 with the pointer.
  - Drop: it settles in about 220ms with a light bounce.
  - Return: 200ms ease-out with no bounce.
- **Keyboard moves** don't animate.
- **Reduced motion:** fades only.
- **Phones.** In the day list, a grip of at least 44×44px starts the drag, and touching anywhere else scrolls.
- **Other cards in the day.** They slide to their new lanes instead of jumping.

---

## Flaky tests to watch

Both failed once under the full suite's load, then passed every time on their own and in every full run since. If either fails again, look into it rather than rerunning.

1. **`e2e/week-drag.spec.ts`: "Escape puts a picked-up card back, and so does Tab, which moves on: neither saves anything."**
   - Failed once: after Tab, focus was still on the card.
   - Passed 8 of 8 on its own.
   - It may be a real race: on a slow machine, cancelling the pick-up may return focus to the card after Tab has already moved it on.
2. **`e2e/motion.spec.ts`: "an error eases in under its field: a short fade and drop, nothing shakes."**
   - Failed once: it timed out waiting to see the 150ms animation start.
   - Passed 24 of 24 on its own.

## Live check results so far

All runs use the test database. Calls were capped once `ASK_LIVE_CALLS` existed.

| Run | Calls | Result |
| --- | --- | --- |
| The 12 new-reminder sentences, first category run | 12 | 10 of 12 categories right; "Take my medicine" and "send the invoice" came back as other |
| The same 12, after your examples in the description | 12 | All 11 cards right; "book flights" went off-topic |
| "book flights" ×3, and 5 sentences with words outside the description | 8 | Flights off-topic in 2 of 3; 4 of 5 right ("Reply to Ada's email" came back as work) |
| "book flights" ×3, and 5 task and message sentences, after the instruction line | 8 | Flights off-topic in 1 of 3; 4 of 5 right ("Book a table…" went off-topic) |

Tokens per call are now about 1,435 in and up to about 300 out. All 42 test sentences take about 62 calls, about half of Groq's free day, which the live site shares.

## Open questions

- **"Order a cake"** is graded as food only. Shopping is arguably fair too. Your call.
- **The bottom sheet on a real phone.** See step 9.
