-- Tenants and memberships: the second lock of access control.
--
-- A tenant is one business. A membership links a user to a tenant with a
-- role. Every tenant-owned table added later carries a tenant_id, and its
-- row-level security is written against membership, as it is here for the
-- tenants table itself and for the files in the tenant-assets bucket.
--
-- As with notes, this migration does not rely on the project's automatic
-- RLS or table-exposure settings: it enables RLS and grants explicitly.
--
-- The app only reads these tables. Tenants and memberships are created by
-- an administrator (SQL or the dashboard in this test; an invitation
-- function in the product), so there are no insert, update or delete
-- grants or policies for app users.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique constraint tenants_slug_format check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null constraint tenants_name_length check (char_length(name) between 1 and 80),
  -- Path of the logo or word mark inside the tenant-assets bucket, or null.
  logo_path text,
  primary_color text not null constraint tenants_primary_color_hex check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text not null constraint tenants_accent_color_hex check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' constraint memberships_role check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;

revoke all on table public.tenants from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;
grant select on table public.tenants to authenticated;
grant select on table public.memberships to authenticated;

create policy "Users can view their own memberships"
on public.memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

-- The subquery runs under the caller's own rights, so it only ever sees the
-- caller's memberships (the policy above). A user with no membership gets
-- no tenants.
create policy "Members can view their tenants"
on public.tenants
for select
to authenticated
using (
  id in (
    select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())
  )
);

-- Files that belong to a tenant: logos now, signatures and PDFs later.
-- The bucket is private. The first folder of every path is the tenant id,
-- and only members of that tenant can read. Nobody can write from the app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-assets',
  'tenant-assets',
  false,
  1048576,
  array['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "Members can read their tenant's files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] in (
    select m.tenant_id::text from public.memberships m where m.user_id = (select auth.uid())
  )
);

-- Two test tenants with placeholder branding. LAMO's real logo and colours
-- replace the placeholders when the owner supplies them. Tenant B exists
-- only to prove that tenants are kept apart.
insert into public.tenants (id, slug, name, logo_path, primary_color, accent_color)
values
  (
    '602b710a-021a-44c6-962f-d78874172a94',
    'lamo',
    'LAMO Distributor',
    '602b710a-021a-44c6-962f-d78874172a94/logo.svg',
    '#166534',
    '#9a3412'
  ),
  (
    '60b4aba2-d386-4b41-95f3-7d677932647b',
    'tenant-b',
    'Tenant B (test)',
    '60b4aba2-d386-4b41-95f3-7d677932647b/logo.svg',
    '#6d28d9',
    '#be185d'
  );
