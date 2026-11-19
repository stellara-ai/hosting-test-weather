-- The credit memo is never automatic (owner, 2026-11-19).
--
-- Problems at delivery (short, damaged, refused lines) are always recorded.
-- A credit memo is issued only when a member of the business (driver,
-- member or admin) chooses to issue it at the door; the client cannot.
-- Otherwise the problems wait for the office to decide, the delivery records
-- that no credit was issued (with an optional note), and the office alert
-- says so.

alter table public.deliveries
  add column credit_skipped boolean not null default false,
  add column no_credit_reason text constraint deliveries_no_credit_reason_length check (char_length(no_credit_reason) <= 200);

drop function public.record_delivery(uuid, text, text, jsonb, uuid, text, text, text);

create function public.record_delivery(
  p_order_id uuid,
  p_outcome text,
  p_check_mode text,
  p_lines jsonb,
  p_signer_id uuid,
  p_new_signer_name text,
  p_signature_path text,
  p_photo_path text,
  p_issue_credit boolean default false,
  p_no_credit_reason text default null
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
  v_missing_cents int := 0;
  v_no_credit_reason text := nullif(trim(p_no_credit_reason), '');
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
  v_no_credit_reason := coalesce(v_no_credit_reason, 'office to decide');

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
                                 signature_path, photo_path, recorded_by, credit_skipped, no_credit_reason)
  values (v_order.tenant_id, p_order_id, p_outcome,
          case when p_outcome in ('all_received', 'exceptions') then p_check_mode end,
          v_signer_id, v_signer_name, p_signature_path, p_photo_path, v_user,
          p_outcome = 'exceptions' and not coalesce(p_issue_credit, false),
          case when p_outcome = 'exceptions' and not coalesce(p_issue_credit, false) then v_no_credit_reason end)
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
      v_missing_cents := v_missing_cents + v_short * v_line.unit_price_cents;
    end if;
    -- The credit memo is optional: the problems are always recorded above,
    -- but the credit is issued only when the caller asks for it.
    if v_short > 0 and coalesce(p_issue_credit, false) then
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
  if p_outcome = 'exceptions' and v_memo_id is null then
    insert into public.office_alerts (tenant_id, kind, order_id, delivery_id, message)
    values (v_order.tenant_id, 'exceptions', p_order_id, v_delivery_id,
            format('Order %s was delivered with %s problem line(s) worth %s. No credit memo was issued (%s). Decide on a credit.',
                   v_order.number, v_exceptions, to_char(v_missing_cents / 100.0, 'FM$999,990.00'), v_no_credit_reason));
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
    'credit_memo_cents', v_memo_total,
    'credit_skipped', p_outcome = 'exceptions' and v_memo_id is null,
    'no_credit_reason', case when p_outcome = 'exceptions' and v_memo_id is null then v_no_credit_reason end,
    'missing_cents', v_missing_cents
  );
end;
$$;

revoke all on function public.record_delivery(uuid, text, text, jsonb, uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.record_delivery(uuid, text, text, jsonb, uuid, text, text, text, boolean, text) to authenticated;
