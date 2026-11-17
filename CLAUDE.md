@AGENTS.md

# Ask

A command bar assistant. Today: the command bar, and reminders created from it and saved in Postgres. No AI yet.

## How to work here

- **Explain first.** Before building something important, explain the idea in plain words: what it is, why it's needed, how it works. Then build it.
- **One small step at a time.** Finish one step, check it works, then start the next. Don't bundle unrelated changes.
- **API keys only in `.env.local`.** Never in code, config, commits or chat. `.env*` is gitignored; keep it that way.
- **Database: Postgres on Neon, through Prisma** (`prisma/schema.prisma`). Never edit a migration that has run; add a new one. The real database only gets `prisma migrate deploy`. Anything that empties tables runs through `scripts/with-test-db.mjs`, which points it at `TEST_DATABASE_URL` and refuses if that is the real database.
- **Commit messages describe the change.** Never "Day N" or other progress counters.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS 4. See AGENTS.md: read `node_modules/next/dist/docs/` before writing Next.js code.
- UI SDK (`@ui-sdk/react`, `@ui-sdk/core`), in beta and pinned to an exact version. Before using it, follow the `ui-sdk` skill (`.claude/skills/ui-sdk`) and read `node_modules/@ui-sdk/react/docs/llms.txt`. For our own primitives, search `docs/core.md` by heading and read `docs/rendering.md`.
- Build UI from UI SDK **behaviors** in `@ui-sdk/core` (`definePrimitive`, `createPopup`, `createListbox`, …), not from ready-made component libraries.

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
- `npm run test:e2e`: Playwright browser tests in `e2e/` (Chromium). Reuses a running dev server, or starts one. First time: `npx playwright install chromium`

CI (`.github/workflows/ci.yml`) runs three jobs on every push: lint and typecheck; the API tests against a throwaway Postgres 18 container; and the browser tests against a production build.
