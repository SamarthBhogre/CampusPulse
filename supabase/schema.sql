-- Campus Pulse Database Schema
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

create extension if not exists pgcrypto;

-- ============ TABLES ============

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'organizer', 'admin')),
  organizer_request_status text not null default 'none' check (organizer_request_status in ('none', 'pending', 'approved', 'rejected')),
  organizer_requested_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  cover_image text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  description text,
  volunteers_needed int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  signed_up_at timestamptz not null default now(),
  unique (task_id, profile_id)
);

create index if not exists idx_events_starts_at on public.events(starts_at);
create index if not exists idx_tasks_event on public.tasks(event_id);
create index if not exists idx_signups_profile on public.volunteer_signups(profile_id);
create index if not exists idx_signups_event on public.volunteer_signups(event_id);

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, organizer_request_status, organizer_requested_at)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    'student',
    case when new.raw_user_meta_data->>'requested_role' = 'organizer' then 'pending' else 'none' end,
    case when new.raw_user_meta_data->>'requested_role' = 'organizer' then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ ROW LEVEL SECURITY ============

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.volunteer_signups enable row level security;

-- Profiles: everyone authenticated can read (needed to display organizer names, volunteer names)
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Clubs: everyone can read; only organizers create/update
drop policy if exists "clubs_read_all" on public.clubs;
create policy "clubs_read_all" on public.clubs
  for select to authenticated, anon using (true);

drop policy if exists "clubs_organizer_write" on public.clubs;
create policy "clubs_organizer_write" on public.clubs
  for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer'));

-- Events: everyone can read
drop policy if exists "events_read_all" on public.events;
create policy "events_read_all" on public.events
  for select to authenticated, anon using (true);

-- Events: organizers can insert (must set created_by = their id)
drop policy if exists "events_organizer_insert" on public.events;
create policy "events_organizer_insert" on public.events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer')
  );

-- Events: only creator can update/delete their event
drop policy if exists "events_creator_update" on public.events;
create policy "events_creator_update" on public.events
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "events_creator_delete" on public.events;
create policy "events_creator_delete" on public.events
  for delete to authenticated
  using (created_by = auth.uid());

-- Tasks: everyone can read
drop policy if exists "tasks_read_all" on public.tasks;
create policy "tasks_read_all" on public.tasks
  for select to authenticated, anon using (true);

-- Tasks: only event creator can insert/update/delete
drop policy if exists "tasks_creator_write" on public.tasks;
create policy "tasks_creator_write" on public.tasks
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid()));

-- Volunteer signups: authenticated users can read (organizers see who signed up, students see own)
drop policy if exists "signups_read_all" on public.volunteer_signups;
create policy "signups_read_all" on public.volunteer_signups
  for select to authenticated using (true);

-- Signups: user can only sign up as themselves
drop policy if exists "signups_self_insert" on public.volunteer_signups;
create policy "signups_self_insert" on public.volunteer_signups
  for insert to authenticated with check (profile_id = auth.uid());

-- Signups: user can only delete their own signup
drop policy if exists "signups_self_delete" on public.volunteer_signups;
create policy "signups_self_delete" on public.volunteer_signups
  for delete to authenticated using (profile_id = auth.uid());

-- Grants (Supabase defaults are usually fine but be explicit)
grant usage on schema public to anon, authenticated;
grant select on public.clubs, public.events, public.tasks to anon;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant all on public.clubs, public.events, public.tasks, public.volunteer_signups to authenticated;
