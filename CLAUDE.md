@AGENTS.md

# Ask

A command bar assistant. Today: the command bar, reminders created from it and saved in Postgres, and an agent in the bar: type a sentence no command matches, Ask it, and approve each action on a preview card.

## How to work here

- **Explain first.** Before building something important, explain the idea in plain words: what it is, why it's needed, how it works. Then build it.
- **One small step at a time.** Finish one step, check it works, then start the next. Don't bundle unrelated changes.
- **API keys only in `.env.local`.** Never in code, config, commits or chat. `.env*` is gitignored; keep it that way.
- **Database: Postgres on Neon, through Prisma** (`prisma/schema.prisma`). Never edit a migration that has run; add a new one. The real database only gets `prisma migrate deploy`. Anything that empties tables runs through `scripts/with-test-db.mjs`, which points it at `TEST_DATABASE_URL` and refuses if that is the real database.
- **Every visitor's reminders are their own.** There are no accounts yet: `proxy.ts` gives each visitor a random id in an httpOnly cookie (on `/api/*` only, so the page stays static), and every route starts with `visitorFrom(request)` from `lib/visitor.ts`, refusing with `noVisitor()` when it's missing. Every query filters by that id. A new route that reads or changes reminders must do the same. API tests act as `TEST_VISITOR` (`tests/api/helpers.ts`).
- **The agent never acts without an OK.** Every tool that changes something has an approval in `toolApproval` (`lib/agent/agent.ts`), and only read-only tools skip it. There is no permanent delete for the agent; cancel can be undone.
- **Every model call counts against a daily limit.** The agent route wraps the model in `countedModel` (`lib/agent/limits.ts`), which takes one of the site's calls for the day before each call to Groq. A new question first takes one of the visitor's questions (`takeQuestion`); answering a preview card isn't a new question. The limits are `ASK_VISITOR_QUESTIONS_PER_DAY` and `ASK_SITE_GROQ_CALLS_PER_DAY` (10 and 60 when empty), counted per UTC day in `daily_usage`. Anything new that calls a model must go through `countedModel`. What the bar says when a reply stops for lack of room is in `lib/agent/problems.ts`, shared by the server and the bar.
- **Real model calls only when the user says so.** Tests use a fake model (`MockLanguageModelV4` from `ai/test`) and never reach Groq.
- **`lib/agent-actions.ts` (the tools' zod schemas) is the user's.** Review it and point out problems; don't edit it.
- **Commit messages describe the change.** Never "Day N" or other progress counters.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS 4. See AGENTS.md: read `node_modules/next/dist/docs/` before writing Next.js code.
- UI SDK (`@ui-sdk/react`, `@ui-sdk/core`), in beta and pinned to an exact version. Before using it, follow the `ui-sdk` skill (`.claude/skills/ui-sdk`) and read `node_modules/@ui-sdk/react/docs/llms.txt`. For our own primitives, search `docs/core.md` by heading and read `docs/rendering.md`.
- Build UI from UI SDK **behaviors** in `@ui-sdk/core` (`definePrimitive`, `createPopup`, `createListbox`, …), not from ready-made component libraries.
- AI: Vercel AI SDK 7 (`ai`, `@ai-sdk/groq`, `@ai-sdk/react`), pinned to exact versions. The bar's `useChat` settings live in `lib/agent/client.ts`, shared with the API tests, and the browser tests fake `/api/agent` with `e2e/fake-agent.ts`, in the route's own stream format. Read `node_modules/ai/docs/` before writing AI SDK code: APIs have changed (`toolApproval`, `isStepCount`, `instructions`). The model is Groq's `openai/gpt-oss-120b`, set in `lib/agent/model.ts`, the one line to change to swap providers. It reads `GROQ_API_KEY`, on the server only. The model works in local dates and times; the server converts them (`lib/time.ts`) and checks every action with the API's own schemas (`lib/agent/plans.ts`).

## Design rules

- Keyboard-first, fast, and beautiful. Not a generic AI dashboard.
- Visual direction: **Index card**. A white card on a cool desk, navy ink, faint ruled lines, a red line under the search, Atkinson Hyperlegible Next. The chosen row gets a light tint across the whole row plus a highlighter stroke on its words. Colour tokens live in `app/globals.css`, with a dark variant.
- The command bar opens and closes with **no animation**: people do it many times a day.
- All other motion follows Emil Kowalski's rules (the `emil-design-eng` skill).

## Commands

- `npm run dev`: start the app at http://localhost:3000
- `npm run lint`: ESLint
- `npm run typecheck`: generate Next route types, then `tsc --noEmit`
- `npm run db:migrate`: apply migrations to the real database (`DATABASE_URL`). `npm run db:migrate:test`: the same for the test database (`TEST_DATABASE_URL`)
- `npm run test:api`: Vitest tests in `tests/`, calling the API route handlers against the test database. Run `npm run db:migrate:test` first whenever a migration is added. From Windows, run it in PowerShell: Git Bash hands Node a lowercase drive letter and Vitest then loads twice
- `npm run test:live`: real Groq calls on the sentences in `tests/date-cases.ts` (`tests/live/`, at most 2 calls each). Only when the user says so; never in CI
- `npm run test:e2e`: Playwright browser tests in `e2e/` (Chromium). Reuses a running dev server, or starts one. First time: `npx playwright install chromium`

CI (`.github/workflows/ci.yml`) runs three jobs on every push: lint and typecheck; the API tests against a throwaway Postgres 18 container; and the browser tests against a production build.
