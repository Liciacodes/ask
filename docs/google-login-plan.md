# Google login for Ask

## Context
Today each browser is an anonymous visitor (random id in an httpOnly cookie, `lib/visitor.ts`, `proxy.ts`), and every reminder's `user_id` is that visitor id. Login is optional: guests keep working as now; signing in with Google keeps reminders across devices and later unlocks email reminders. When a guest signs in, their reminders move to their account. Scopes `openid email profile` only.

## Where it stands
Built on branch `google-login`, waiting for your review. The migration `20261125120000_add_users_and_sessions` is applied to the test database and the dev branch (not main).

One change from the plan: the browser tests' server uses `.env.local`'s database, so the whole sign-in trip (fake Google, callback, reminders moving, sign-out) is tested in Vitest against the test database, talking over HTTP to `scripts/fake-google.mjs`. The browser tests cover the header and fake `/api/auth/me`.

## Library: Arctic (`arctic`, pinned exact) plus our own sessions
- Arctic is a small OAuth 2.0 client: PKCE, state, code exchange, ID token decoding. Nothing else.
- Why not Auth.js or Better Auth: both bring their own user, account, session and verification tables, cookies and catch-all routes, alongside our visitor cookie. Auth.js v5 is still a beta. We only need one provider and one session cookie, and they should work like `lib/visitor.ts`.
- Arctic's generic `OAuth2Client` takes the authorize and token URLs as arguments, so tests can point them at a fake Google.
- The ID token comes straight from Google's token endpoint over TLS, so it's decoded, not signature-checked. Google allows that for a token taken directly from the token endpoint.
- Its claims are still checked, and the sign-in is refused (`/?signin=failed`) unless all hold:
  - `aud` is `AUTH_GOOGLE_ID`;
  - `iss` is `accounts.google.com` or `https://accounts.google.com`;
  - `exp` is in the future;
  - `email_verified` is true.
  The fake Google mints tokens with the same `iss` and the fake client id as `aud`.

## Database (one new migration, applied to test and dev only)
```sql
CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "google_sub" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "picture" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,              -- SHA-256 of the cookie's token, never the token itself
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
- `reminders.user_id` is unchanged. It holds a visitor id for a guest or a `users.id` for an account. Both are random v4 UUIDs.
- `daily_usage.subject` is the user's id when signed in, the visitor's otherwise.
- The SQL is produced with `prisma migrate diff`. If it differs from the above, it's shown again before it's applied.
- Dev is applied only after checking `.env.local` by endpoint (never main).

## Server
- `lib/session.ts`
  - session cookie `__Host-ask-session` / `ask-session`: httpOnly, SameSite=Lax, 30 days, shaped like `visitorCookie`;
  - a random 32-byte token, stored as SHA-256 in `sessions`;
  - `ownerFrom(request)`: async. It returns the signed-in user's id when the cookie names a live session, the visitor id otherwise, or null.
- `lib/google.ts`
  - Arctic client, scopes, and the endpoints (Google's by default; `GOOGLE_AUTH_URL` / `GOOGLE_TOKEN_URL` override them for tests);
  - it refuses Google's real URLs inside Vitest or the browser-test server (`ASK_FAKE_GOOGLE=1`), like `agentModel()` does for Groq.
- Routes (under `/api`, so `proxy.ts` has already given the visitor id):
  - `GET /api/auth/signin/google`: state and PKCE verifier in 10-minute httpOnly cookies, then a redirect to Google. The redirect URI is `${origin}/api/auth/callback/google`.
  - `GET /api/auth/callback/google`:
    - checks state and swaps the code;
    - upserts the user by `sub`;
    - in one transaction, moves the visitor's reminders (`updateMany user_id = visitor → user.id`) and creates the session;
    - sets the cookie, clears the state cookies and redirects to `/`. Any failure redirects to `/?signin=failed`.
  - `POST /api/auth/signout`: deletes the session and clears the cookie.
  - `GET /api/auth/me`: `{ user: { name, email, picture } | null }`.
- The reminder, week and agent routes: `visitorFrom` → `await ownerFrom`, with the same `noVisitor()` refusal. `lib/visitor.ts` stays as the guest half.

## UI (Colourful week look)
- Header, right of the Ask trigger: the page stays static and fetches `/api/auth/me`.
  - Guest: a "Sign in with Google" link to `/api/auth/signin/google`.
  - Signed in: avatar or initial, name, and a "Sign out" button (POST, then reload the week).
- `?signin=failed` shows a short status line ("Couldn't sign in with Google. Try again.") and is removed from the URL.
- Contrast is checked by `e2e/contrast.spec.ts` for the new elements, light and dark.

## Guest move-over
- On sign-in, all of this browser's guest reminders become the account's. The visitor cookie stays.
- After sign-out, the browser is a guest again with an empty week. The reminders are in the account.
- Signing in on a second device also moves that device's guest reminders in.

## Tests (fake Google only)
- **Vitest** (`tests/api/auth.test.ts`), with fake token responses through a stubbed `fetch`:
  - a guest with reminders signs in: the reminders move, the cookie is set, and `/api/reminders` returns them with the session;
  - a second visitor is untouched;
  - a bad or missing state is refused;
  - an ID token with `email_verified: false`, the wrong `aud`, the wrong `iss`, or a past `exp` is refused, and nothing moves;
  - sign-out ends the session;
  - an expired session falls back to the visitor;
  - the Google URL guard refuses the real endpoints.
- **Playwright**:
  - `e2e/fake-google.mjs`, a second `webServer` on port 3300 with `/authorize` (redirects back with a code) and `/token` (returns an unsigned id_token);
  - `playwright.config.ts` sets the fake URLs, fake `AUTH_GOOGLE_ID`/`SECRET` (so `.env.local`'s real ones are never loaded) and `ASK_FAKE_GOOGLE=1`;
  - `e2e/google-login.spec.ts`: sign in from the header, see the name, the guest card is still there, sign out.
- CI: the same env in `.github/workflows/ci.yml` if needed.
- Deliberate breaks:
  - skip the move: the test fails;
  - skip the state check: the test fails.

## What you must do yourself
1. Done already: redirect URIs in Google Cloud, with you as a test user. The live site is `ask-pi-pearl.vercel.app`. While the consent screen is in "Testing", only listed test users can sign in.
2. Vercel: set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` for Production.
3. Before deploying: `prisma migrate deploy` on main (yourself).
4. Try a real sign-in on your dev server at localhost:3000 (I never touch it).

## Verification
lint, typecheck, `npm run test:api` (PowerShell, after `npm run db:migrate:test`), and `npm run test:e2e` twice.
