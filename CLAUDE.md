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
- **Stage three, core workflow (not started):** the same app published on Votel, tenant
  isolation with invite-only access, tenant branding, and one document flow for a single
  client (LAMO Distributor): order to invoice to delivery confirmation with a signature,
  to PDF. See "Stage three plan".
- **Stage two, platform:** Supabase sign-in by emailed code, an Edge Function that reads
  a secret without exposing it, a table protected by row-level security, and sign-in
  email sent through Votel using Supabase's Send Email hook.
- **Current state: stage one is implemented and passed. Stage two is built and deployed
  to Supabase, and nine of its ten checks have passed (see below).** Stage one is a weather lookup
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

**Status: built and deployed; nine of ten checks passed as of 2026-11-16.** The `notes`
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
- [x] Arrival time measured on five attempts (owner-reported pass, 2026-11-16; timings not recorded here)
- [x] A code arrives at an address that is not a Votel contact (2026-11-16)
- [x] A code arrives for a Votel contact who unsubscribed from marketing email (2026-11-16)
- [ ] A wrong Votel API key gives a clear failure, logged without secrets
- [x] A request to `send-email` without a valid hook signature is rejected (2026-11-15)

**Open items**

- Votel support: emailed by the owner on 2026-11-15, no answer yet. Questions: why
  template variables do not render on `/api/emails/send`; whether `/api/emails/test` is
  supported for production; where delivery status for those sends can be seen; whether
  open tracking can be turned off; whether a send-only key role exists.
- The wrong-API-key check has not been run.
- Stage two is not yet published to Votel. `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` were added to the Web App as Public variables on
  2026-11-16; pulling the stage two code, rebuilding and publishing is still to do.
- Decide between Votel's test endpoint and a transactional provider (Resend) for the
  product's sign-in email once Votel support answers.

**Known facts to respect**

- Supabase's built-in email only delivers to the organization's team members, so custom
  sending is required for real users.
- Do not change the Supabase project without my confirmation.

## Stage three plan

**Status: not started.** Agreed with the owner on 2026-11-16. This is still a proof of
concept: each part exists to prove a mechanism the product depends on, in its simplest
form, for one client (LAMO Distributor). It is not the product's invoicing module.

**Goal:** prove that the stack can carry the product's core workflow: several tenants
kept apart, only invited people getting in, and an order becoming an invoice, a delivery
confirmation with a signature, and a PDF.

**Part A: published on Votel**

- Pull the stage two and three code into the Votel Web App, rebuild and publish.
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are already set there as Public.
- Repeat the sign-in, secret-check and notes checks on `weather-test.stellarasystems.com`
  and on the second subdomain.

**Part B: tenants, invitations and branding**

- A `tenants` table and a `memberships` table (user, tenant, role). Every tenant-owned
  table carries a tenant id, and its row-level security is written against membership.
- Invite-only: sign-ups off in Supabase, codes requested with `shouldCreateUser: false`,
  users created by invitation. The sign-in form answers the same way for any address.
- Branding per tenant, kept deliberately small: a logo or word mark (an image in Supabase
  Storage), a primary colour and an accent colour for buttons and links. Applied through
  CSS variables. No themes, fonts or layout options.

**Part C: one document flow**

- Seeded orders with line items for LAMO. No order-entry screen.
- An invoice is created from an order and filled in automatically, then can be edited by
  hand on the web page (quantities, prices, a note) before it is finalised. One layout.
- Delivery confirmation on a phone: a checklist with one line per item on the delivery,
  each ticked as received, then the customer signs on the screen. The signature image is
  saved to Supabase Storage under access rules.
- An Edge Function generates a PDF of the invoice with the tenant's logo, the line items
  and the signature, stores it, and returns a short-lived link to download it.

**Part D: printing (a separate trial, not built into this app unless agreed)**

- Requirement from the owner: print from the web app to a local printer automatically,
  two copies.
- Facts from the owner (2026-11-16): an ordinary office laser or inkjet printer,
  letter-size invoices; a computer beside it stays on; the two copies are one for the
  business and one for the client, so the PDF is produced as two labelled copies
  ("Business copy", "Client copy").
- LAMO's logo and brand colours are not in hand yet; the owner will supply them. Until
  then the test tenant uses a placeholder word mark and two placeholder colours.
- Planned approach: server-triggered printing through a cloud print service with an
  agent on a computer beside the printer, behind a `PrintProvider` interface, fed from a
  `print_jobs` queue table. To be tried with the real printer before it is designed in.

**Out of scope for stage three**

- More than one invoice layout, taxes and payments, QuickBooks, the Votel contact sync,
  order entry, speech-to-text, passkeys.

**Stage three checks**

- [ ] The published app signs a user in on both subdomains
- [ ] `secret-check` and notes work from the published app
- [ ] A user in tenant A cannot read or change tenant B's orders, invoices or files
- [ ] A user with no membership sees nothing
- [ ] An address that was never invited gets no account and no code
- [ ] The sign-in form gives the same answer for invited and uninvited addresses
- [ ] A tenant's logo and two colours appear in the app and on the PDF
- [ ] An invoice is filled in from an order, edited by hand, and the edit is kept
- [ ] A delivery is confirmed item by item and signed on a phone
- [ ] The signature file cannot be read by another tenant or when signed out
- [ ] The PDF is generated by an Edge Function within its limits and downloads correctly
- [ ] A finalised invoice cannot be edited

**Dependencies stage three will need (ask before adding each)**

- A pure-JavaScript PDF library for the Edge Function. Edge Functions do not support
  libraries that need native code or multithreading.
- Possibly none for the signature pad; it can be written against the browser canvas.

