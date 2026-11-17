# Stack notes: Vue app on Votel hosting with a Supabase backend

Working notes from the `hosting-test-weather` test app. They are the raw material for a
reusable skill that will live in `stellara-ai/stellara-skills`. The skill is to be written
once the test app is hardened; until then this file is updated in place as things are
proven or disproven.

Last updated: 2026-11-16. Stage one (hosting) is complete. Stage two (sign-in, secrets,
data security, email) is built and deployed; nine of its ten checks have passed. The wrong-API-key check is the one not yet run.
Stage two was published to the Votel Web App on 2026-11-16 and the first two stage three
checks (the published app) have passed.

## How to read the status labels

| Status | Meaning |
|---|---|
| **Proven** | Tested on a real deployment, result recorded here |
| **Documented** | Confirmed in the vendor's current docs, not yet tested by us |
| **Chosen** | Decided for good reasons, not yet tested or confirmed |
| **Open** | Not decided or not yet known |

Never promote a row to Proven from a vendor's or an assistant's claim alone.

## The pattern in one paragraph

A Vue 3 single-page app is built to static files and hosted on Votel. Everything with
state or secrets lives in Supabase: Postgres with row-level security, Auth with emailed
one-time codes, and Edge Functions. Sign-in email is sent through Votel's email API from a
Supabase Edge Function. GitHub is the only home of the source; code flows one way, from
GitHub to the host.

## Hosting on Votel

**Preference: use a Votel Website when possible, a Votel Web App when necessary.**

- A Website is CDN-hosted static files that you upload. Nothing on Votel changes the code.
  This is the preferred target because what is live is exactly the build that passed tests.
- A Web App is set up by Votel's assistant, which clones, installs, builds and publishes.
  Use it when the Website route cannot do what is needed.

| Item | Status | Evidence |
|---|---|---|
| Web App import of a Vue repo, served on a custom subdomain over HTTPS | Proven | `weather-test.stellarasystems.com`, 2026-11-15, owner-reported |
| History-mode deep links open directly and survive refresh (Web App) | Proven | `/city/miami`, 2026-11-15, owner-reported |
| Public build-time variable reaches the build | Proven | Set as a "Public" variable, then rebuild. Set as "Secret" it does not appear |
| Second subdomain on the same app | Proven | Owner-reported, 2026-11-15 |
| Website upload of an already-built `dist` | Documented | Not run yet. This is the preferred route, so it needs a test |
| Deep-link fallback on a Website | Open | Confirmed for a Web App only |
| Automated deploy from GitHub | Open | Not attempted |

Rules that held up:

- Only `dist` is deployed. Source stays in GitHub.
- Do not let the host's assistant or GitHub sync commit to the repository.
- `VITE_` values are public and fixed at build time. Changing one means rebuilding.

## App structure conventions

- One file per outside service, behind a small typed interface, so a provider can be
  swapped by editing one file: `src/services/weather.ts`, `src/services/backend.ts`,
  `supabase/functions/_shared/emailSender.ts`.
- Pinia stores hold identity and preferences only (signed-in user, saved cities, unit).
  Fetched data lives in composables, never in a store.
- Components display; composables hold the logic and the loading, empty and error states.
- If the Supabase variables are missing, the rest of the app still works and sign-in
  reports that it is not configured. The client is created lazily for this reason.
- Unit tests run in plain Node with `fetch` and `localStorage` stubbed. No jsdom needed.

## Supabase

### Project settings and what they require

| Setting | Effect | What the migration must do |
|---|---|---|
| "Automatically expose new tables" off | New `public` tables get no select, insert, update or delete grants for `anon`, `authenticated` or `service_role`. A missing grant shows as error `42501` | Grant explicitly, least privilege, to `authenticated` only |
| "Enable automatic RLS" on | An event trigger enables RLS on every new `public` table. RLS with no policies returns no rows | State `enable row level security` anyway, and write the policies |

Migration pattern (Proven to apply cleanly; isolation between two users not yet tested):

```sql
alter table public.notes enable row level security;
revoke all on table public.notes from anon, authenticated;
grant select, insert, delete on table public.notes to authenticated;
create policy "Users can view their own notes" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
```

Use `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`
so inserts do not pass the user id.

### Keys

- Browser: project URL and publishable key only (`sb_publishable_...`). Both are public.
- The secret key never goes in the browser, the repository or the host.
- Third-party secrets are Supabase function secrets, set with `supabase secrets set` or in
  the dashboard under Edge Functions, Secrets.

### CLI workflow (Proven, CLI 3.1.0)

```sh
npx supabase login                                  # owner runs this once
npx supabase link --project-ref <ref> --yes
npx supabase db push --remote --dry-run             # preview
npx supabase db push --remote --yes
npx supabase functions deploy <name> --use-api --yes
npx supabase secrets set NAME=value --yes
```

Gotchas found:

- `db push` targets a local database by default. `--remote` is required for the hosted one.
- Hosted changes need `--yes`.
- `--use-api` bundles on Supabase's side, so neither Docker nor Deno is needed locally.
  The cost is that Edge Functions are not type-checked before deploy.
- `supabase init` writes a 400-line `config.toml` of local defaults and, when it detects
  an AI agent, an `.mcp.json` that connects the agent to the project. Replace the config
  with a minimal one and delete `.mcp.json` unless that connection is wanted.
- There is no `supabase functions logs` command. Read logs in the dashboard under
  Edge Functions, the function, Logs.

### Edge Functions

- Pin `verify_jwt` per function in `supabase/config.toml`: `true` for functions called by
  signed-in users, `false` for webhooks that verify their own signature.
- **Do not rely on `verify_jwt` alone (Proven).** A request carrying only the publishable
  key passed the platform check and reached the handler. The handler must itself require
  a signed-in user (`role` is `authenticated` and `sub` is present).
- Supabase's docs now recommend the `withSupabase` wrapper from `@supabase/server` for
  auth and CORS. The test app does not use it, to avoid a dependency. Open: adopt it for
  the product.
- Functions that read a secret return facts about it (`found`, `length`), never the value.

### Email settings on the free plan (Proven)

- Email templates cannot be edited without custom SMTP. The default sign-in email
  contains a link, not a code.
- "Rate limit for sending emails" defaults to 2 an hour for the whole project and applies
  even when the Send Email hook does the sending. Raise it under Authentication, Rate
  Limits before testing (the owner set 10). The 60-second minimum gap per address is
  locked without custom SMTP.
- Built-in email only reaches the organization's team members.
- So for emailed codes, the Send Email hook is the only route, even for a first test.
  Enabling the hook turns built-in email off: if the provider fails, nobody gets a code.

## Sign-in email through Votel

### Flow

1. The app calls `signInWithOtp({ email })`.
2. Supabase Auth makes a numeric code (one hour, single use) and calls the Send Email
   hook, an HTTPS call to the `send-email` Edge Function, signed with the hook secret.
3. The function verifies the signature with `standardwebhooks`, after stripping the
   `v1,whsec_` prefix from the secret, then calls the email provider.
4. The app calls `verifyOtp({ email, token, type: 'email' })` and gets a session.

Hook setup is in the dashboard under Authentication, Auth Hooks: choose HTTPS, paste the
function URL, generate the secret, and store that secret as `SEND_EMAIL_HOOK_SECRET`
**before** creating the hook.

### Votel API facts

| Item | Status | Evidence |
|---|---|---|
| Endpoint `POST {host}/api/emails/send`, `X-API-Key` header, body `template_key`, `recipient.email`, `variables` | Documented | Votel API reference |
| API host is the app's own domain | Proven for reachability | `https://app.stellarasystems.com/api/emails/send` answers 401 without a key. The white-label domain `app.stellaralegal.com` answers the same way |
| A Viewer key cannot send email | Proven | Status 403 from the endpoint |
| Only two key roles exist, Viewer and Admin, so sending needs an Admin key | Proven | Create API Key dialog |
| Template key is the `custom_<hex>` id in the template's address under Library, Emails | Proven | A send with that key delivered the template, 2026-11-15 |
| An API send reaches a Gmail inbox quickly | Proven once | Arrived within the same minute; the five-attempt timing has not been run |
| **Caller-supplied `variables` do not reach the template** | Proven | See "The variables finding" below. This blocks Votel for sign-in codes |
| Sender is set per template by `from_name` and `from_email` | Proven by reading the record | Both default to `{{system.app_name}}` and `{{system.support_email}}`, which gave "Stellara Legal" at `support@stellaralegal.com`. Changing them needs `PUT /api/email-templates/{id}`; neither the visual editor nor the MCP tool exposes them |
| Delivery to an unsubscribed contact, and to a non-contact | Proven | Both received the code through the raw-content route, 2026-11-16 |
| Time from request to inbox | Open | Stage two check |

### The variables finding (2026-11-15)

Two real sends and Votel's own no-send preview endpoints all showed the same thing: values
passed in `variables` never appear in the rendered email.

- Sends to `POST /api/emails/send` with the code under six names (`code`,
  `verification_code`, and nested `auth.verification_code`, `custom.code`,
  `variables.code`, `data.code`): every token rendered empty.
- `POST /api/email-templates/{id}/preview` on the custom template, with the values flat,
  nested and as flat dotted keys: every token empty.
- The same preview on Votel's own "2FA / OTP Verification" system template
  (`2fa_otp_verification`): "Your verification code is:" followed by nothing, and
  "expires in minutes" with no number.
- `POST /api/emails/test/preview` with raw content: system tokens such as
  `{{system.app_name}}` filled in; every caller-supplied token was left as literal text.
- The template record does declare its variables automatically (a `variables` list built
  from the tokens in the body), so a missing declaration is not the cause.

Conclusion: through the template endpoint as it stands, only Votel's own system variables
are substituted. A sign-in code cannot be put into a Votel **template** this way. Votel's
own assistant reached the same root cause independently ("per-send variables never reach
the template renderer on this path"). Reported to Votel support; no answer yet.

### The route that works: raw content through `POST /api/emails/test` (Proven 2026-11-15)

Do not use a Votel template for the code. Build the whole email in the Edge Function and
send it as raw content:

```
POST {VOTEL_API_HOST}/api/emails/test
X-API-Key: <secret Admin key>
{
  "recipient_emails": "<address>",
  "subject": "Your sign-in code",
  "content": "<html with the code written in>",
  "is_marketing": false,
  "from_email": "support@stellarasystems.com",
  "from_name": "Stellara Systems",
  "reply_to": "support@stellarasystems.com"
}
```

- Result: the email arrived with the code in the body, and the owner completed a real
  sign-in with it. This is the first end-to-end sign-in on the stack.
- The adapter is `supabase/functions/_shared/emailSender.ts`. Its secrets are
  `VOTEL_API_HOST`, `VOTEL_API_KEY`, `VOTEL_FROM_EMAIL` and `VOTEL_FROM_NAME`.
  `VOTEL_OTP_TEMPLATE_KEY` is no longer used.
- The endpoint also takes `variables`, `contact_id`, `channel_id` and `attachments`; none
  are needed here.
- Strip everything but letters and digits from the code before writing it into the HTML.

Caveats to settle before the product relies on it:

- The endpoint is named a test endpoint. Nothing documents it as suitable for production
  email. Asked of Votel support; treat as Open.
- It still needs the Admin key.
- The code is stored in Votel's sent-message history. It is single use and short lived.
- Read from the headers of a received email (2026-11-16):
  - `from_email` and `from_name` are honoured: From was "Stellara Systems" at
    `support@stellarasystems.com`, with the same Reply-To.
  - SPF, DKIM and DMARC all pass for `stellarasystems.com`. The domain's DMARC policy is
    `p=none`, which is monitoring only.
  - Votel sends through Mailgun. Transit was one second from creation to the receiving
    mail server.
  - No "[TEST]" marker in the subject, and no unsubscribe footer.
  - Votel adds its own open-tracking pixel, served from `app.stellaralegal.com`, even
    though Mailgun's tracking headers are off. A sign-in email should carry no tracking,
    and the pixel's domain differs from the sending domain. No way to disable it was
    found: the send request has no tracking field, the General, CAN-SPAM and
    Integrations settings pages have no toggle, and the help docs have no article.
    Asked of Votel support.
  - Votel also generates a plain-text part from the HTML.
- **Held by the receiving mail system (observed 2026-11-16).** A code sent to the
  owner's own address, on a business domain hosted on Zoho Mail, did not appear, though
  Votel answered with success. After the owner added `stellarasystems.com` to that
  mailbox's Zoho allowed-domains list, the held email appeared together with a fresh
  one. The fresh one's headers show one second of transit and passing SPF, DKIM and
  DMARC, so the hold was Zoho's filtering of a new sender, not Votel and not an
  authentication failure. Codes to a personal Gmail, to a third person's address and to
  a subscribed Votel contact all arrived promptly. Lesson for the product: customers'
  mail systems will judge these emails the same way and cannot be allow-listed by us, so
  sender reputation, a dedicated sending subdomain and visible delivery logs matter.
- **No audit trail.** Sends through `/api/emails/test` do not appear in Votel's message
  activity log, delivered or not, so there is nowhere to check what happened to one.
  The function sees only the HTTP status. For a product this means a sign-in email can
  vanish with no error on either side.
- Fallback if Votel says no: a transactional provider as Supabase custom SMTP. Resend's
  free plan (3,000 a month, 100 a day) costs nothing at this volume and needs no Edge
  Function, hook or Admin key.

Supabase side note: this project sends **8-digit** codes. Code length is a project
setting, so never hard-code "6 digits" in the app or the email.

Other facts read from the records: a template's preview takes the template **id**, while
sending takes the template **key**; the preview by key returns "Template not found".

Consequences worth carrying into the skill:

- **An Admin key is a full-access key to the Votel account.** There is no send-only key.
  Keep it only in Supabase function secrets, give it an expiry, and name it for its use.
- Votel's completeness check treats a new template as marketing and wants an unsubscribe
  link. A sign-in email is transactional and should not carry one. Whether Votel also
  applies marketing suppression to API sends is the open question above.
- The provider adapter must never put the code, the key or the recipient in a log line or
  an error message. Log the HTTP status and the action type only.
- Map a hook failure to a plain message in the app. Supabase otherwise shows
  "Unexpected status code returned from hook: 500".

## Access control: two locks

An emailed code proves one thing only: this person controls that inbox. Deciding who may
use the app is separate, and takes two locks.

**Lock 1: who may have an account (invite-only)**

- Turn off "Allow new users to sign up" in Supabase.
- Request codes with `shouldCreateUser: false`, so an unknown address gets no account.
- Create users only by invitation, from an admin screen backed by a server function.
- Answer every request with the same message, so the form cannot reveal who is a customer.

**Lock 2: what an account may see (authorization)**

- A membership table links each user to a tenant and a role.
- Every table's RLS policy is written against that membership, not just "is signed in".
- A user with no membership sees nothing.

Lock 2 is the one that protects one tenant's data from another's, and it holds even if
lock 1 is misconfigured. Add rate limits and a CAPTCHA to the request-code form so it
cannot be used to flood someone's inbox.

Status: Chosen. The test app has sign-ups open and tests a single-user version of lock 2
(each user sees only their own notes).

## Handling secrets when an AI agent does the setup

- The agent never asks for a secret in chat and never prints one.
- Values the agent can invent (a test secret) are generated in the shell and masked in
  the output.
- Values a vendor shows once (an API key, a hook secret) are moved from one browser page
  to another inside a single browser script that returns only a length and a yes or no.
- The owner signs in to each dashboard personally. The agent does not type credentials.
- After browser work, delete the automation's saved page snapshots and check them for
  key patterns first.

## Check results so far

Stage one, all owner-reported on 2026-11-15: six of six passed.

Stage two:

| Check | Result |
|---|---|
| A request to `send-email` without a valid hook signature is rejected | Pass (401 with no signature and with a forged one) |
| `secret-check` is refused when signed out | Pass (401 with no credentials and with the publishable key only) |
| `secret-check` returns found when signed in | Pass (owner pressed "Run secret check" on the Account page) |
| Sign in with an emailed code | Pass (owner signed in on the local dev server with a code sent through Votel) |
| Refresh, still signed in; sign out works | Pass (owner-reported, local dev server) |
| A second user cannot see the first user's notes | Pass (a second account's Account page showed no notes; owner-reported. A signed-out read is refused with `42501`) |
| The `TEST_SECRET` value appears nowhere in the build output | Pass (secret set to a fresh 40-character value, app rebuilt, zero matches in `dist` and in the repository; the same search does find the publishable key, so the search works) |
| A code arrives at an address that is not a Supabase team member | Pass (a Gmail address outside the Supabase organization) |
| Arrival time measured on five attempts | Pass (owner-reported; individual timings not recorded. One measured send took one second from creation to the receiving server) |
| A code arrives at an address that is not a Votel contact | Pass (owner confirmed the address is not in Votel's contacts) |
| A code arrives for a Votel contact who unsubscribed from marketing email | Pass (contact marked unsubscribed from marketing still received the code, so `is_marketing: false` sends are not suppressed) |
| A wrong Votel API key gives a clear failure, logged without secrets | Not run, deferred to the product (covered by a unit test with a simulated reply; a valid Viewer key gave a clean 403 log line, which is related but not this check) |

Stage three, Part A (the published app), 2026-11-16:

| Check | Result |
|---|---|
| The published app signs a user in on both subdomains | Pass (owner-reported, `weather-test` and `weather-test2`) |
| `secret-check` and notes work from the published app | Pass (owner-reported) |
| Both subdomains serve the same build with the public Supabase values and no secret key | Pass (fetched both bundles: identical, sign-in route, project address and publishable key present; `sb_secret_` appears only as the prefix the Supabase library checks for, with no key after it) |
| The host's assistant made no commits | Pass (`origin/main` has only the owner's commits after the publish) |

Facts learned from the publish:

- Supabase sessions are per browser origin. Signing in on one subdomain does not sign the
  user in on another subdomain of the same app.
- Session length on Supabase defaults: the access token lasts one hour and is renewed
  automatically; the refresh token never expires and is single-use. So a user stays
  signed in until they sign out or the browser's site data is cleared. Forced sign-out
  (time-box, inactivity timeout, single session per user) needs the Pro plan
  (Documented, Supabase "User sessions" guide, checked 2026-11-16). Open for the
  product: drivers' phones can be lost or shared.
- On the Votel Web App, `npm ci` failed for Votel's assistant and it built with
  `npm install` instead, so the published build is not guaranteed to match the lockfile
  (reported by Votel's assistant; `npm ci` works locally). One more reason to prefer the
  Website upload of a tested `dist`.

## Tenants, invite-only sign-in and branding (stage three, Part B)

Built and applied 2026-11-16. Rows marked Proven were run that day.

| Item | Status | Evidence |
|---|---|---|
| Pooled multi-tenancy: one database, a `tenant_id` on every tenant-owned table, access decided by a `memberships` table through row-level security | Proven for tenants and their files | Owner signed in as three accounts on the local dev server: a LAMO admin and a Tenant B member each saw only their own business, and an account with no membership saw none. Orders and invoices follow in Part C |
| Signed-out callers cannot read `tenants`, `memberships` or a tenant file | Proven | Public API: `42501` on both tables, "Object not found" on the file, "Bucket not found" on the public file path |
| Invite-only, lock one: "Allow new users to sign up" off | Proven | `/auth/v1/settings` reports `disable_signup: true`; a sign-up request returns `signup_disabled` |
| Invite-only, lock two: the form asks with `shouldCreateUser: false` | Proven | A made-up address returns `otp_disabled` (422), no email is sent, user count unchanged |
| Same answer for any address | Proven | The form shows "If <address> has been invited, a sign-in code is on its way to it." Known limits: the reply is faster for an unknown address, and an email-sending failure is shown only for real accounts |
| Branding through two CSS variables, fed from the tenant row | Proven (owner saw each tenant's colours on buttons and links) | Tailwind 4 needs `@theme inline` so utilities emit `var(--brand-primary)`; colours are checked as six-digit hex in the database and again in the app before use |
| Logo from a private bucket by short-lived signed link | Proven (owner saw each tenant's logo; signed-out read refused) | One-hour link; the header falls back to the business name if the image fails |

Gotchas:

- The Supabase CLI refuses hosted writes from an agent run unless `--yes` is passed, and
  says so. That includes `storage cp` and `db query`. `db query --read-only` allows only
  plain reads, so a test that needs `set role` cannot use it.
- `supabase storage` needs `--experimental`, and paths are written `ss:///bucket/path`.
- A storage bucket and its policy on `storage.objects` can be created in an ordinary
  migration.
- "Allow new users to sign up" is a dashboard switch (Authentication > Sign In /
  Providers). `supabase config push` would also set it but pushes the whole auth
  section, including hooks, so it was not used.
- RLS is checked when a statement is planned, so setting the role inside the same
  statement does not test a policy.
- **An unconfirmed account is locked out once sign-ups are off (Proven, 2026-11-16).**
  Supabase treats a code request for an account whose email was never confirmed as a
  sign-up and refuses it with `signup_disabled`; no email is sent. The form hides that
  refusal on purpose, so the user just never gets a code. One test account was in this
  state because its first code arrived late and was never used. Fix: set the email as
  confirmed. Rule for the product: create invited users already confirmed
  (`email_confirm: true` in the admin API), and before turning sign-ups off, confirm or
  remove any account that never finished signing in.

## Carried to the product

The test app stays high-level: it answers whether the stack is right. These items were
found here and are to be done when the live product is built, not in this test.

| Item | Why it matters |
|---|---|
| Run the wrong-email-key check against the real provider | Keys expire (the test key lasts 30 days). The failure must be clear to the user and in the log, with no secrets |
| Log the provider's reply, redacted, on every sign-in email | Votel's test endpoint leaves no trace in its own message log, so there is otherwise no audit trail |
| Key rotation: a calendar reminder and a written procedure | Neither Supabase nor Votel shows a stored key again; rotation means create, set, delete old |
| Decide session length | Supabase defaults keep a user signed in indefinitely; forced sign-out needs the Pro plan. Drivers' phones can be lost or shared |
| Choose the email route (Votel test endpoint or Resend) | Waiting on Votel support's answers |
| Pin the host's build to the lockfile, or upload a tested `dist` | Votel's assistant fell back to `npm install` |
| Tell customers on Zoho or similar to allow the sending domain | A new sender was held until the domain was allowed |
| Build AI first, following the product repository's `docs/ai-first-design.md` | A product requirement. Every action is one server function that screens and AI both call; the model proposes and code commits. The plumbing is to be proven in stage three of the test app (`CLAUDE.md`, "AI-first (stage three)"), not started as of 2026-11-16; so far only the secret-holding Edge Function mechanism is proven |
| If OpenRouter is the AI gateway: set its privacy settings before real client data | Documented, read 2026-11-16, not tested. In Settings > Privacy: opt out of routing to providers that may train (separate switches for paid and free models), and consider Zero Data Retention (account-wide, per model group, or per request with `"provider": {"zdr": true}`). ZDR removes the first-party Anthropic and OpenAI endpoints (Bedrock, Vertex and Azure remain) and most Google models. OpenRouter's privacy policy says it does not train on inputs or outputs; its pages did not say what it stores itself by default, so check the dashboard. Never use free models for client data |
| An invitation function: a tenant admin enters an address, an Edge Function creates the user and the membership | In the test this is done by hand in the dashboard. Supabase's current guidance is the `withSupabase` wrapper from `@supabase/server`, a new dependency |
| Give a neutral answer when Supabase's one-code-per-minute limit is hit | "For security purposes, you can only request this after N seconds" is shown only for addresses that have an account, so it reveals that the address is registered |
| Choose the tenant from the subdomain | The test takes the user's first membership |
| For large tables, move the membership test into a `security definer` function or a JWT claim | The simple subquery policy is fine at LAMO's size; this is the documented next step if queries slow down |
| Private repository, and sign-ups off before any real user | The test repository is public and sign-ups are open |

## What the future skill should cover

1. When to use this pattern, and the Website-first hosting preference.
2. Scaffolding the Vue app and the one-file-per-service structure.
3. Supabase project settings to choose, and the migration template with grants and RLS.
4. The Edge Function templates: a signed-in-only function and the Send Email hook.
5. The Votel email adapter and the setup steps on the Votel side.
6. The two-lock access model for invite-only, multi-tenant apps.
7. The secret-handling rules for agent-driven setup.
8. A check list to run before calling a deployment done, with pass, fail or not applicable.
9. The gotchas listed above.
