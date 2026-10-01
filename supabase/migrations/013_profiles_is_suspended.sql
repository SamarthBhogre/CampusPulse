-- Migration 013: Add is_suspended flag to profiles.
-- Required by admin user management (suspend/restore actions).

alter table public.profiles
  add column if not exists is_suspended boolean not null default false;

create index if not exists idx_profiles_is_suspended
  on public.profiles(is_suspended)
  where is_suspended = true;

comment on column public.profiles.is_suspended is
  'When true the account is suspended; enforce at app layer via middleware or RLS.';
