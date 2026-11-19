-- Delivery confirmation and signatures (stage three, signatures spike).
--
-- Proves what is still unproven on the stack: a user uploading a file (the
-- signature, or a photo of the paper copy) from a phone into private storage,
-- under access rules, and one all-or-nothing save that records the delivery,
-- the per-line outcome, any credit memo and an office alert.
--
-- Decisions (owner, 2026-11-19):
-- - Any member of the business records deliveries: admin, member or driver.
-- - Each customer (client) has its own list of approved signers.
-- - Someone not on the list may sign by typing their name. They are added to
--   the list automatically, marked "added at delivery", and the office is
--   alerted.
-- - The receiver may confirm everything at once, check lines one by one, or
--   "select all" and untick problem lines. Unchecked lines are short, damaged
--   or refused, and produce a credit memo. "Can't check now" and "signed on
--   paper" are also recorded. An issued invoice is never edited.
--
-- Tables are read-only to the app. All writes go through record_delivery()
-- and resolve_office_alert(), which check membership themselves.

-- Drivers are members of the business too.
alter table public.memberships drop constraint memberships_role;
alter table public.memberships
  add constraint memberships_role check (role in ('admin', 'member', 'driver'));

-- Customers (clients) of a business. The orders seeded earlier stored the
-- customer only as text; they are linked to customer rows below.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null constraint customers_name_length check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

alter table public.orders
  add column customer_id uuid,
  add column status text not null default 'issued'
    constraint orders_status check (status in ('draft', 'issued', 'delivered', 'paid', 'void')),
  add constraint orders_customer_fk foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id);

-- The people a customer allows to sign for deliveries.
create table public.customer_signers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  name text not null constraint customer_signers_name_length check (char_length(trim(name)) between 2 and 80),
  added_at_delivery boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);
create unique index customer_signers_name_unique on public.customer_signers (customer_id, lower(trim(name)));

-- One delivery record per order.
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null unique,
  outcome text not null constraint deliveries_outcome check (
    outcome in ('all_received', 'exceptions', 'not_checked', 'signed_on_paper')
  ),
  -- How the receiver confirmed the lines: skipped the list, checked one by
  -- one, or selected all and unticked problems. Null when not checked.
  check_mode text constraint deliveries_check_mode check (check_mode in ('skipped', 'one_by_one', 'select_all')),
  signer_id uuid,
  signer_name text,
  signature_path text,
  photo_path text,
  recorded_by uuid not null references auth.users (id),
  recorded_at timestamptz not null default now(),
  foreign key (order_id, tenant_id) references public.orders (id, tenant_id) on delete cascade,
  foreign key (signer_id, tenant_id) references public.customer_signers (id, tenant_id),
  unique (id, tenant_id)
);

create table public.delivery_lines (
  delivery_id uuid not null,
  order_line_id uuid not null references public.order_lines (id) on delete cascade,
  tenant_id uuid not null,
  status text not null constraint delivery_lines_status check (status in ('delivered', 'short', 'damaged', 'refused')),
  delivered_quantity int not null constraint delivery_lines_quantity check (delivered_quantity >= 0),
  reason text constraint delivery_lines_reason_length check (char_length(reason) <= 200),
  primary key (delivery_id, order_line_id),
  foreign key (delivery_id, tenant_id) references public.deliveries (id, tenant_id) on delete cascade
);

create table public.credit_memos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  delivery_id uuid not null,
  number text not null,
  total_cents int not null constraint credit_memos_total check (total_cents > 0),
  created_at timestamptz not null default now(),
  foreign key (order_id, tenant_id) references public.orders (id, tenant_id) on delete cascade,
  foreign key (delivery_id, tenant_id) references public.deliveries (id, tenant_id) on delete cascade,
  unique (tenant_id, number),
  unique (id, tenant_id)
);

create table public.credit_memo_lines (
  credit_memo_id uuid not null,
  order_line_id uuid not null references public.order_lines (id) on delete cascade,
  tenant_id uuid not null,
  quantity int not null constraint credit_memo_lines_quantity check (quantity > 0),
  unit_price_cents int not null,
  amount_cents int not null,
  reason text not null,
  primary key (credit_memo_id, order_line_id),
  foreign key (credit_memo_id, tenant_id) references public.credit_memos (id, tenant_id) on delete cascade
);

-- Things the office should look at: a new signer added at the door, a
-- delivery signed without checking, or a delivery with exceptions.
create table public.office_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null constraint office_alerts_kind check (kind in ('new_signer', 'not_checked', 'exceptions')),
  order_id uuid,
  delivery_id uuid,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);

create index customers_tenant_idx on public.customers (tenant_id);
create index customer_signers_customer_idx on public.customer_signers (customer_id);
create index deliveries_tenant_idx on public.deliveries (tenant_id);
create index credit_memos_order_idx on public.credit_memos (order_id);
create index office_alerts_open_idx on public.office_alerts (tenant_id) where resolved_at is null;

-- Row-level security: members read their own business's rows. No direct
-- writes from the app.
do $$
declare
  t text;
begin
  foreach t in array array['customers', 'customer_signers', 'deliveries', 'delivery_lines',
                           'credit_memos', 'credit_memo_lines', 'office_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format(
      'create policy "Members can view their tenant''s %s" on public.%I for select to authenticated using (
         tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
       )', replace(t, '_', ' '), t);
  end loop;
end $$;

-- Signatures and photos of signed paper copies. Private. The first folder of
-- every path is the tenant id, the second the order id. Members may add files
-- to their own business's folder and read them; nobody may replace or delete
-- (no update or delete policy), so a signature cannot be swapped later.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Members can add delivery proofs for their tenant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'delivery-proofs'
  and (storage.foldername(name))[1] in (
    select m.tenant_id::text from public.memberships m where m.user_id = (select auth.uid())
  )
);

create policy "Members can read their tenant's delivery proofs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'delivery-proofs'
  and (storage.foldername(name))[1] in (
    select m.tenant_id::text from public.memberships m where m.user_id = (select auth.uid())
  )
);

-- Records a delivery in one transaction. Runs with the definer's rights so it
-- can write, and therefore checks everything itself: the caller is a member
-- of the order's business, the order is issued and not yet delivered, the
-- lines belong to the order, the signer belongs to the order's customer, and
-- the uploaded files exist in the business's folder for this order.
--
-- p_lines: [{ "order_line_id": uuid, "status": "delivered|short|damaged|refused",
--             "delivered_quantity": int, "reason": text }] for outcome
--          'exceptions' (lines not listed count as delivered); ignored otherwise.
create or replace function public.record_delivery(
  p_order_id uuid,
  p_outcome text,
  p_check_mode text,
  p_lines jsonb,
  p_signer_id uuid,
  p_new_signer_name text,
  p_signature_path text,
  p_photo_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_customer_name text;
  v_signer_id uuid;
  v_signer_name text;
  v_delivery_id uuid;
  v_memo_id uuid;
  v_memo_total int := 0;
  v_line record;
  v_input jsonb;
  v_status text;
  v_delivered int;
  v_reason text;
  v_short int;
  v_prefix text;
  v_exceptions int := 0;
begin
  if v_user is null then
    raise exception 'Sign in to record a delivery' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not exists (
    select 1 from public.memberships m where m.user_id = v_user and m.tenant_id = v_order.tenant_id
  ) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'issued' or exists (select 1 from public.deliveries d where d.order_id = p_order_id) then
    raise exception 'This order''s delivery is already recorded' using errcode = '23505';
  end if;
  if p_outcome not in ('all_received', 'exceptions', 'not_checked', 'signed_on_paper') then
    raise exception 'Unknown outcome' using errcode = '22023';
  end if;

  v_prefix := v_order.tenant_id::text || '/' || p_order_id::text || '/';

  -- Files must have been uploaded to this business's folder for this order.
  if p_outcome <> 'signed_on_paper' then
    if p_signature_path is null or left(p_signature_path, length(v_prefix)) <> v_prefix
       or not exists (select 1 from storage.objects o where o.bucket_id = 'delivery-proofs' and o.name = p_signature_path) then
      raise exception 'The signature was not uploaded' using errcode = '22023';
    end if;
  end if;
  if p_photo_path is not null and (left(p_photo_path, length(v_prefix)) <> v_prefix
     or not exists (select 1 from storage.objects o where o.bucket_id = 'delivery-proofs' and o.name = p_photo_path)) then
    raise exception 'The photo was not uploaded' using errcode = '22023';
  end if;

  -- Who signed: an approved signer of this customer, or a new name, which is
  -- added to the customer's list and reported to the office.
  if p_outcome <> 'signed_on_paper' then
    if p_signer_id is not null then
      select s.id, s.name into v_signer_id, v_signer_name
      from public.customer_signers s
      where s.id = p_signer_id and s.customer_id = v_order.customer_id;
      if not found then
        raise exception 'That signer is not on this customer''s list' using errcode = '22023';
      end if;
    elsif p_new_signer_name is not null and char_length(trim(p_new_signer_name)) >= 2 then
      v_signer_name := trim(p_new_signer_name);
      select s.id into v_signer_id from public.customer_signers s
      where s.customer_id = v_order.customer_id and lower(trim(s.name)) = lower(v_signer_name);
      if v_signer_id is null then
        insert into public.customer_signers (tenant_id, customer_id, name, added_at_delivery, created_by)
        values (v_order.tenant_id, v_order.customer_id, v_signer_name, true, v_user)
        returning id into v_signer_id;
        select c.name into v_customer_name from public.customers c where c.id = v_order.customer_id;
        insert into public.office_alerts (tenant_id, kind, order_id, message)
        values (v_order.tenant_id, 'new_signer', p_order_id,
                format('%s signed for order %s and was added to %s''s approved signers.',
                       v_signer_name, v_order.number, coalesce(v_customer_name, 'the customer')));
      end if;
    else
      raise exception 'Choose who is signing' using errcode = '22023';
    end if;
  end if;

  insert into public.deliveries (tenant_id, order_id, outcome, check_mode, signer_id, signer_name,
                                 signature_path, photo_path, recorded_by)
  values (v_order.tenant_id, p_order_id, p_outcome,
          case when p_outcome in ('all_received', 'exceptions') then p_check_mode end,
          v_signer_id, v_signer_name, p_signature_path, p_photo_path, v_user)
  returning id into v_delivery_id;

  -- Per-line outcome. Every line starts as delivered in full.
  for v_line in
    select l.id, l.quantity, l.unit_price_cents from public.order_lines l where l.order_id = p_order_id
  loop
    v_status := 'delivered';
    v_delivered := v_line.quantity;
    v_reason := null;
    v_input := null;
    if p_outcome = 'exceptions' then
      select e into v_input from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
      where e->>'order_line_id' = v_line.id::text limit 1;
      if v_input is not null then
        v_status := coalesce(v_input->>'status', 'delivered');
        if v_status not in ('delivered', 'short', 'damaged', 'refused') then
          raise exception 'Unknown line status' using errcode = '22023';
        end if;
        v_reason := nullif(trim(v_input->>'reason'), '');
        v_delivered := case v_status
          when 'delivered' then v_line.quantity
          when 'short' then coalesce((v_input->>'delivered_quantity')::int, 0)
          else 0 end;
        if v_delivered < 0 or v_delivered > v_line.quantity or (v_status = 'short' and v_delivered = v_line.quantity) then
          raise exception 'A short line needs a quantity below the ordered quantity' using errcode = '22023';
        end if;
      end if;
    end if;

    if p_outcome in ('all_received', 'exceptions') then
      insert into public.delivery_lines (delivery_id, order_line_id, tenant_id, status, delivered_quantity, reason)
      values (v_delivery_id, v_line.id, v_order.tenant_id, v_status, v_delivered, v_reason);
    end if;

    v_short := v_line.quantity - v_delivered;
    if v_short > 0 then
      v_exceptions := v_exceptions + 1;
      if v_memo_id is null then
        insert into public.credit_memos (tenant_id, order_id, delivery_id, number, total_cents)
        values (v_order.tenant_id, p_order_id, v_delivery_id, 'CM-' || v_order.number, 1)
        returning id into v_memo_id;
      end if;
      insert into public.credit_memo_lines (credit_memo_id, order_line_id, tenant_id, quantity, unit_price_cents, amount_cents, reason)
      values (v_memo_id, v_line.id, v_order.tenant_id, v_short, v_line.unit_price_cents,
              v_short * v_line.unit_price_cents, coalesce(v_reason, v_status));
      v_memo_total := v_memo_total + v_short * v_line.unit_price_cents;
    end if;
  end loop;

  if p_outcome = 'exceptions' and v_exceptions = 0 then
    raise exception 'Mark at least one line as short, damaged or refused' using errcode = '22023';
  end if;
  if v_memo_id is not null then
    update public.credit_memos set total_cents = v_memo_total where id = v_memo_id;
    insert into public.office_alerts (tenant_id, kind, order_id, delivery_id, message)
    values (v_order.tenant_id, 'exceptions', p_order_id, v_delivery_id,
            format('Order %s was delivered with %s problem line(s); credit memo CM-%s for %s.',
                   v_order.number, v_exceptions, v_order.number, to_char(v_memo_total / 100.0, 'FM$999,990.00')));
  end if;
  if p_outcome = 'not_checked' then
    insert into public.office_alerts (tenant_id, kind, order_id, delivery_id, message)
    values (v_order.tenant_id, 'not_checked', p_order_id, v_delivery_id,
            format('Order %s was signed as received but not checked. Follow up with the customer.', v_order.number));
  end if;

  update public.orders set status = 'delivered' where id = p_order_id;

  return jsonb_build_object(
    'delivery_id', v_delivery_id,
    'outcome', p_outcome,
    'signer_name', v_signer_name,
    'credit_memo_number', case when v_memo_id is not null then 'CM-' || v_order.number end,
    'credit_memo_cents', v_memo_total
  );
end;
$$;

-- Marks an office alert as handled. Admins of the business only.
create or replace function public.resolve_office_alert(p_alert_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.office_alerts a
  set resolved_at = now(), resolved_by = (select auth.uid())
  where a.id = p_alert_id
    and a.resolved_at is null
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid()) and m.tenant_id = a.tenant_id and m.role = 'admin'
    );
  if not found then
    raise exception 'Alert not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.record_delivery(uuid, text, text, jsonb, uuid, text, text, text) from public, anon;
grant execute on function public.record_delivery(uuid, text, text, jsonb, uuid, text, text, text) to authenticated;
revoke all on function public.resolve_office_alert(uuid) from public, anon;
grant execute on function public.resolve_office_alert(uuid) to authenticated;

-- Seed: customers for the existing orders, and a few approved signers. All
-- invented. Order 1001 keeps its sample signature for the PDF but is reset
-- to "issued" with no delivery, so the flow can be tried on it.
insert into public.customers (id, tenant_id, name) values
  ('c0000000-0000-4000-8000-000000000001', '602b710a-021a-44c6-962f-d78874172a94', 'Sunrise Medical Center (test)'),
  ('c0000000-0000-4000-8000-000000000002', '602b710a-021a-44c6-962f-d78874172a94', 'Café Miramar (test)'),
  ('c0000000-0000-4000-8000-000000000003', '60b4aba2-d386-4b41-95f3-7d677932647b', 'Tenant B test customer');

update public.orders set customer_id = 'c0000000-0000-4000-8000-000000000001' where id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01';
update public.orders set customer_id = 'c0000000-0000-4000-8000-000000000002' where id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02';
update public.orders set customer_id = 'c0000000-0000-4000-8000-000000000003' where id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';

insert into public.customer_signers (tenant_id, customer_id, name) values
  ('602b710a-021a-44c6-962f-d78874172a94', 'c0000000-0000-4000-8000-000000000001', 'Maria Lopez (test)'),
  ('602b710a-021a-44c6-962f-d78874172a94', 'c0000000-0000-4000-8000-000000000001', 'James Carter (test)'),
  ('602b710a-021a-44c6-962f-d78874172a94', 'c0000000-0000-4000-8000-000000000002', 'Ana Ruiz (test)'),
  ('60b4aba2-d386-4b41-95f3-7d677932647b', 'c0000000-0000-4000-8000-000000000003', 'Test Receiver');

-- Every order now has a customer.
alter table public.orders alter column customer_id set not null;
