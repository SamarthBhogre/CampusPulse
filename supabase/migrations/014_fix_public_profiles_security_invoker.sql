-- Migration 014: Fix public_profiles view SECURITY DEFINER → SECURITY INVOKER.
--
-- The view was originally created with (security_invoker = false), which makes
-- it run as the view creator (superuser), bypassing RLS for any caller.
-- Changing to security_invoker = true means Postgres evaluates RLS policies
-- of the querying user, which is the correct behaviour for a public-facing view.

drop view if exists public.public_profiles;

create view public.public_profiles
  with (security_invoker = true)
as
  select
    id,
    full_name,
    email,
    role
  from public.profiles;

-- Keep same grants as before
revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;
