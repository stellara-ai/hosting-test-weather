-- Per-business invoice settings (owner, 2026-11-17): each optional field on the
-- invoice can be turned off by the business. Stored as JSON so settings can
-- be added without a migration each time.
--
-- Keys (all optional; a missing or invalid value takes the default):
--   showName, showAddress, showEmail, showPhone   true/false, the contact block
--   showDate, showShipDate                        true/false, beside the invoice number
--   showCopyLabels                                true/false, "Business copy" / "Client copy"
--   showPageNumbers                               true/false, "Page 1 of 2" in the footer
--   columns      list, left to right, from quantity, itemCode, description, unit,
--                priceEach, amount (description is always included)
--   tableLines   "columns" (default), "grid" or "none"
--   colorMode    "color" (default) or "blackAndWhite"
-- The invoice number, Bill To, Ship To, Description and the total always print.
-- See readInvoiceOptions in supabase/functions/_shared/invoicePdf.ts.
--
-- Read by the order-pdf function under the caller's own access (tenants are
-- readable by members). Changed only by an administrator in this test; an
-- admin settings screen is carried to the product.

alter table public.tenants
  add column invoice_settings jsonb not null default '{}'::jsonb
  constraint tenants_invoice_settings_object check (jsonb_typeof(invoice_settings) = 'object');
