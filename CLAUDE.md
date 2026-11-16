# CLAUDE.md

## Purpose

- This is a throwaway test app, not a product. It exists to prove the hosting, login,
  secrets and email setup for a separate product, a multi-tenant distributor ordering
  portal, before that product is built.
- Lessons from this test are recorded in the product repository
  (`stellara-ai/distributor-order-portal`, under `docs/`), not here.

## What is being tested

- **Stage one, hosting:** a Vue app served as static files on Votel, on a custom
  subdomain, with history-mode deep links, a public build-time variable, and a second
  subdomain on the same app.
- **Stage two, platform:** Supabase sign-in by emailed code, an Edge Function that reads
  a secret without exposing it, a table protected by row-level security, and sign-in
  email sent through Votel using Supabase's Send Email hook.
- **Current state: the code implements stage one only.** It is a weather lookup
  (Open-Meteo, no API key) with routes `/`, `/saved`, `/city/:name` and a not-found page.
  There is no Supabase code, no auth and no backend.

## Stack

Vue 3 with `<script setup>`, TypeScript strict, Vite, Vue Router in history mode, Pinia,
Tailwind CSS. Versions from `package.json`: vue `^3.5.42`, vue-router `^5.3.1`, pinia
`^4.0.3`, vite `^8.2.2`, tailwindcss and @tailwindcss/vite `^4.3.5`, typescript `~6.0.0`,
vue-tsc `^3.3.11`, vitest `^4.1.11`, eslint `^10.10.0`. Node `^22.18.0 || >=24.12.0`.

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

**Status: not yet started.** Nothing below exists in the code.

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
  - a Votel adapter calling `POST {VOTEL_API_HOST}/api/emails/send` with an `X-API-Key`
    header and a body of `template_key`, `recipient.email` and `variables.code`
  - an Edge Function `send-email` for Supabase's Send Email hook that verifies the hook
    signature before sending

**Where values live**

- Browser-safe, as public build-time variables: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Supabase secrets only, never in the repository or the Vue app: `TEST_SECRET`,
  `VOTEL_API_HOST`, `VOTEL_API_KEY`, `VOTEL_OTP_TEMPLATE_KEY`, `SEND_EMAIL_HOOK_SECRET`.
- Never log a sign-in code or any secret value.

**Stage two checks**

- [ ] Sign in, refresh, still signed in; sign out works
- [ ] `secret-check` returns found when signed in, and is refused when signed out
- [ ] A second user cannot see the first user's notes
- [ ] The `TEST_SECRET` value appears nowhere in the build output
- [ ] A code arrives at an address that is not a Supabase team member
- [ ] Arrival time measured on five attempts
- [ ] A code arrives at an address that is not a Votel contact
- [ ] A code arrives for a Votel contact who unsubscribed from marketing email
- [ ] A wrong Votel API key gives a clear failure, logged without secrets
- [ ] A request to `send-email` without a valid hook signature is rejected

**Known facts to respect**

- Supabase's built-in email only delivers to the organization's team members, so custom
  sending is required for real users.
- Do not change the Supabase project without my confirmation.
