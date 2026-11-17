-- Invoice fields to match the layout of LAMO's sample invoices (owner, 2026-11-17):
-- the business's contact block, Bill To and Ship To with name and address, the
-- ship date, and an item code on every line.
--
-- The tenant's real contact details are not written here (this repository is
-- public). They are set directly in the database; until then the invoice
-- prints the tenant name alone.

alter table public.tenants
  add column address text constraint tenants_address_length check (char_length(address) <= 300),
  add column email text constraint tenants_email_length check (char_length(email) <= 120),
  add column phone text constraint tenants_phone_length check (char_length(phone) <= 40);

alter table public.orders
  add column bill_to_address text constraint orders_bill_to_address_length check (char_length(bill_to_address) <= 300),
  add column ship_to_name text constraint orders_ship_to_name_length check (char_length(ship_to_name) <= 120),
  add column ship_to_address text constraint orders_ship_to_address_length check (char_length(ship_to_address) <= 300),
  add column shipped_on date;

alter table public.order_lines
  add column item_code text constraint order_lines_item_code_length check (char_length(item_code) <= 30);

-- Seed data, all invented. Order 1001 gets a full page of lines to test how
-- many fit; 1002 ships to a different address than it bills.
update public.orders
set customer_name = 'Sunrise Medical Center (test)',
    bill_to_address = E'100 Example Ave\nMiami, FL 33101',
    ship_to_name = 'Sunrise Medical Center - Kitchen',
    ship_to_address = E'100 Example Ave, Dock 2\nMiami, FL 33101',
    shipped_on = '2026-11-16'
where id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01';

update public.orders
set customer_name = 'Café Miramar (test)',
    bill_to_address = E'PO Box 0000\nCoral Gables, FL 33134',
    ship_to_name = 'Café Miramar',
    ship_to_address = E'25 Sample Blvd\nCoral Gables, FL 33134',
    shipped_on = '2026-11-18'
where id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02';

update public.orders
set bill_to_address = E'1 Test Street\nTestville, FL 30000',
    ship_to_name = 'Tenant B test customer',
    ship_to_address = E'1 Test Street\nTestville, FL 30000',
    shipped_on = '2026-11-17'
where id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';

delete from public.order_lines where order_id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01';

insert into public.order_lines (order_id, tenant_id, position, item_code, product, unit, quantity, unit_price_cents)
select
  '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e01',
  '602b710a-021a-44c6-962f-d78874172a94',
  v.position, v.item_code, v.product, v.unit, v.quantity, v.unit_price_cents
from (values
  (1, 'P BLU', 'BLUEBERRIES 12/6 OZ', 'case', 2, 3998),
  (2, 'P STR', 'STRAWBERRIES 8/1 LB', 'case', 2, 2200),
  (3, 'P ROM', 'ROMAINE HEARTS 3 CT', 'case', 1, 5990),
  (4, 'P CAR', 'CARROTS JUMBO 50 LB', 'bag', 1, 3600),
  (5, 'P ONY', 'ONIONS YELLOW MEDIUM 50 LB', 'bag', 1, 3200),
  (6, 'P RPP', 'PEPPERS RED 11 LB', 'case', 1, 4500),
  (7, 'P GPP', 'PEPPERS GREEN 25 LB', 'case', 1, 3200),
  (8, 'P TOM', 'TOMATOES VINE RIPE 25 LB', 'case', 1, 4900),
  (9, 'P TCH', 'TOMATOES CHERRY 12 PK', 'case', 1, 2900),
  (10, 'P CUC', 'CUCUMBERS EUROPEAN 12 CT', 'case', 1, 1400),
  (11, 'P ZUC', 'SQUASH ZUCCHINI MEDIUM 20 LB', 'case', 2, 2390),
  (12, 'P YSQ', 'SQUASH YELLOW MEDIUM 20 LB', 'case', 2, 2200),
  (13, 'P GRB', 'GRAPES BLACK SEEDLESS 18 LB', 'case', 1, 5999),
  (14, 'P CAN', 'CANTALOUPE 12 CT', 'case', 1, 5200),
  (15, 'P HDW', 'HONEYDEW 6 CT', 'case', 1, 4950),
  (16, 'P BAN', 'BANANAS GREEN TIP 40 LB', 'case', 1, 2400),
  (17, 'P PYG', 'POTATOES YUKON GOLD 50 LB', 'bag', 1, 2800),
  (18, 'P BRC', 'BROCCOLI CROWNS 20 LB', 'case', 1, 5400),
  (19, 'P CLF', 'CAULIFLOWER 12 CT', 'case', 1, 4890),
  (20, 'B CUB', 'CUBAN BREAD LOAF', 'each', 20, 325),
  (21, 'B GUA', 'GUAVA PASTRIES DOZEN', 'tray', 6, 1500)
) as v (position, item_code, product, unit, quantity, unit_price_cents);

update public.order_lines set item_code = 'B CRO' where order_id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02' and position = 1;
update public.order_lines set item_code = 'P BAN' where order_id = '0e5f3c1a-8b4d-4c2e-9f61-2a7d5b8c9e02' and position = 2;
update public.order_lines set item_code = 'T-1' where order_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
