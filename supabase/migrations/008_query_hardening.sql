-- Query-aligned indexes for the current event, club, and participation paths.
-- Run after 004_production_hardening.sql and the RSVP/club migrations.

create index if not exists idx_events_visibility_starts_at
  on public.events(visibility, starts_at);

create index if not exists idx_club_members_club_created_at
  on public.club_members(club_id, created_at);

create index if not exists idx_rsvps_event_created_at
  on public.event_rsvps(event_id, created_at);
