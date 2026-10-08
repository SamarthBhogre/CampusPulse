-- Migration 019: require usernames for every profile.
-- Run after 018_organizer_application_details.sql.

-- Backfill existing profiles before enforcing NOT NULL. The generated values
-- are stable, lowercase, valid usernames and remain editable in Settings.
do $$
declare
  profile_row record;
  base_username text;
  candidate text;
  suffix integer;
begin
  for profile_row in
    select id, full_name, email
    from public.profiles
    where username is null or trim(username) = ''
    order by created_at, id
  loop
    base_username := lower(regexp_replace(
      coalesce(nullif(trim(profile_row.full_name), ''), split_part(profile_row.email, '@', 1), 'user'),
      '[^a-z0-9]+', '_', 'g'
    ));
    base_username := trim(both '_' from base_username);
    if length(base_username) < 3 then base_username := 'user_' || left(replace(profile_row.id::text, '-', ''), 8); end if;
    base_username := left(base_username, 30);
    candidate := base_username;
    suffix := 1;

    while exists (select 1 from public.profiles p where lower(p.username) = lower(candidate) and p.id <> profile_row.id) loop
      candidate := left(base_username, 30 - length(suffix::text) - 1) || '_' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.profiles set username = candidate where id = profile_row.id;
  end loop;
end $$;

alter table public.profiles
  alter column username set not null;

comment on column public.profiles.username is
  'Required unique username, stored lowercase and validated case-insensitively.';

-- New Auth users must provide a valid username in user metadata. Keep the
-- organizer application fields from migration 018 in the profile trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_username text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
begin
  if requested_username = '' then
    raise exception 'Username is required';
  end if;
  if length(requested_username) < 3 or length(requested_username) > 30 then
    raise exception 'Username must be between 3 and 30 characters';
  end if;
  if requested_username !~ '^[a-z0-9_.-]+$' then
    raise exception 'Username can only contain letters, numbers, underscores, hyphens, and periods';
  end if;
  if exists (select 1 from public.profiles where lower(username) = requested_username) then
    raise exception 'Username is already taken';
  end if;

  insert into public.profiles (
    id, email, full_name, username, role, organizer_request_status, organizer_requested_at,
    organizer_org_name, organizer_org_type, organizer_org_website,
    organizer_org_description, organizer_experience
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    requested_username,
    'student',
    case when new.raw_user_meta_data->>'requested_role' = 'organizer' then 'pending' else 'none' end,
    case when new.raw_user_meta_data->>'requested_role' = 'organizer' then now() else null end,
    nullif(trim(new.raw_user_meta_data->>'organizer_org_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'organizer_org_type'), ''),
    nullif(trim(new.raw_user_meta_data->>'organizer_org_website'), ''),
    nullif(trim(new.raw_user_meta_data->>'organizer_org_description'), ''),
    nullif(trim(new.raw_user_meta_data->>'organizer_experience'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Direct profile updates also cannot clear a username.
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and username is not null
    and role = (select role from public.profiles where id = auth.uid())
    and (is_suspended = (select is_suspended from public.profiles where id = auth.uid())
         or is_suspended is null)
  );

-- Username clearing is no longer permitted after the required-username rollout.
create or replace function public.clear_own_username()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Username is required and cannot be cleared';
end;
$$;
