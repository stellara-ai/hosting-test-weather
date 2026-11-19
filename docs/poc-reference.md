# Proof-of-concept reference

A map from each feature of the LAMO Distributor product to the file in the proof of
concept that already solved it, so nothing has to be worked out twice.

- **Proof-of-concept repository:** `stellara-ai/hosting-test-weather`, frozen at the git
  tag `poc-complete` (2026-11-19). Read it; do not build on it.
- **What was proven, with evidence and the problems hit:** `docs/proven-stack.md`
  (copied from the proof of concept's `docs/stack-notes.md`).
- **What to build:** `docs/product-spec.md` (copied from `docs/lamo-product-spec.md`).

Paths below are in the proof-of-concept repository. "Reuse" means copy and adapt; "Pattern"
means follow the approach but write it for the product's own tables.

## Hosting and build

| Feature | Files | Use | Notes |
|---|---|---|---|
| Vue 3 + Vite + TypeScript strict + Tailwind 4 + Pinia, history routing | `package.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.ts`, `src/main.ts`, `src/router/index.ts` | Pattern | Static build in `dist`, deployed to Votel. Deep links and refresh work on Votel (proven). |
| Public build-time values | `.env.example` | Pattern | Only `VITE_` values that are safe to publish. Never a secret. |
| The only module that talks to Supabase | `src/services/backend.ts` | Pattern | Every screen goes through it; makes the provider swappable and testable. |
| Brand colours as CSS variables (Tailwind `@theme inline`) | `src/assets/main.css`, `src/stores/tenant.ts`, `src/App.vue` | Reuse | Colours checked as six-digit hex in the database and again in the app. |

## Sign-in and access

| Feature | Files | Use | Notes |
|---|---|---|---|
| Sign-in by emailed code, invite-only, same answer for any address | `src/composables/useSignIn.ts`, `src/views/SignInView.vue`, `src/stores/auth.ts`, `isUnknownAddressError` in `src/services/backend.ts` | Reuse | Sign-ups off in Supabase plus `shouldCreateUser: false`. |
| Sign-in email through Votel's Send Email hook | `supabase/functions/send-email/index.ts`, `supabase/functions/_shared/emailSender.ts` (+ its test) | Reuse | `EmailSender` interface: swap the provider in one file. Verifies the hook signature. See proven-stack, "Sign-in email through Votel". |
| Tenants and memberships, row-level security by membership | `supabase/migrations/20261117035331_create_tenants.sql` | Pattern | Every tenant-owned table carries `tenant_id`; policies check `memberships`. Migrations grant and enable RLS explicitly (project settings: tables not exposed by default). |
| Roles admin, member, driver | `supabase/migrations/20261119230000_deliveries.sql` (top) | Pattern | |
| Private files per tenant (`<tenant id>/...` folders) | the storage policies in `20261117035331_create_tenants.sql` and `20261119230000_deliveries.sql` | Reuse | Read for members; upload allowed only where needed, and never replace or delete for proofs. |
| An Edge Function that reads a secret and refuses signed-out callers | `supabase/functions/secret-check/index.ts` | Pattern | Do not rely on `verify_jwt` alone; check the user in code. |

## Orders, invoices and PDF

| Feature | Files | Use | Notes |
|---|---|---|---|
| Orders and lines with tenant checks | `supabase/migrations/20261117230000_create_orders.sql`, `20261117240000_invoice_fields.sql` | Pattern | Composite foreign keys `(id, tenant_id)` stop a line pointing at another tenant's order. Seed data is invented. |
| Invoice PDF layout: LAMO's sample layout, auto-fit to 47 lines, continuation pages, two labelled copies, per-business settings | `supabase/functions/_shared/invoicePdf.ts` | **Reuse as is** | Pure layout, no Supabase code. Load `@pdfme/pdf-lib` from esm.sh, not `npm:` (boot error otherwise). The same file can draw the live preview in the browser. |
| Per-business invoice settings (fields, columns, lines, colour) | `20261117250000_invoice_settings.sql`, `readInvoiceOptions` in `invoicePdf.ts` | Reuse | Invalid settings fall back to defaults. The product adds layouts per customer. |
| PDF Edge Function: reads as the caller, stores privately, short-lived link, delivery signature and note | `supabase/functions/order-pdf/index.ts` | Reuse | Measured: 0.08-0.19 s to draw against a 2 s CPU limit. |
| Orders list with PDF and Deliver buttons | `src/components/OrdersPanel.vue` | Pattern | |

## Delivery and signatures

| Feature | Files | Use | Notes |
|---|---|---|---|
| Delivery screen, phone and tablet first: "Did everything arrive?", checklist (one by one or select all), approved or ad hoc signer, hand back to the driver for the credit choice, signed on paper with photo | `src/views/DeliveryView.vue`, `src/services/delivery.ts` (+ `__tests__/delivery.spec.ts`) | Reuse, then add driver mode | Customer view by default; driver mode with a passkey or PIN is for the product (spec, "Customer view by default"). |
| Signature pad on the browser canvas, no library | `src/components/SignaturePad.vue` | **Reuse as is** | Pointer events, `touch-action: none`, strokes stored relative to size so rotation keeps the drawing. |
| One all-or-nothing save: delivery, lines, optional credit memo, alerts, order status | `record_delivery` in `20261119230000_deliveries.sql`, revised in `20261119240000_optional_credit_memo.sql` | Pattern | `security definer` with every check written inside. Credit never automatic. Verifies the uploaded file exists in the tenant's folder for that order. |
| Upload from the phone under access rules | `uploadProof` and `randomId` in `src/services/backend.ts` | Reuse | Phones on plain `http` (local network testing) lack `crypto.randomUUID()`. |
| Office alerts | `src/components/OfficeAlertsPanel.vue`, `office_alerts` and `resolve_office_alert` in the deliveries migration | Pattern | The product sends them by email or push too. |

## AI-first and MCP

| Feature | Files | Use | Notes |
|---|---|---|---|
| Tool catalog: every tool declared once (name, description, input schema, read or write, confirmation, roles, channels) | `supabase/functions/_shared/toolCatalog.ts` | **Reuse the shape** | The MCP tool list is generated from it. Write tools held back until confirmation exists. |
| MCP server for outside AI apps, signing in as a user through Supabase OAuth 2.1 | `supabase/functions/mcp/index.ts`, `verify_jwt = false` in `supabase/config.toml` | Reuse | Answers 401 with `WWW-Authenticate: Bearer resource_metadata=...`; catches `getClaims` throwing on non-JWT strings. Proven with Claude Code, three accounts. |
| Consent page for outside apps | `src/views/OAuthConsentView.vue`, `getAuthorizationRequest` and `decideAuthorization` in `backend.ts` | Reuse | Lives at the single Site URL plus `/oauth/consent` (one shared sign-in address, decided). |

## Not built in the proof of concept (specified only)

The in-app assistant (typed and spoken), AI order entry with hard approval, AI credits in
the field, driver mode, client signing in their own app, invoice editing and Copy
invoice, customer locations, layouts per customer, logo and icon uploads, printing by
email through the business's sender, and the delivery scenarios beyond those listed
above. The spec describes each.

## Accounts and projects for the product

- A new Supabase project on the Pro plan (pausing, backups and session controls; see
  proven-stack, "Supabase plan and limits"). The proof-of-concept project stays as a
  sandbox.
- A new Votel site for the product's web app.
- Turn on Supabase's OAuth 2.1 server with dynamic client registration when MCP is built.
