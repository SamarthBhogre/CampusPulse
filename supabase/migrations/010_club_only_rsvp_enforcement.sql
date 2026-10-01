-- Migration 010: Enforce club membership for RSVP and volunteer signup on club_only events.
-- Previously, INSERT policies only checked profile_id = auth.uid(), allowing any
-- authenticated user to RSVP/volunteer for club_only events directly via the Supabase client.
-- This migration replaces those policies with membership-aware checks and adds secure RPCs.
-- Run after 009_privacy_aggregates.sql.

-- ============================================================
-- Helper: can a user participate in an event?
-- Returns true if: event is public, OR user is the creator,
--   OR user is an admin, OR user is a member of the event's club.
-- ============================================================
create or replace function public.can_participate_in_event(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (
        e.visibility = 'public'
        or e.created_by = auth.uid()
        or public.is_admin()
        or (
          e.club_id is not null
          and exists (
            select 1 from public.club_members m
            where m.club_id = e.club_id
              and m.profile_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function public.can_participate_in_event(uuid) from public;
grant execute on function public.can_participate_in_event(uuid) to authenticated;

-- ============================================================
-- Fix event_rsvps INSERT policy
-- Old: only checked profile_id = auth.uid() — no membership gate
-- New: also requires participation eligibility
-- ============================================================
drop policy if exists "rsvps_self_insert" on public.event_rsvps;
create policy "rsvps_self_insert" on public.event_rsvps
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.can_participate_in_event(event_id)
  );

-- Also restrict DELETE to own RSVPs only (was already correct, restate for clarity)
drop policy if exists "rsvps_self_delete" on public.event_rsvps;
create policy "rsvps_self_delete" on public.event_rsvps
  for delete to authenticated
  using (profile_id = auth.uid());

-- ============================================================
-- Fix volunteer_signups INSERT policy
-- Old: only checked profile_id = auth.uid()
-- New: also requires participation eligibility for the event
-- ============================================================
drop policy if exists "signups_self_insert" on public.volunteer_signups;
create policy "signups_self_insert" on public.volunteer_signups
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.can_participate_in_event(event_id)
  );

-- Self-delete remains the same
drop policy if exists "signups_self_delete" on public.volunteer_signups;
create policy "signups_self_delete" on public.volunteer_signups
  for delete to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.events e where e.id = volunteer_signups.event_id and e.created_by = auth.uid())
    or public.is_admin()
  );

-- ============================================================
-- Secure RPC: rsvp_to_event
-- Atomically inserts or removes an RSVP, enforcing club membership.
-- Returns: { action: 'added' | 'removed', rsvp_id: uuid | null }
-- ============================================================
create or replace function public.rsvp_to_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_result jsonb;
begin
  -- Verify auth
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'PGRST301';
  end if;

  -- Verify participation eligibility
  if not public.can_participate_in_event(p_event_id) then
    raise exception 'You must be a club member to RSVP to this event' using errcode = 'P0001';
  end if;

  -- Check for existing RSVP
  select id into v_existing_id
  from public.event_rsvps
  where event_id = p_event_id and profile_id = auth.uid()
  limit 1;

  if v_existing_id is not null then
    -- Remove existing RSVP
    delete from public.event_rsvps where id = v_existing_id and profile_id = auth.uid();
    v_result := jsonb_build_object('action', 'removed', 'rsvp_id', null);
  else
    -- Insert new RSVP
    insert into public.event_rsvps (event_id, profile_id)
    values (p_event_id, auth.uid())
    returning id into v_existing_id;
    v_result := jsonb_build_object('action', 'added', 'rsvp_id', v_existing_id);
  end if;

  return v_result;
end;
$$;

revoke all on function public.rsvp_to_event(uuid) from public;
grant execute on function public.rsvp_to_event(uuid) to authenticated;

-- ============================================================
-- Secure RPC: volunteer_for_task
-- Atomically inserts or removes a volunteer signup, enforcing
-- club membership and task capacity.
-- Returns: { action: 'added' | 'removed', signup_id: uuid | null }
-- ============================================================
create or replace function public.volunteer_for_task(p_task_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_result jsonb;
  v_task_event_id uuid;
begin
  -- Verify auth
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'PGRST301';
  end if;

  -- Verify task belongs to stated event
  select event_id into v_task_event_id
  from public.tasks
  where id = p_task_id;

  if v_task_event_id is null or v_task_event_id <> p_event_id then
    raise exception 'Invalid task for event' using errcode = 'P0001';
  end if;

  -- Verify participation eligibility (membership check)
  if not public.can_participate_in_event(p_event_id) then
    raise exception 'You must be a club member to volunteer for this event' using errcode = 'P0001';
  end if;

  -- Check for existing signup
  select id into v_existing_id
  from public.volunteer_signups
  where task_id = p_task_id and profile_id = auth.uid()
  limit 1;

  if v_existing_id is not null then
    -- Remove signup
    delete from public.volunteer_signups where id = v_existing_id and profile_id = auth.uid();
    v_result := jsonb_build_object('action', 'removed', 'signup_id', null);
  else
    -- Insert (capacity trigger enforce_task_capacity fires here)
    insert into public.volunteer_signups (task_id, event_id, profile_id)
    values (p_task_id, p_event_id, auth.uid())
    returning id into v_existing_id;
    v_result := jsonb_build_object('action', 'added', 'signup_id', v_existing_id);
  end if;

  return v_result;
end;
$$;

revoke all on function public.volunteer_for_task(uuid, uuid) from public;
grant execute on function public.volunteer_for_task(uuid, uuid) to authenticated;
