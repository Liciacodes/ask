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
| 6b | Ask again when a message with a date or time "isn't understood" | Done |
| 7 | The dashed "not saved" card | Done |
| 8b | Notes, and editing a card in the New reminder form | Built, waiting for your review |
| 9 | Tidy up, and the deploy notes | Before launch |
| 8 | Drag motion and the phone grip | After launch |
| 10 | The Chrome extension that breaks drag and Ask | After launch |

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
- **"Order a cake" may be food or shopping**, like "Pay rent", which may be other or shopping.
- **An off-topic message with a date or time may get a question offering a reminder** after the retry, like "What time tomorrow would you like to be reminded to check the weather?" It's friendly, and Ask is a reminder app. The retry's wording stays as it is.

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

### Step 6b: ask again when a message with a date or time "isn't understood"

**Why.** With the instruction line "A task with a date or time is a reminder to set, even when you can't do the task yourself", tasks Ask can't do itself still sometimes came back as `didNotUnderstand`: "book flights on 3 December at 10am" in 1 of 3 live runs, and "Book a table for dinner Friday at 7pm" in its one run.

**What.** When the latest message has a date or time and the model calls `didNotUnderstand`, the server turns that down once and asks the model again. The second answer stands: a card, a question, or "didn't understand", which the bar shows with its examples as before.

**How it's built.**
- **`mentionsWhen(text)`** (`lib/agent/mentions-when.ts`) looks for:
  - clock times: 7pm, 10 am, 9.30pm, 18:00, "at 9", noon, midday, midnight, 7 o'clock;
  - day words: today, tonight, tomorrow, and the weekdays in full ("sun" and "sat" are words of their own);
  - dates, with the patterns "next Friday" already uses (`NAMES_A_DATE` in `which-week.ts`): "the 1st", "3 December", "Dec 3", 27/11, 2026-11-27;
  - spans: "in 2 hours", "in an hour", "in half an hour", "in a few days".
- **The retry** (`lib/agent/agent.ts`).
  - The first `didNotUnderstand` in a reply throws `AskAgain` instead of returning, so the model gets a tool error: the message has a date or time, so it's a reminder to set; propose it, or ask what's missing; only if it has nothing to do with a reminder, call didNotUnderstand again.
  - The reply stops only on a `didNotUnderstand` that succeeds (`notUnderstood`), no longer on any call of it.
  - At most one retry a reply. Only the latest message counts, not a date earlier in the conversation.
  - The bar keeps the error's exact words, so on the next question the model reads what it read the first time. It isn't logged as a failure, and the bar shows nothing for it.
- **Limits.** The retry is part of the same question, so it doesn't take another of the visitor's questions. It is a real Groq call, so it takes one of the site's calls for the day through `countedModel`.
- **Cost.** One extra call, only when the model says "didn't understand" to a message with a date or time. Off-topic messages that mention a day pay it too: the test sentence "what's the weather tomorrow?" now takes 2 calls, so all 42 sentences take about 63.

**Tests, with a fake model.**
- `tests/mentions-when.test.ts`: each kind of date and time, and 9 messages without one ("asdfgh", "do the thing", "what's the weather", "the sun is out", "I may go", …).
- `tests/api/agent.test.ts`, "“didn't understand” a message with a date or time":
  - asked again once: a card the second time gets its card, and a question is asked;
  - a second "didn't understand" stands, and there's no third call;
  - no date or time ends in one call, as before;
  - a date earlier in the conversation doesn't bring a retry;
  - the model hears why, and the bar gets the same words, with nothing in the error log;
  - on the next question the model reads the error as it did the first time.
- The test sentence "what's the weather tomorrow?" is marked `askedAgain`, and expects 2 calls.
- `tests/api/limits.test.ts`: the retry uses a site call but not one of the visitor's questions.
- `e2e/agent.spec.ts`: a reply that was asked again shows only its card, with no examples and no words back in the field, and Enter still saves.
- The live test logs `askedAgain`, and checks only the "didn't understand" that stood.

**Breaks, each caught.**
| Break | Caught by |
| --- | --- |
| No retry | 7 tests |
| Retrying without a date or time | 6 tests |
| Retrying more than once | 2 tests |
| The retry taking one of the visitor's questions | the limits test (2 questions, not 1) |
| The bar getting different words from the model's | 2 tests |

**Live check, 24 November: 11 of the 16 calls you agreed.** Three runs, capped at 6, 6 and 4 calls.
- "book flights on 3 December at 10am": the right card in 3 of 3. The first run was off-topic, was asked again, and got its card on the second call.
- "Book a table for dinner Friday at 7pm": the right card in 3 of 3, each on the first call.
- "what's the weather tomorrow?": off-topic, then asked again, in 2 of 2. The second answer was a question both times: "What time tomorrow would you like to be reminded to check the weather?" No card, and no "didn't understand" examples.

**Your decision on the weather question.** The retry's wording stays. A question offering a reminder is fine: it's friendly, and Ask is a reminder app. The test sentence is marked `orOffersReminder`. Its live test accepts either "didn't understand" or a question that mentions a reminder, as long as no card is proposed. The API test still sends the "didn't understand" answer twice. This wasn't checked live again.

### Step 7: the dashed "not saved" card
- **When it shows.** While a create or change card waits for your OK, and while it saves after your yes, the week shows a white card with a 2px dashed border and words in the category's ink, at its date and time, reading "18:00 · not saved" in your clock's format.
  - A work card's ink is white, so on white its border and words take the accent, and its icon tile is the accent with a white icon.
  - It takes a lane like any card, after cards at the same time. On a phone it sits in the day's list in time order.
  - For a change, the original card fades to half strength in 150ms.
  - Nothing shows for cancel or restore, for a date outside this week, or once the bar is closed or back at its list.
- **How it's wired.**
  - `useAgent` reports the `proposal`: the card waiting, or the one saving after your yes, with the reminder a change `replaces`.
  - `CommandBar` passes it on (`onProposal`) only while its conversation is open, and says when it opens and closes (`onOpenChange`).
  - The page turns it into the week's `Dashed` card (`dashedFor` in `app/page.tsx`) and the hint line's words (`dashedHint`).
  - In `Week`, the dashed card is an `li` with `aria-hidden`, no tab stop and no pointer events. It isn't one of the transfer's cards, so it can't be dragged.
- **Scrolling.** If the dashed card is off screen or under the docked bar, the page scrolls just far enough to leave it 12px clear, smoothly, or at once under reduced motion. When it becomes a card, the bar grows by its "Saved" line, so the new card is kept clear again.
  - A late card may have no page left below it to scroll into. While the bar is open, the week adds room under itself, as tall as the bar (`data-room`), and drops it when the bar closes.
- **Hint line.** "↵ save · esc don't save · the dashed card on Friday shows where it will go", or "the dashed card today…".
- **On yes.** The dashed card stays while the server saves. When the saved reminder arrives at that day and time, the real card takes the dashed card's place. A copy of the dashed face lies over it and fades out over 200ms ease-out, so the dashed border reads as filling to solid. Agent saves don't fly.
- **On no.** It fades out over 150ms, and a changed card's original comes back to full strength.
- **Reduced motion.** Both happen at once.
- **Form saves** keep their flight from the bar into the slot.
- **The new card's ring.** The highlighter on a new card's title is gone. The newest card has an accent ring instead, 1px clear of it so it shows on a work card too, and it stays. The flying copy doesn't carry it. A save from a conversation with no dashed card, like one that finishes after the bar closed, fades in as before (`playFadeIn`).
- **Tests** (`e2e/dashed-card.spec.ts`, 15):
  - its day, place at 18:00, words, dashed border in the category's ink, white background, and the hint;
  - hidden from screen readers, no tab stop, no pointer events, and not a card of the day;
  - Esc: one 150ms opacity fade, and the week as it was;
  - Enter: it stays while saving, then the card takes exactly its place, with one 200ms opacity fill and no flight;
  - the accent ring on the new card only;
  - a change: the original at half strength, the dashed card at the new place, back to full on no; on yes the card moves into the dashed card's place at full strength;
  - cancel, and a day outside this week, show none and no hint;
  - closing the bar takes it away;
  - under the bar it scrolls to 12px clear, and the saved card stays clear; one already in view doesn't scroll;
  - on a phone, its place in the day's list;
  - reduced motion, for yes and for no;
  - only transform and opacity animate, from asking to saving.
- **Other tests.**
  - `e2e/contrast.spec.ts` measures the dashed card and a dashed swatch for every category, light and dark.
  - `e2e/save-flight.spec.ts` checks the ring instead of the highlighter, and that only transform and opacity animate.
  - `e2e/agent.spec.ts` checks the ring on an agent save.
- **Breaks, each caught.**
  | Break | Caught by |
  | --- | --- |
  | No fade on no | Esc |
  | No fill on yes | Enter, and only transform and opacity |
  | No scroll | under the bar |
  | The original card not dimmed | a change |
  | Heard by screen readers, reachable by the pointer | hidden from screen readers |
  | A dashed card for a cancel | cancel and outside the week |
  | Still shown after the bar closes | closing the bar |
  | Reduced motion ignored | both reduced-motion tests |
  | The fill animating clip-path | only transform and opacity, and Enter |

---

## Next

### Step 8b: notes, and editing a card in the New reminder form
**Why.** Reminders already have a `description` in the data, the API (POST and PATCH, up to 2,000 characters) and the agent (`createReminderInput.description`). But the form can't set it, and the week never shows it. Editing a card needs the same form, so both go in one step.

**Already there.**
- The bar's preview card shows the note under the date and time (`Details` in `conversation.tsx`). Only a test is added.
- The AI can already add a note through `description`, which `planCreate` saves. `lib/agent-actions.ts` doesn't change: line 38 stays as it is.

**What.**
- **Note field.** An optional multi-line "Note" after Category in the form, sent as `description`.
- **Cards.**
  - In the phone's day list, a one-line note under the time, cut off with "…".
  - In the grid, where a card is 44px tall, a small note icon after the time instead. Hovering the icon shows the note.
  - The card's name ends with ", note: <full note>".
- **Edit a card.**
  - A click, or Enter on a focused card, opens it in the same form. The form is filled in with title, date, time, category and note, and its button reads "Save changes".
  - Space alone picks a card up. While one is picked up, Enter still drops it.
  - A drag still moves the card: UI SDK swallows the click after a drag.
  - Sent, failed and still-saving cards don't open.
  - The saved category counts as already picked, so editing the title never re-guesses it: "Buy milk" saved as food stays food.
  - Save changes sends a PATCH. The card updates in place or moves to its new day, and gets the accent ring. The status line says "Changed X, now …". No flight.
  - Esc closes the bar, and focus goes back to the card.

**Tests**, browser only, with fakes:
- the note in the form's request;
- the card's line on a phone, its icon and the icon's hover text in the grid, and the note in the card's name;
- the agent card's note;
- a click opens the card filled in, and Save changes sends a PATCH;
- Enter opens a card, and Space still picks it up;
- a drag moves a card without opening it;
- a sent card doesn't open;
- the category stays when the title is edited.

**Breaks, each caught.**
1. Enter picks the card up instead of opening it: the Enter test.
2. Opening on pointer up, so the form opens after a drag: the drag test.
3. The note left out of the request: the note test, and the edit test.

**As built.**
- The note is UI SDK's `Textarea` with `autoResize`. Enter in it starts a new line; Enter in the title still saves.
- An edit sends the time only when it changed: the server turns down any time that has passed, even an unchanged one.
- Tests are in `e2e/notes.spec.ts` (9). The form's Tab test now passes through Note. `fakeMove` records every field a PATCH sends.

### Step 9: tidy up, before launch (Thursday 26 November)
- **Leftovers.**
  - Remove what the old Index card look left behind, like `--veil`, which is unused since step 6.
  - The week's cards lost their highlighter in step 7. The highlighter stays on the status line, on the bar's card title, the chosen row in the bar, and the form's date and time fields, so `--marker` and the `highlighter` utility stay.
- **CLAUDE.md.** Update the week notes for the grid, lanes and phone list, the dashed card, and the newest card's ring.
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

### Step 10: the Chrome extension that breaks drag and Ask
**What you found on 24 November.** On localhost in your usual Chrome, desktop width:
- dragging a card with the mouse didn't move it;
- asking the bar to create a reminder stayed on "Thinking…" and never showed a card.

Both work in an Incognito window, where extensions are off, so one of your extensions is the cause, not Ask.

**What's known.**
- In a clean Chromium on the same dev server, with faked routes and no Groq calls, a mouse drag moves the card and saves it. That held for a quick drag, a slow one, after opening and closing the bar, and after a save from the form. The browser tests pass too.
- The dev log (`.next/dev/logs/next-development.log`) shows extensions editing the page on load: `bis_skin_checked` and `bis_register` attributes, `data-cap-chrome-extension-installed` on `<html>`, and a `__processed_…__` attribute on `<body>`.

**To do.**
- **Find the extension.** Turn extensions on one at a time in a fresh profile, or in Incognito with "Allow in Incognito", until drag or the bar breaks.
- **See how it breaks them.** Some guesses to check first:
  - an extension that calls `preventDefault()` on `pointerdown`: UI SDK's drag ignores a press that's already been prevented;
  - one that starts its own drag or text selection, which cancels the pointer (`pointercancel`);
  - one that wraps `fetch`, so the reply's stream never reaches the bar as it arrives.
- **Decide whether Ask can guard against it.** For example, a timeout that turns a reply with no news into the "Ask couldn't get an answer" message instead of "Thinking…" forever. Or a note in the bar when a drag is cancelled by something outside Ask. Other visitors will have the same extension.

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
| Step 6b: "book flights" ×3, "Book a table…" ×3, "what's the weather tomorrow?" ×2, cap 16 | 11 | All 6 cards right. Flights was off-topic once, asked again, then its card. The weather was asked again both times and became a question, "What time tomorrow would you like to be reminded to check the weather?", not a card |

Tokens per call are now about 1,435 in and up to about 300 out. All 42 test sentences take about 63 calls since step 6b ("what's the weather tomorrow?" is asked again), about half of Groq's free day, which the live site shares.

## Open questions

- **The bottom sheet on a real phone.** See step 9.
