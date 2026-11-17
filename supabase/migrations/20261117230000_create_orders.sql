-- Orders for the stage three spikes (Part C, the PDF; Part F, the MCP server).
--
-- Seeded only: there is no order-entry screen, and the app only reads these
-- tables. Every row carries a tenant_id and row-level security is written
-- against membership, as for tenants in the previous migration. RLS and
-- grants are stated explicitly rather than relying on project settings.
--
-- Also here:
-- - the private tenant-documents bucket for generated PDFs, readable only by
--   the tenant's members and written only by the order-pdf Edge Function;
-- - LAMO's real word mark and brand colours, and PNG logos for both tenants
--   (the PDF library embeds PNG or JPG, not SVG).

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  number text not null constraint orders_number_length check (char_length(number) between 1 and 20),
  customer_name text not null constraint orders_customer_name_length check (char_length(customer_name) between 1 and 120),
  ordered_on date not null,
  -- Path of the delivery signature inside the tenant-assets bucket, or null.
  signature_path text,
  created_at timestamptz not null default now(),
  unique (tenant_id, number),
  -- Lets order_lines prove that a line belongs to the same tenant as its order.
  unique (id, tenant_id)
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  tenant_id uuid not null,
  position int not null constraint order_lines_position_positive check (position > 0),
  product text not null constraint order_lines_product_length check (char_length(product) between 1 and 120),
  unit text not null constraint order_lines_unit_length check (char_length(unit) between 1 and 20),
  quantity int not null constraint order_lines_quantity_positive check (quantity > 0),
  unit_price_cents int not null constraint order_lines_price_not_negative check (unit_price_cents >= 0),
  unique (order_id, position),
  foreign key (order_id, tenant_id) references public.orders (id, tenant_id) on delete cascade
);

create index orders_tenant_id_idx on public.orders (tenant_id);
create index order_lines_tenant_id_idx on public.order_lines (tenant_id);

alter table public.orders enable row level security;
alter table public.order_lines enable row level security;

revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_lines from anon, authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_lines to authenticated;

create policy "Members can view their tenant's orders"
on public.orders
for select
to authenticated
using (
  tenant_id in (
    select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())
  )
);

create policy "Members can view their tenant's order lines"
on public.order_lines
for select
to authenticated
using (
  tenant_id in (
    select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())
  )
);

-- Generated documents. Private; the first folder of every path is the tenant
-- id. Members can read their own tenant's files. Nobody writes from the app:
-- the order-pdf function stores files with the secret key after checking,
-- under the caller's own rights, that the caller can read the order.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-documents', 'tenant-documents', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "Members can read their tenant's documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tenant-documents'
  and (storage.foldername(name))[1] in (
    select m.tenant_id::text from public.memberships m where m.user_id = (select auth.uid())
  )
);

-- Branding. LAMO: the owner's light-mode word mark and the brand board's
-- Warm Brown (primary) and Leaf Green (accent); both pass contrast on white.
-- Tenant B keeps its placeholder, now as PNG. The files are uploaded to
-- tenant-assets before this migration is applied.
update public.tenants
set logo_path = '602b710a-021a-44c6-962f-d78874172a94/wordmark-light.png',
    primary_color = '#521F12',
    accent_color = '#527A38'
where id = '602b710a-021a-44c6-962f-d78874172a94';

update public.tenants
set logo_path = '60b4aba2-d386-4b41-95f3-7d677932647b/logo.png'
where id = '60b4aba2-d386-4b41-95f3-7d677932647b';

-- Seed orders: two for LAMO (one with a sample delivery signature), one for
-- Tenant B to prove isolation. Customers, products and prices are invented.
insert into public.orders (id, tenant_id, number, customer_name, ordered_on, signature_path)
values
  (
    '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01',
    '602b710a-021a-44c6-962f-d78874172a94',
    '1001',
    'Bodega La Esquina',
    '2026-11-16',
    '602b710a-021a-44c6-962f-d78874172a94/signatures/sample-signature.png'
  ),
  (
    '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02',
    '602b710a-021a-44c6-962f-d78874172a94',
    '1002',
    'Café Miramar',
    '2026-11-17',
    null
  ),
  (
    '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01',
    '60b4aba2-d386-4b41-95f3-7d677932647b',
    'B-1',
    'Tenant B test customer',
    '2026-11-17',
    null
  );

insert into public.order_lines (order_id, tenant_id, position, product, unit, quantity, unit_price_cents)
values
  ('0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01', '602b710a-021a-44c6-962f-d78874172a94', 1, 'Bananas', 'case', 4, 2450),
  ('0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01', '602b710a-021a-44c6-962f-d78874172a94', 2, 'Carrots, 25 lb', 'bag', 2, 1875),
  ('0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01', '602b710a-021a-44c6-962f-d78874172a94', 3, 'Guava pastries, dozen', 'tray', 6, 1500),
  ('0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01', '602b710a-021a-44c6-962f-d78874172a94', 4, 'Cuban bread', 'loaf', 20, 325),
  ('0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02', '602b710a-021a-44c6-962f-d78874172a94', 1, 'Croissants, dozen', 'tray', 3, 1650),
  ('0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02', '602b710a-021a-44c6-962f-d78874172a94', 2, 'Bananas', 'case', 2, 2450),
  ('7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01', '60b4aba2-d386-4b41-95f3-7d677932647b', 1, 'Test item', 'each', 1, 100);
