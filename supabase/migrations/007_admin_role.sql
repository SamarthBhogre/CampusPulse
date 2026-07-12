-- Migration: add admin role for the separate admin dashboard.
-- Run after 006_organizer_access_requests.sql.
--
-- This intentionally drops the known auto-generated role check name from the
-- original schema, then recreates it with admin included. It is safe to rerun.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'organizer', 'admin'));
