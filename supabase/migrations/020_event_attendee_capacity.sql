-- Migration 020: attendee capacity and organizer-controlled registration.
-- Run after 019_required_usernames.sql.
--
-- events.max_attendees     NULL = unlimited, otherwise the RSVP cap.
-- events.registration_mode 'auto'   = open until max_attendees is reached, then closed
--                                     (reopens automatically if someone cancels)
--                          'open'   = organizer override, accepts RSVPs beyond the cap
--                          'closed' = organizer closed registrations manually

alter table public.events
  add column if not exists max_attendees int,
  add column if not exists registration_mode text not null default 'auto';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_max_attendees_positive') then
    alter table public.events
      add constraint events_max_attendees_positive
      check (max_attendees is null or max_attendees between 1 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_registration_mode_valid') then
    alter table public.events
      add constraint events_registration_mode_valid
      check (registration_mode in ('auto', 'open', 'closed'));
  end if;
end $$;

comment on column public.events.max_attendees is 'Maximum RSVPs; NULL means unlimited.';
comment on column public.events.registration_mode is
  'auto = closes when max_attendees is reached; open = organizer override past the cap; closed = organizer closed.';

-- Enforce the cap in the database so direct inserts and concurrent RSVPs cannot overbook.
create or replace function public.enforce_event_rsvp_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_max int;
  v_count int;
begin
  -- Lock the event row so concurrent RSVPs for the same event are serialized.
  select registration_mode, max_attendees
    into v_mode, v_max
    from public.events
    where id = new.event_id
    for update;

  if not found then
    raise exception 'Invalid event';
  end if;

  if v_mode = 'closed' then
    raise exception 'Registrations are closed for this event';
  end if;

  if v_mode = 'auto' and v_max is not null then
    select count(*) into v_count from public.event_rsvps where event_id = new.event_id;
    if v_count >= v_max then
      raise exception 'This event is full';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_event_rsvp_capacity on public.event_rsvps;
create trigger trg_enforce_event_rsvp_capacity
  before insert on public.event_rsvps
  for each row execute function public.enforce_event_rsvp_capacity();
