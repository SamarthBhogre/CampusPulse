-- Migration 012: Attendance tracking, admin audit log, notification queue.
-- Run after 011_events_page_rpc.sql.

-- ============================================================
-- 1) Add status/moderation column to events
-- ============================================================
alter table public.events
  add column if not exists status text not null default 'active'
  check (status in ('active', 'cancelled', 'hidden'));

create index if not exists idx_events_status on public.events(status);

-- ============================================================
-- 2) Event attendance / check-in table
-- ============================================================
create table if not exists public.event_attendance (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid references public.profiles(id) on delete set null,
  note           text,
  unique (event_id, profile_id)
);

create index if not exists idx_attendance_event   on public.event_attendance(event_id);
create index if not exists idx_attendance_profile on public.event_attendance(profile_id);

alter table public.event_attendance enable row level security;

-- Organizer of the event or admin can read attendance
drop policy if exists "attendance_organizer_read" on public.event_attendance;
create policy "attendance_organizer_read" on public.event_attendance
  for select to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid())
    or profile_id = auth.uid()
    or public.is_admin()
  );

-- Only event organizer or admin can insert/update/delete
drop policy if exists "attendance_organizer_write" on public.event_attendance;
create policy "attendance_organizer_write" on public.event_attendance
  for all to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid())
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid())
    or public.is_admin()
  );

grant select, insert, update, delete on public.event_attendance to authenticated;

-- ============================================================
-- 3) Admin audit log
-- ============================================================
create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,
  target_type    text,
  target_id      text,
  metadata       jsonb,
  previous_state jsonb,
  new_state      jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_log_actor     on public.admin_audit_log(actor_id);
create index if not exists idx_audit_log_created   on public.admin_audit_log(created_at desc);
create index if not exists idx_audit_log_target    on public.admin_audit_log(target_type, target_id);

alter table public.admin_audit_log enable row level security;

-- Only admins can read or insert audit log entries
drop policy if exists "audit_log_admin_read" on public.admin_audit_log;
create policy "audit_log_admin_read" on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

drop policy if exists "audit_log_service_insert" on public.admin_audit_log;
create policy "audit_log_service_insert" on public.admin_audit_log
  for insert to authenticated
  with check (public.is_admin());

grant select, insert on public.admin_audit_log to authenticated;

-- ============================================================
-- 4) Notification queue
-- ============================================================
create table if not exists public.notification_queue (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  type           text not null,
  payload        jsonb not null default '{}'::jsonb,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  scheduled_at   timestamptz not null default now(),
  sent_at        timestamptz,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_notif_recipient on public.notification_queue(recipient_id);
create index if not exists idx_notif_status    on public.notification_queue(status, scheduled_at);

alter table public.notification_queue enable row level security;

-- Users can read their own notifications; admins can read all
drop policy if exists "notif_self_read" on public.notification_queue;
create policy "notif_self_read" on public.notification_queue
  for select to authenticated
  using (recipient_id = auth.uid() or public.is_admin());

drop policy if exists "notif_service_insert" on public.notification_queue;
create policy "notif_service_insert" on public.notification_queue
  for insert to authenticated
  with check (public.is_admin());

grant select on public.notification_queue to authenticated;

-- ============================================================
-- 5) Notification preferences
-- ============================================================
create table if not exists public.notification_preferences (
  profile_id              uuid primary key references public.profiles(id) on delete cascade,
  email_rsvp_confirmation boolean not null default true,
  email_volunteer_confirmation boolean not null default true,
  email_event_updates     boolean not null default true,
  email_reminders         boolean not null default true,
  updated_at              timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notif_prefs_self" on public.notification_preferences;
create policy "notif_prefs_self" on public.notification_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.notification_preferences to authenticated;

-- ============================================================
-- 6) Function: write_audit_log (security definer so API can log)
-- ============================================================
create or replace function public.write_audit_log(
  p_action        text,
  p_target_type   text default null,
  p_target_id     text default null,
  p_metadata      jsonb default null,
  p_previous      jsonb default null,
  p_new           jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_log
    (actor_id, action, target_type, target_id, metadata, previous_state, new_state)
  values
    (auth.uid(), p_action, p_target_type, p_target_id, p_metadata, p_previous, p_new)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.write_audit_log(text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.write_audit_log(text,text,text,jsonb,jsonb,jsonb) to authenticated;
