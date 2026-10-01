-- Migration 015: Username field, public_profiles privacy fix,
--                event moderation status enforcement, notification read state.
-- Run after 014_fix_public_profiles_security_invoker.sql

-- ============================================================
-- 1) Add username column to profiles
-- ============================================================
alter table public.profiles
  add column if not exists username text;

-- Unique, case-insensitive (stored lowercase)
create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;

comment on column public.profiles.username is
  'Optional unique username. Stored as entered, uniqueness enforced case-insensitively.';

-- ============================================================
-- 2) Add avatar_url to profiles for profile photos
-- ============================================================
alter table public.profiles
  add column if not exists avatar_url text;

-- ============================================================
-- 3) Fix public_profiles view — remove email column
--    (email must never be publicly readable)
-- ============================================================
drop view if exists public.public_profiles;

create view public.public_profiles
  with (security_invoker = true)
as
  select
    id,
    full_name,
    username,
    avatar_url,
    role
  from public.profiles;

revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

-- ============================================================
-- 4) Add read/unread state to notification_queue
-- ============================================================
alter table public.notification_queue
  add column if not exists read_at timestamptz;

comment on column public.notification_queue.read_at is
  'Timestamp when the user marked this notification as read. NULL = unread.';

-- ============================================================
-- 5) Settings/profile API endpoint RLS
--    Allow users to update their own full_name, username, avatar_url
-- ============================================================
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Prevent self-escalation of role or suspension
    and role = (select role from public.profiles where id = auth.uid())
    and (is_suspended = (select is_suspended from public.profiles where id = auth.uid())
         or is_suspended is null)
  );

-- ============================================================
-- 6) Update get_events_page RPC to filter out non-active events
--    (hidden/cancelled events must not appear in public discovery)
-- ============================================================
create or replace function public.get_events_page(
  p_search      text    default null,
  p_club_id     uuid    default null,
  p_date_from   timestamptz default null,
  p_date_to     timestamptz default null,
  p_open_only   boolean default false,
  p_page        int     default 0,
  p_page_size   int     default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_offset int;
  v_rows jsonb;
  v_total bigint;
begin
  v_offset := p_page * p_page_size;

  with base_events as (
    select
      e.id,
      e.club_id,
      e.title,
      e.description,
      e.location,
      e.starts_at,
      e.ends_at,
      e.cover_image,
      e.visibility,
      e.created_by,
      e.created_at,
      coalesce(e.status, 'active') as status,
      c.name as club_name,
      c.id   as club_id_join,
      coalesce(sum(t.volunteers_needed), 0) as total_needed,
      coalesce(
        (select count(*) from public.volunteer_signups v where v.event_id = e.id),
        0
      ) as total_filled
    from public.events e
    left join public.clubs c on c.id = e.club_id
    left join public.tasks t on t.event_id = e.id
    where
      -- *** MODERATION: only show active events publicly ***
      coalesce(e.status, 'active') = 'active'
      -- Visibility: public or user is member/creator/admin
      and (
        e.visibility = 'public'
        or e.created_by = auth.uid()
        or public.is_admin()
        or (
          e.club_id is not null
          and exists (
            select 1 from public.club_members m
            where m.club_id = e.club_id and m.profile_id = auth.uid()
          )
        )
      )
      -- Search filter
      and (
        p_search is null
        or e.title ilike '%' || p_search || '%'
        or e.description ilike '%' || p_search || '%'
      )
      -- Club filter
      and (p_club_id is null or e.club_id = p_club_id)
      -- Date filters
      and (p_date_from is null or e.starts_at >= p_date_from)
      and (p_date_to   is null or e.starts_at <= p_date_to)
    group by e.id, c.id
  ),
  filtered as (
    select *
    from base_events
    where
      (
        not p_open_only
        or (total_needed > 0 and total_filled < total_needed)
      )
  ),
  counted as (
    select count(*) as total from filtered
  ),
  paged as (
    select * from filtered
    order by starts_at asc
    limit p_page_size offset v_offset
  )
  select
    (select total from counted),
    jsonb_agg(
      jsonb_build_object(
        'id',          p.id,
        'club_id',     p.club_id,
        'title',       p.title,
        'description', p.description,
        'location',    p.location,
        'starts_at',   p.starts_at,
        'ends_at',     p.ends_at,
        'cover_image', p.cover_image,
        'visibility',  p.visibility,
        'status',      p.status,
        'created_by',  p.created_by,
        'clubs', case
          when p.club_id is not null
          then jsonb_build_object('id', p.club_id_join, 'name', p.club_name)
          else null
        end,
        'capacity', jsonb_build_object(
          'total_needed', p.total_needed,
          'total_filled', p.total_filled
        )
      )
      order by p.starts_at asc
    )
  into v_total, v_rows
  from paged p;

  return jsonb_build_object(
    'events', coalesce(v_rows, '[]'::jsonb),
    'total',  coalesce(v_total, 0)
  );
end;
$$;

revoke all on function public.get_events_page(text, uuid, timestamptz, timestamptz, boolean, int, int) from public;
grant execute on function public.get_events_page(text, uuid, timestamptz, timestamptz, boolean, int, int) to anon, authenticated;

-- ============================================================
-- 7) Profile settings API function
--    Validates username uniqueness case-insensitively
-- ============================================================
create or replace function public.update_own_profile(
  p_full_name  text default null,
  p_username   text default null,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing_username text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'PGRST';
  end if;

  -- Validate full_name
  if p_full_name is not null and trim(p_full_name) = '' then
    raise exception 'Display name cannot be empty';
  end if;
  if p_full_name is not null and length(trim(p_full_name)) > 100 then
    raise exception 'Display name must be 100 characters or fewer';
  end if;

  -- Validate username
  if p_username is not null then
    if trim(p_username) = '' then
      raise exception 'Username cannot be empty';
    end if;
    if length(trim(p_username)) < 3 then
      raise exception 'Username must be at least 3 characters';
    end if;
    if length(trim(p_username)) > 30 then
      raise exception 'Username must be 30 characters or fewer';
    end if;
    if trim(p_username) !~ '^[a-zA-Z0-9_.-]+$' then
      raise exception 'Username can only contain letters, numbers, underscores, hyphens, and periods';
    end if;
    -- Check uniqueness (case-insensitive, exclude self)
    select username into v_existing_username
    from public.profiles
    where lower(username) = lower(trim(p_username))
      and id != v_user_id
    limit 1;
    if found then
      raise exception 'Username is already taken';
    end if;
  end if;

  update public.profiles
  set
    full_name  = coalesce(p_full_name,  full_name),
    username   = coalesce(p_username,   username),
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = v_user_id;

  return (
    select jsonb_build_object(
      'id',         id,
      'full_name',  full_name,
      'username',   username,
      'avatar_url', avatar_url,
      'email',      email,
      'role',       role
    )
    from public.profiles
    where id = v_user_id
  );
end;
$$;

revoke all on function public.update_own_profile(text, text, text) from public;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

-- ============================================================
-- 8) Username clear function (set to null)
-- ============================================================
create or replace function public.clear_own_username()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set username = null
  where id = auth.uid();
end;
$$;

revoke all on function public.clear_own_username() from public;
grant execute on function public.clear_own_username() to authenticated;
