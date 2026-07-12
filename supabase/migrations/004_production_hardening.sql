-- Migration: production hardening constraints and capacity enforcement
-- Run after 003_club_membership_visibility.sql.

-- Keep event ranges coherent without rewriting existing rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_ends_after_starts'
  ) then
    alter table public.events
      add constraint events_ends_after_starts
      check (ends_at is null or ends_at > starts_at) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_volunteers_needed_positive'
  ) then
    alter table public.tasks
      add constraint tasks_volunteers_needed_positive
      check (volunteers_needed > 0) not valid;
  end if;
end $$;

-- Common query paths used by the event listing, organizer dashboard, and club pages.
create index if not exists idx_events_club_starts_at on public.events(club_id, starts_at);
create index if not exists idx_events_created_by_starts_at on public.events(created_by, starts_at);
create index if not exists idx_signups_task on public.volunteer_signups(task_id);

-- Enforce volunteer task capacity in the database to prevent concurrent overbooking.
create or replace function public.enforce_task_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needed int;
  current_count int;
begin
  select volunteers_needed
    into needed
    from public.tasks
    where id = new.task_id
      and event_id = new.event_id
    for update;

  if needed is null then
    raise exception 'Invalid task for event';
  end if;

  select count(*)
    into current_count
    from public.volunteer_signups
    where task_id = new.task_id;

  if current_count >= needed then
    raise exception 'Task is full';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_task_capacity on public.volunteer_signups;
create trigger trg_enforce_task_capacity
  before insert on public.volunteer_signups
  for each row execute function public.enforce_task_capacity();
