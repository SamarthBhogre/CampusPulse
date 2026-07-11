-- Migration: Public/Private events + club membership

-- 1) Add visibility to events
alter table public.events add column if not exists visibility text not null default 'public' check (visibility in ('public', 'club_only'));

-- 2) Club members table
create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);
create index if not exists idx_members_club on public.club_members(club_id);
create index if not exists idx_members_profile on public.club_members(profile_id);

alter table public.club_members enable row level security;

drop policy if exists "members_read_all" on public.club_members;
create policy "members_read_all" on public.club_members for select to authenticated using (true);

drop policy if exists "members_self_insert" on public.club_members;
create policy "members_self_insert" on public.club_members for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "members_self_delete" on public.club_members;
create policy "members_self_delete" on public.club_members for delete to authenticated using (profile_id = auth.uid());

grant select, insert, delete on public.club_members to authenticated;

-- 3) Update events SELECT RLS: public events visible to everyone; club_only visible to creator or club members
drop policy if exists "events_read_all" on public.events;
drop policy if exists "events_read_anon" on public.events;
drop policy if exists "events_read_visibility" on public.events;

create policy "events_read_visibility" on public.events for select to authenticated using (
  visibility = 'public'
  or created_by = auth.uid()
  or (club_id is not null and exists (
    select 1 from public.club_members m
    where m.club_id = events.club_id and m.profile_id = auth.uid()
  ))
);

create policy "events_read_public_anon" on public.events for select to anon using (
  visibility = 'public'
);
