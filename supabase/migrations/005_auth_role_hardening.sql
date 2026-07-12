-- Migration: prevent self-service organizer escalation.
-- Run after 004_production_hardening.sql.

-- New auth users are always students. Organizer promotion must be done by a trusted
-- admin/service-role process, not by user-controlled signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Avoid allowing normal authenticated clients to update protected profile columns
-- such as role or email through direct Supabase calls.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
