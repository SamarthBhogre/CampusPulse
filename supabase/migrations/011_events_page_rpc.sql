-- Migration 011: Server-side paginated events query with open_only filter.
-- Fixes BUG-003: "Has openings" filter was applied client-side AFTER pagination,
-- causing incorrect result counts and broken page navigation.
-- This RPC applies the open_only filter BEFORE the LIMIT/OFFSET so pagination
-- counts always match the filtered result set.
-- Run after 010_club_only_rsvp_enforcement.sql.

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

  -- Build result as JSON to keep a single RPC return type
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
      c.name as club_name,
      c.id   as club_id_join,
      -- Volunteer capacity: total needed vs total filled
      coalesce(sum(t.volunteers_needed), 0) as total_needed,
      coalesce(
        (select count(*) from public.volunteer_signups v where v.event_id = e.id),
        0
      ) as total_filled
    from public.events e
    left join public.clubs c on c.id = e.club_id
    left join public.tasks t on t.event_id = e.id
    where
      -- Visibility: public or user is member/creator/admin
      (
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
      -- Open-only: tasks exist AND there is remaining capacity
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
