# CLAUDE.md

## Purpose

- This is a throwaway test app, not a product. It exists to prove the hosting, login,
  secrets and email setup for a separate product, a multi-tenant distributor ordering
  portal, before that product is built.
- Lessons from this test are recorded in the product repository
  (`stellara-ai/distributor-order-portal`, under `docs/`), not here.
- One exception: `docs/stack-notes.md` in this repository collects what has been proven
  about the whole pattern (Votel hosting, Supabase backend, sign-in email, access
  control). It is the source for a reusable skill that will later move to
  `stellara-ai/stellara-skills`. Update it in place whenever a check passes or fails or
  a guess is settled.

## What is being tested

- **Stage one, hosting:** a Vue app served as static files on Votel, on a custom
  subdomain, with history-mode deep links, a public build-time variable, and a second
  subdomain on the same app.
- **Stage two, platform:** Supabase sign-in by emailed code, an Edge Function that reads
  a secret without exposing it, a table protected by row-level security, and sign-in
  email sent through Votel using Supabase's Send Email hook.
- **Current state: stage one is implemented and passed. Stage two is built and deployed
  to Supabase, and eight of its ten checks have passed (see below).** Stage one is a weather lookup
  (Open-Meteo, no API key) with routes `/`, `/saved`, `/city/:name` and a not-found
  page. Stage two adds `/sign-in`, a guarded `/account`, `src/services/backend.ts`
  (the only file that talks to Supabase) and the `supabase/` folder (one migration,
  two Edge Functions).

## Stack

Vue 3 with `<script setup>`, TypeScript strict, Vite, Vue Router in history mode, Pinia,
Tailwind CSS. Versions from `package.json`: vue `^3.5.42`, vue-router `^5.3.1`, pinia
`^4.0.3`, vite `^8.2.2`, tailwindcss and @tailwindcss/vite `^4.3.5`, typescript `~6.0.0`,
vue-tsc `^3.3.11`, vitest `^4.1.11`, eslint `^10.10.0`. Node `^22.18.0 || >=24.12.0`.
Stage two adds @supabase/supabase-js `^2.119.0`, the Supabase CLI (`supabase` `^3.1.0`,
dev only) and, inside the `send-email` function only, `npm:standardwebhooks@1`.

## How it is built and deployed

| Install | Dev | Test | Lint | Type check | Build |
| --- | --- | --- | --- | --- | --- |
| `npm install` | `npm run dev` | `npm test` | `npm run lint` | `npm run type-check` | `npm run build` |

- Votel is used for hosting only. The entire app is written, tested and built from this
  repository; Votel's assistant does not write or change app code.
- Only the build output in `dist` is deployed. Source stays in GitHub. Code flows one
  way, from GitHub to the host.
- Publishing to Votel is a manual step by the owner. Stage one was published by Votel's
  Web App import (clone, build, publish). Uploading an already-built `dist` to a Votel
  Website is documented but has not been run.
- Values with a `VITE_` prefix are public and fixed at build time. On Votel they are set
  as "Public" environment variables, never "Secret". The only one today is
  `VITE_APP_LABEL`, shown in the footer.

## Rules

- Keep it minimal. Do not add features beyond what a test stage needs.
- No secrets in the repository or in any `VITE_` variable.
- Fetch current documentation before writing code against Vue tooling, Supabase or
  Votel. Do not rely on memory.
- Ask before adding a dependency.
- Do not let any hosting platform's assistant or sync commit to this repository.
- Report each test check as pass, fail or not applicable, and only after actually
  running it.

## Results so far

Stage one hosting checks. All six passed, as reported by the owner on 2026-11-15, on the
Votel Web App at `weather-test.stellarasystems.com`:

- [x] The home page loads on a phone
- [x] Opening `/city/miami` directly works
- [x] Refreshing `/city/miami` works
- [x] `VITE_APP_LABEL` shows in the footer
- [x] A custom subdomain works over HTTPS
- [x] A second subdomain pointing at the same site works

## Stage two plan

**Status: built and deployed; eight of ten checks passed as of 2026-11-16.** The `notes`
migration is applied, `secret-check` and `send-email` are deployed, the Send Email hook
is enabled and the secrets are set. The stage two app has only been run on the local dev
server, not yet published to Votel.

**Goal:** prove Supabase login, secrets, data security and sign-in email, on top of the
stage one app, using a free Supabase project.

**What gets built**

- Sign-in by emailed one-time code. Session persists across refresh. Sign-out.
- A guarded `/account` route and a Pinia auth store.
- Edge Function `secret-check`: signed-in callers only; reads the secret `TEST_SECRET`;
  returns only `{ found, length }`, never the value.
- A `notes` table with row-level security so each user sees only their own rows.
- Sign-in email through Votel:
  - an `EmailSender` interface so the provider can be swapped in one file
  - a Votel adapter calling `POST {VOTEL_API_HOST}/api/emails/test` with an `X-API-Key`
    header and the whole email as raw content (see `docs/stack-notes.md` for why)
  - an Edge Function `send-email` for Supabase's Send Email hook that verifies the hook
    signature before sending

**Supabase project settings (as set by the owner)**

- "Automatically expose new tables" is off: new tables in `public` get no `select`,
  `insert`, `update` or `delete` grants for `anon`, `authenticated` or `service_role`,
  so the Data API cannot reach a table until it is granted explicitly. A missing grant
  shows up as error `42501`.
- "Enable automatic RLS" is on: an event trigger enables row-level security on every
  new table in `public`. A table with RLS and no policies returns no rows.
- So the `notes` migration must carry everything itself: `enable row level security`
  stated anyway (do not depend on the trigger), `grant select, insert, delete` to
  `authenticated` only (nothing to `anon`; no update, because the app never edits a
  note), and per-user policies on `auth.uid()`.
- Re-check the current Supabase docs for both settings before writing the migration
  (checked 2026-11-15: "Securing your API" and "Event triggers" guides).

**Where values live**

- Browser-safe, as public build-time variables: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Supabase secrets only, never in the repository or the Vue app: `TEST_SECRET`,
  `VOTEL_API_HOST`, `VOTEL_API_KEY`, `VOTEL_FROM_EMAIL`, `VOTEL_FROM_NAME`, `SEND_EMAIL_HOOK_SECRET`.
- Never log a sign-in code or any secret value.

**Stage two checks**

- [x] Sign in, refresh, still signed in; sign out works (owner, local dev server, 2026-11-16)
- [x] `secret-check` returns found when signed in, and is refused when signed out (2026-11-16)
- [x] A second user cannot see the first user's notes (owner, second account saw no notes, 2026-11-16)
- [x] The `TEST_SECRET` value appears nowhere in the build output (2026-11-16)
- [x] A code arrives at an address that is not a Supabase team member (2026-11-15)
- [ ] Arrival time measured on five attempts
- [x] A code arrives at an address that is not a Votel contact (2026-11-16)
- [ ] A code arrives for a Votel contact who unsubscribed from marketing email
- [ ] A wrong Votel API key gives a clear failure, logged without secrets
- [x] A request to `send-email` without a valid hook signature is rejected (2026-11-15)

**Known facts to respect**

- Supabase's built-in email only delivers to the organization's team members, so custom
  sending is required for real users.
- Do not change the Supabase project without my confirmation.
