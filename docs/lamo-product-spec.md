# LAMO Distributor portal: product spec

Draft, 2026-11-17. Written in `stellara-ai/hosting-test-weather` from what the proof of
concept proved and what the owner decided during it. To be moved to
`stellara-ai/distributor-order-portal/docs/`.

Sources, all in the test repository: `CLAUDE.md` (plan, decisions, requirements) and
`docs/stack-notes.md` (what is proven, with evidence). References below name the
stack-notes section, for example *stack-notes: "Server-built PDF"*. Link:
<https://github.com/stellara-ai/hosting-test-weather/blob/main/docs/stack-notes.md>

Status words used here:

- **Proven:** run against the real stack in the test and passed.
- **Decided:** the owner chose it; not necessarily built.
- **Proposed:** this spec's suggestion; to be confirmed.

---

## 1. Purpose and scope

- A multi-tenant ordering portal for distributors. Each business (tenant) has its own
  customers, products, orders, invoices, users and branding, kept apart in one database.
- **First tenant: LAMO Distributor**, a food distributor in Miami (produce, bakery,
  dairy). Its customers include hospitals.
- **AI first.** AI is the main way work enters and moves through the system; screens are
  where people review and confirm it. Rule: **AI proposes, code commits.**
- **Scale, from LAMO's August 2026 sample invoices:** about 116 invoices a month, 14 line
  items on average, 47 at most, all printed on one page. Five hospitals accounted for 82
  of them. Plan for ten times this; nothing in the stack is stretched by it.

Out of scope for the first release (from the test's scope list): taxes and payments,
QuickBooks, the Votel contact sync, passkeys. Each can be added later.

---

## 2. The proven stack and how to use it

| Layer | Choice | Status | Notes |
|---|---|---|---|
| Front end | Vue 3, TypeScript strict, Vite, Vue Router (history mode), Pinia, Tailwind 4 | Proven | One static build. *stack-notes: "App structure conventions"* |
| Hosting | Votel Web App, static files, custom subdomains | Proven | Code flows one way, GitHub to Votel. Publishing is a manual pull, `npm ci`, build, publish by Votel's assistant. *stack-notes: "Hosting on Votel"* |
| Sign-in | Supabase Auth, emailed one-time code | Proven | Invite-only: sign-ups off and `shouldCreateUser: false`. Same answer for any address |
| Sign-in email | Supabase Send Email hook to an Edge Function that sends through Votel's `POST /api/emails/test` with raw content | Proven | Provider behind an `EmailSender` interface, swappable in one file. Production route still open (section 7). *stack-notes: "Sign-in email through Votel"* |
| Data access | Postgres row-level security written against a `memberships` table (user, tenant, role) | Proven | Every tenant-owned table carries `tenant_id`. Grants and RLS stated in each migration. *stack-notes: "Access control: two locks"* |
| Files | Private Storage buckets, first folder = tenant id, read policy by membership; short-lived signed links | Proven | `tenant-assets` (logos, signatures), `tenant-documents` (PDFs) |
| Server code | Supabase Edge Functions (Deno) | Proven | Secrets live only here. Limits: 2 s CPU per request, 256 MB, 150 s wall clock on Free (400 s paid). *stack-notes: "Edge Functions"* |
| PDF | `@pdfme/pdf-lib` 6.2.8, loaded from esm.sh | Proven | `npm:` import fails to boot on the Edge Runtime. 0.08-0.19 s per invoice, 16-20 MB. *stack-notes: "Server-built PDF"* |
| AI agents (MCP) | Official `@modelcontextprotocol/sdk` 1.32.2 in an Edge Function; sign-in through Supabase Auth's OAuth 2.1 server | Proven | Claude signed in as each test user and saw only that user's business. *stack-notes: "MCP server with per-user sign-in"* |
| Validation | `zod` 4 | Approved | Used for tool input schemas |
| AI model | OpenRouter, model named in the `AI_MODEL` secret | Decided, not built | See section 3 |

**Rules carried from the test**

- Fetch current documentation before writing code against Vue tooling, Supabase or Votel.
- Ask before adding a dependency.
- No secrets in the repository or in any `VITE_` variable. `VITE_` values are public.
- Check the signed-in user in every Edge Function; do not rely on `verify_jwt` alone.
- After every Edge Function deploy, call it once and read its logs: a boot error only
  shows on the first request.
- The repository is private, and sign-ups are off, before any real user.

**Supabase plan** (*stack-notes: "Supabase plan and limits for a real tenant"*)

- Run production on **Pro** (about $25 a month). Not for the quotas, which LAMO uses a
  fraction of, but because Free projects pause after a quiet week, session time limits
  need Pro, and Pro includes daily backups.
- LAMO estimate: 8-30 MB of storage a month, a few hundred function calls, tens of MB of
  egress. Pro includes 100 GB storage, 2 million function calls, 250 GB egress.

---

## 3. Decisions already made

| Date | Decision |
|---|---|
| 2026-11-16 | **Invite-only.** No public sign-up. An admin invites; the sign-in form gives the same answer for any address |
| 2026-11-16 | **Branding per tenant, kept small:** logo or word mark, a primary and an accent colour, applied through CSS variables |
| 2026-11-16 | **AI proposes, code commits.** The model returns structured proposals naming a tool and its arguments; code validates, checks permission and decides. Facts (products, prices, totals) come from the database, never from the model |
| 2026-11-16 | **Model-agnostic AI.** OpenRouter, one key; the model is configuration in the `AI_MODEL` secret, never in code, so changing model needs no deploy. Only the `AiModel` adapter knows OpenRouter exists. Send `require_parameters: true`. Set OpenRouter's privacy settings before real client data |
| 2026-11-16 | **Autonomy is a setting.** Level 1: every change needs a tap to confirm. Level 2: clean changes apply after a short undo window. Level 3: clean changes apply at once. Start at level 1. Reads never need confirmation |
| 2026-11-16 | **Two copies per invoice:** "Business copy" and "Client copy", letter size |
| 2026-11-17 | **The name is written "LAMO".** The owner will supply a dark-mode word mark corrected to match |
| 2026-11-17 | **MCP is part of AI first.** Outside agents (Claude, ChatGPT and others) use the app's tools through an MCP server, generated from one tool catalog |
| 2026-11-17 | **One shared sign-in address for outside apps.** Supabase has one Site URL per project, so the "Connect an app" page lives at one address (for example `account.` plus the product domain), branded after sign-in from the person's business |
| 2026-11-17 | **Invoice layouts are data, per tenant and per customer**, with "apply to all customers" (section 4) |
| 2026-11-17 | **Invoice layout follows LAMO's current invoices**, with per-business settings (section 4) |
| 2026-11-17 | **Logo upload spec** (section 4) |
| 2026-11-17 | **White-label favicon and app icon: carried to the product, not spiked.** Spec in section 4; one open question in section 7 |

---

## 4. Functional requirements

### Customers

- A `customers` table per tenant: name, bill-to address, one or more ship-to addresses,
  contact, and an optional invoice layout. (The test stored the customer as text on each
  order; the product must not.)

### Products catalog

- A `products` table per tenant: item code (for example "P BEN"), description, unit
  (case, bag, tray, each), price, active flag.
- Prices on an order line are copied from the catalog when the line is added, so later
  price changes do not alter past orders.

### Orders

- An order belongs to a tenant and a customer, with ordered date, ship date, ship-to,
  status (draft, submitted, invoiced, delivered) and lines.
- Each line: product, item code, description, unit, quantity, unit price.
- Orders can be created on screen or proposed by AI (typed or spoken, English or Spanish),
  then confirmed by a person.

### Invoices

**Layout** (proven in the test; *CLAUDE.md, "Part C: PDF spike"*)

- Top left: logo, then business name, address, email, phone.
- Top right: "Invoice", and a box with Date, Ship Date, Invoice #.
- Bill To and Ship To boxes, each with name and address.
- Table: Quantity, Item Code, Description, Price Each, Amount.
- Bottom row: delivery signature on the left, Total on the right.
- Two labelled copies in one PDF.

**Auto-fit** (proven)

- Up to 31 lines at the normal size (9 pt text, 12 pt rows).
- 32 to 47 lines stay on one page: the Bill To and Ship To boxes shorten and the rows
  tighten, down to 7 pt text on 8.4 pt rows, matching LAMO's own long invoices.
- Beyond 47, pages continue at the tightest size, each repeating the header and the
  address boxes, with "Continued on next page"; the last page carries the Total and
  signature. "Page 1 of 2" per copy. Capped at 10 pages per copy.

**Settings per business** (proven as on/off settings in the test; the product adds a
screen)

- On or off: business name, address, email, phone, Date, Ship Date, copy labels, page
  numbers.
- Columns and their order, from Quantity, Item Code, Description, Unit, Price Each,
  Amount. Description is always shown and takes the remaining width.
- Table lines: between columns (default), full grid, or none.
- Colour or black and white.
- To add in the product: line item font size; optional Subtotal, Discount (amount or
  percentage), Tax (rate), Shipping charge; optional header fields P.O. Number, Terms,
  Rep, Via, F.O.B., Project, as on LAMO's current invoices.
- Invalid or missing settings fall back to the defaults; a typo never breaks an invoice.

**Layouts per tenant and per customer** (decided)

- A tenant saves several named layouts; one is its default.
- A customer can have its own layout, overriding the default for that customer only.
- Which prints: the customer's layout, else the tenant's default, else the built-in
  defaults.
- **"Apply to all customers":** makes a layout the tenant's default and removes every
  customer override. It asks for confirmation and says how many customers will change.
- Each invoice records the layout it printed with, so a reprint matches the original.
- Only a tenant admin changes layouts, on a settings screen with a live preview.

**Manual entry, override and preview** (decided)

- A person can open any invoice, including one the AI drafted, and add, change or remove
  lines and add a note before it is finalised.
- The invoice becomes final only when a person confirms. A finalised invoice cannot be
  edited.
- **The preview is exactly what prints:** drawn with the same layout code that makes the
  PDF (`invoicePdf.ts`). The library runs in the browser, so the preview redraws as
  lines change with no server call; the server still makes the stored PDF from the saved
  data.

### Delivery confirmation and signature

**LAMO's current practice (owner, 2026-11-17):** the invoice is printed before the truck
leaves, carried to the customer, and signed on paper at the door. The app must not
interrupt that. Automatic printing removes a trip back to the printer; it is a fail-safe,
not a replacement for paper.

- **Paper stays valid.** When the customer signs the paper copy, someone marks the invoice
  delivered in the app ("signed on paper"). Recommended: attach a photo of the signed
  copy as proof of delivery.
- **On-screen signing, mobile first.** On a phone: the order's lines on a screen (not the
  PDF), each marked Delivered, Short (with the quantity delivered) or Refused (with a
  reason), then the receiver signs on screen.
- **Who may sign (owner, 2026-11-17):** each customer has a list of approved receivers
  (several per customer). At the door the driver picks a name from that list and the
  receiver signs. Someone not on the list can sign ad hoc: they type their name, then
  sign, and a new contact is created for that customer, marked "added at delivery".
  Syncing these contacts to Votel comes later, not now.
- **Shortages and refusals follow industry practice:** an issued invoice is never edited
  or deleted. Short, damaged or refused lines produce a credit memo linked to the
  invoice; the customer owes the invoice minus the credit memo. A fully refused or badly
  wrong invoice is voided (it keeps its number and a reason) and reissued if needed.
  LAMO invoices before delivery, so this is the model that fits, not finishing the
  invoice at the door.
- **Invoice statuses:** Draft (editable, deletable) -> Issued (number locked, printed)
  -> Delivered (signed on screen or on paper; credit memos for any exceptions) -> Paid;
  or Void (kept, with a reason).
- The signature image is stored in the tenant's private bucket, readable only by members
  (proven for a sample signature written by the server; not yet proven for a user
  uploading from a phone). The signature and the receiver's name appear on the invoice
  PDF and the credit memo.
- Not decided: working without a phone signal at the door.

### PDF

- Built by an Edge Function from saved data, stored privately under the tenant's folder,
  downloaded through a link valid for five minutes (proven).
- Use a PDF-sized logo copy (section "Branding uploads") to keep invoices around
  50-80 KB instead of about 250 KB.

### Printing

- Requirement: print automatically from the web app to an office printer, two copies
  (one PDF with the two labelled copies), letter size. Support several ways to print;
  each business picks its route (owner, 2026-11-17). Customers use both Mac and
  Windows, so no route may depend on one of them.
- **Email print: proven (owner, 2026-11-17).** LAMO's printer has an email address; a
  PDF emailed to it prints. The owner emailed the order 1001 invoice PDF from two Gmail
  accounts (the owner's and LAMO's) and both printed correctly. Rules for this route:
  the PDF goes as an attachment to the printer's address; no subject or body is needed
  (Votel's send endpoint requires a subject, so send a short one such as the invoice
  number); the sender must be on the printer's allowed-senders list; the printer's
  service sends a reply to the sender, which can later be read as the print status.
- Planned sending route: the business's own Votel sub-account and sender address (the
  owner created one for LAMO), through the same Votel endpoint as the sign-in email.
  Open: the format of that endpoint's `attachments` field is not documented (checked the
  API reference and help docs, 2026-11-17); settle it with one test send to an inbox,
  using the sub-account's API key as a Supabase secret, and add it to the open Votel
  support questions. Not chosen: sending from the business's Gmail (needs Google's
  review for the send permission, stores a key that can send as the owner, and Edge
  Functions cannot use SMTP ports 25 and 587).
- Routes to offer, behind one `PrintProvider` interface fed from a `print_jobs` queue
  table: (1) email print; (2) a print service app on a Mac or Windows computer beside
  the printer, for example PrintNode, for printers without email print; (3) a Print
  button that opens the PDF for a person to print, as the fallback that always works.
  Per business: the route, the printer's email address, and the sender.
- A business can have more than one printer (LAMO has two; the first uses Epson
  Connect Email Print, the second's address is pending from the owner). Store each
  printer's address per business in the database; treat it like a secret, because
  anyone with it can try to print, and the allowed-senders list is the only check. Send
  an empty message body, since Epson Email Print can also print the body as a page.

### Branding uploads (decided; white label carried to the product)

**Logo**

- Main brand logo: SVG, PNG or JPG, up to 5 MB. Recommended: SVG, or PNG at least
  1000 px wide (printing needs about 700 px at the invoice's 2.4 inches), about 2.5 : 1,
  transparent background, dark or full-colour artwork for white backgrounds.
- Logo for dark backgrounds (optional): same formats, light artwork.
- On upload the browser keeps the original privately and makes right-sized PNG copies
  for the screen and the PDF, plus a grey copy for black-and-white invoices. SVGs are
  converted this way (the PDF library cannot embed SVG; image libraries such as sharp do
  not run in Edge Functions).
- An uploaded SVG is never served as-is (it can carry script); only the PNG copies are
  shown.

**Favicon and app icon (white label)**

- Favicon: ICO or PNG, square, up to 1 MB; recommended PNG at least 48 x 48. If none is
  uploaded, it is made from the app icon.
- App icon: PNG, square, up to 2 MB, **at least 512 x 512 (required)**. Artwork inside the
  centre 80 % (Android crops it round) on a solid background (iOS fills transparency with
  black). The browser makes 192 x 192 and 512 x 512 (both required to install on
  Android and Chromium) and 180 x 180 for iOS.
- Per business also: the installed app's name, short name and theme colour.
- Open question: serving these per business from one static build (section 7).

### Users and access

- Roles: admin and member per tenant (proven). A driver role is likely; to decide.
- Invitation: a tenant admin enters an address; an Edge Function creates the user and the
  membership.
- The tenant is chosen from the subdomain (the test took the first membership).
- A "Connected apps" screen lists outside apps a user has allowed and lets them revoke
  access (Supabase can list and revoke grants).

---

## 5. Tool catalog

### Rules (from `CLAUDE.md`, "AI-first" and "MCP server and tool catalog")

1. **Every action is a tool first, a screen second.** One use-case function per action,
   with typed, validated input and a permission check. Screens, the in-app assistant and
   MCP all call the same functions. Nothing exists only in a click handler.
2. **One catalog, kept in code.** Each tool is declared once with: name, description
   (written for the model), input schema, output shape, read or write, needs
   confirmation, roles, channels (screen, assistant, MCP). The assistant's tool list, the
   MCP tool list and a reference doc are generated from it. No channel keeps its own
   list.
3. **Tools run as the signed-in user**, with that user's database client, so row-level
   security decides what they see. An agent can never do more than the user can in the
   app.
4. **AI proposes, code commits.** A write proposed by AI, in the app or over MCP, returns
   a proposal; the change happens only after a confirmation the user can see. Reads need
   no confirmation.
5. **Write tools stay off MCP until confirmation over MCP exists** (as in the test).
6. **Facts come from tools**, never from the model.
7. Every AI and MCP call is logged (model, tokens, cost, latency for AI; tool, client,
   outcome for MCP), without secrets.

The proven starting point is `supabase/functions/_shared/toolCatalog.ts` in the test.

### Proposed tools

Roles: A = admin, M = member. Channels: S = screen, As = in-app assistant, MCP.
"Confirm" means a person confirms before the change applies when AI proposed it; a
person acting directly on a screen is the confirmation.

| Tool | Read / write | Confirm | Roles | Channels | Status |
|---|---|---|---|---|---|
| `list_products` | Read | No | A, M | S, As, MCP | Proposed |
| `search_products` | Read | No | A, M | S, As, MCP | Proposed |
| `list_customers` | Read | No | A, M | S, As, MCP | Proposed |
| `get_customer` | Read | No | A, M | S, As, MCP | Proposed |
| `list_orders` | Read | No | A, M | S, As, MCP | **Proven** (MCP only in the test) |
| `get_order` | Read | No | A, M | S, As, MCP | Proposed |
| `create_order_draft` | Write | Yes | A, M | S, As, MCP | Proposed |
| `add_order_line` | Write | Yes | A, M | S, As, MCP | Proposed |
| `update_order_line` | Write | Yes | A, M | S, As, MCP | Proposed |
| `remove_order_line` | Write | Yes | A, M | S, As, MCP | Proposed |
| `submit_order` | Write | Yes | A, M | S, As, MCP | Proposed |
| `create_invoice_from_order` | Write | Yes | A, M | S, As, MCP | Proposed |
| `update_invoice_line` | Write | Yes | A, M | S, As, MCP | Proposed |
| `set_invoice_note` | Write | Yes | A, M | S, As, MCP | Proposed |
| `finalize_invoice` | Write | Yes | A | S | Proposed: a person's action only, never AI |
| `get_invoice_pdf` | Read | No | A, M | S, As, MCP | Proposed (the PDF function itself is proven) |
| `confirm_delivery_item` | Write | Yes | A, M | S | Proposed: on the phone at delivery |
| `record_delivery_signature` | Write | Yes | A, M | S | Proposed: the receiver signs; never AI |
| `list_invoice_layouts` | Read | No | A | S, As | Proposed |
| `set_customer_layout` | Write | Yes | A | S, As | Proposed |
| `apply_layout_to_all_customers` | Write | Yes, with the count of customers affected | A | S | Proposed |
| `invite_user` | Write | Yes | A | S | Proposed |

Proposed reasoning for the narrower rows: finalising, delivery and signatures, and
inviting people are the confirmations that matter (the "north star": people give the
confirmations that matter), so they stay on screens. Roles for member versus a future
driver role are to be confirmed.

---

## 6. Build order

Each phase ends when its checks pass, reported as pass, fail or not applicable after
actually running them.

**Phase 0: foundation (reuse the test's proven pieces)**

- Private repository; Supabase project on Pro; sign-ups off; Votel hosting with two
  environments if needed.
- Port: tenants and memberships, invite-only sign-in, the email hook, branding, the
  private buckets, `order-pdf` and `invoicePdf.ts`, the MCP function and catalog.
- Exit: the test's checks pass again on the new project (sign-in, isolation, PDF, MCP).

**Phase 1: data and screens**

- Customers, products, orders with lines; tenant from the subdomain; invitation function.
- Every action written as a catalog tool; screens call the tools.
- Exit: an admin and a member of one tenant manage customers, products and orders; a
  second tenant sees none of it; every screen action is a catalog tool.

**Phase 2: invoices and PDF**

- Invoice from order, manual edit and note, finalise and lock, live preview with the same
  layout code, layouts per tenant and customer, "apply to all customers", settings
  screen, logo upload with generated copies.
- Exit: an invoice is filled from an order, edited, previewed, finalised and cannot be
  edited after; the stored PDF matches the preview; a customer layout overrides the
  default; a reprint matches the original.

**Phase 3: delivery**

- Delivery checklist and signature on a phone; signature on the PDF.
- Exit: a delivery is confirmed item by item and signed on a phone; the signature cannot
  be read by another tenant or when signed out.

**Phase 4: AI assistant (level 1)**

- Typed assistant over the catalog tools; proposals shown for confirmation; `ai_runs`
  logging; OpenRouter behind `AiModel`.
- Exit: the first-pass checks in `CLAUDE.md` ("First pass"): English and Spanish requests
  produce correct proposals; nothing changes until confirmed; the AI key is not in the
  build or repository; signed-out callers are refused; a hidden instruction cannot cause
  an unconfirmed change; each run records model, tokens, cost and latency.

**Phase 5: MCP writes and connected apps**

- Write tools over MCP that return proposals confirmed in the app; "Connected apps"
  screen with revoke.
- Exit: a write over MCP changes nothing until confirmed; a user revokes an app and its
  next call is refused.

**Phase 6: printing, speech, white label**

- Automatic printing from the trial's result; speech input; per-business favicon, app
  icon and install manifest.
- Exit: an invoice prints two copies on LAMO's printer without anyone opening a print
  dialog; a spoken request gives the same proposal as typed; LAMO's app installs with its
  own icon and name.

---

## 7. Open questions and items carried from the test

| Item | Why it matters | Owner of the answer |
|---|---|---|
| Production sign-in email: Votel's `/api/emails/test` or a transactional provider (Resend) | Votel support was emailed 2026-11-15 (is the test endpoint supported for production; why template variables do not render on `/api/emails/send`; delivery status; open tracking; a send-only key). No answer yet | Votel support, then owner |
| Session length and inactivity timeout | Needs Pro. Drivers' phones can be shared or lost | Owner |
| Per-business favicon, app icon and install manifest from one static build | Not verified: whether browsers accept a manifest served from the Supabase domain for a page on the Votel domain, and how branding is shown before sign-in when today it is readable only by members | Spike early in phase 6, or sooner if white label is needed at launch |
| How a confirmation reaches the user when the caller is an outside agent | Needed for MCP write tools | Design in phase 5 |
| "Connected apps" screen | Users must see and revoke outside apps | Phase 5 |
| Wrong email API key gives a clear failure, logged without secrets | Not run in the test (unit test only); keys expire | Phase 0 |
| Log the email provider's reply, redacted, on every sign-in email | Votel's test endpoint leaves no trace in its own log | Phase 0 |
| Key rotation procedure and reminder | Neither Supabase nor Votel shows a stored key again | Phase 0 |
| Neutral answer when the one-code-per-minute limit is hit | The current message reveals that an address has an account | Phase 0 |
| Pin the host's build to the lockfile, or upload a tested `dist` | Votel's assistant once fell back to `npm install` | Phase 0 |
| OpenRouter account, first model, privacy settings | Before any real client data reaches a model | Owner, before phase 4 |
| A driver role | Delivery is done by drivers on phones | Owner, before phase 3 |
| Printing provider | Depends on the printing trial | Trial result |
| Dark-mode word mark corrected to "LAMO" | For dark backgrounds | Owner |
| For large tables, move the membership check into a `security definer` function or a JWT claim | Fine at LAMO's size; the documented next step if queries slow | Later |
