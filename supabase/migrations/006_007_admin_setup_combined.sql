-- Combined safe admin setup migration.
-- Use this if 006/007 were not applied yet or a previous attempt partially failed.

-- 1) Organizer request fields
alter table public.profiles
  add column if not exists organizer_request_status text not null default 'none';

alter table public.profiles
  add column if not exists organizer_requested_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_organizer_request_status_check;

alter table public.profiles
  add constraint profiles_organizer_request_status_check
  check (organizer_request_status in ('none', 'pending', 'approved', 'rejected'));

-- 2) Role check with admin support
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'organizer', 'admin'));

-- 3) Signup trigger: new users stay students, organizer choice becomes a pending request
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    organizer_request_status,
    organizer_requested_at
  )
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

-- 4) Keep protected columns admin/service-role controlled
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
