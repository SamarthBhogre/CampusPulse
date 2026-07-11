-- Migration: add event_rsvps table for the "I'm attending" flow
-- (separates attendees from volunteers)

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create index if not exists idx_rsvps_event on public.event_rsvps(event_id);
create index if not exists idx_rsvps_profile on public.event_rsvps(profile_id);

alter table public.event_rsvps enable row level security;

drop policy if exists "rsvps_read_all" on public.event_rsvps;
create policy "rsvps_read_all" on public.event_rsvps
  for select to authenticated using (true);

drop policy if exists "rsvps_self_insert" on public.event_rsvps;
create policy "rsvps_self_insert" on public.event_rsvps
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "rsvps_self_delete" on public.event_rsvps;
create policy "rsvps_self_delete" on public.event_rsvps
  for delete to authenticated using (profile_id = auth.uid());

grant select, insert, delete on public.event_rsvps to authenticated;
