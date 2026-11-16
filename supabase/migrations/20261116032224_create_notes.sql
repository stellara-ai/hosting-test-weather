-- Notes: each signed-in user can read, add and delete only their own rows.
--
-- This project has "Automatically expose new tables" turned off and
-- "Enable automatic RLS" turned on. The migration does not rely on either:
-- it enables row-level security itself and grants exactly the privileges
-- the app uses.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null constraint notes_body_length check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index notes_user_id_created_at_idx on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

-- Start from nothing, then grant only what the app does. Signed-out callers
-- (anon) get no access. The app never edits a note, so there is no update
-- grant and no update policy.
revoke all on table public.notes from anon, authenticated;
grant select, insert, delete on table public.notes to authenticated;

create policy "Users can view their own notes"
on public.notes
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own notes"
on public.notes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own notes"
on public.notes
for delete
to authenticated
using ((select auth.uid()) = user_id);
