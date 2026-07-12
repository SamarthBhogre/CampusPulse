-- Migration: record organizer access requests without granting organizer role.
-- Run after 005_auth_role_hardening.sql.

alter table public.profiles
  add column if not exists organizer_request_status text not null default 'none';

alter table public.profiles
  add column if not exists organizer_requested_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_organizer_request_status_check;

alter table public.profiles
  add constraint profiles_organizer_request_status_check
  check (organizer_request_status in ('none', 'pending', 'approved', 'rejected'));

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

-- Keep protected columns admin/service-role controlled. Authenticated users can
-- still edit their display name through the existing column grant.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
