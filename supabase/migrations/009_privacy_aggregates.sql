-- Privacy boundaries and aggregate read helpers.
-- Run after 008_query_hardening.sql.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Safe projection for names shown in public event/club UI. Contact details
-- remain in profiles and are only available through owner/admin policies.
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false)
as
  select id, full_name
  from public.profiles;

revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_self_read" on public.profiles;
drop policy if exists "profiles_event_participant_read" on public.profiles;
drop policy if exists "profiles_admin_read" on public.profiles;

create policy "profiles_self_read" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_event_participant_read" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.created_by = auth.uid()
        and (
          e.created_by = profiles.id
          or exists (select 1 from public.volunteer_signups v where v.event_id = e.id and v.profile_id = profiles.id)
          or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.profile_id = profiles.id)
        )
    )
  );

create policy "profiles_admin_read" on public.profiles
  for select to authenticated
  using (public.is_admin());

revoke select on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "members_read_all" on public.club_members;
drop policy if exists "members_self_read" on public.club_members;
drop policy if exists "members_admin_read" on public.club_members;

create policy "members_self_read" on public.club_members
  for select to authenticated
  using (profile_id = auth.uid());

create policy "members_admin_read" on public.club_members
  for select to authenticated
  using (public.is_admin());

revoke select on public.club_members from anon, authenticated;
grant select on public.club_members to authenticated;

drop policy if exists "signups_read_all" on public.volunteer_signups;
drop policy if exists "signups_owner_read" on public.volunteer_signups;
drop policy if exists "signups_admin_read" on public.volunteer_signups;

create policy "signups_owner_read" on public.volunteer_signups
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.events e where e.id = volunteer_signups.event_id and e.created_by = auth.uid())
  );

create policy "signups_admin_read" on public.volunteer_signups
  for select to authenticated
  using (public.is_admin());

drop policy if exists "signups_owner_delete" on public.volunteer_signups;
create policy "signups_owner_delete" on public.volunteer_signups
  for delete to authenticated
  using (
    exists (select 1 from public.events e where e.id = volunteer_signups.event_id and e.created_by = auth.uid())
    or public.is_admin()
  );

revoke select on public.volunteer_signups from anon, authenticated;
grant select, insert, delete on public.volunteer_signups to authenticated;

drop policy if exists "rsvps_read_all" on public.event_rsvps;
drop policy if exists "rsvps_owner_read" on public.event_rsvps;
drop policy if exists "rsvps_admin_read" on public.event_rsvps;

create policy "rsvps_owner_read" on public.event_rsvps
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_rsvps.event_id and e.created_by = auth.uid())
  );

create policy "rsvps_admin_read" on public.event_rsvps
  for select to authenticated
  using (public.is_admin());

revoke select on public.event_rsvps from anon, authenticated;
grant select, insert, delete on public.event_rsvps to authenticated;

create or replace function public.get_event_task_summary(p_event_id uuid)
returns table(task_id uuid, signup_count bigint, my_signup_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select t.id,
         count(v.id)::bigint,
         (select v2.id
          from public.volunteer_signups v2
          where v2.task_id = t.id
            and v2.profile_id = auth.uid()
          order by v2.signed_up_at desc
          limit 1)
  from public.tasks t
  left join public.volunteer_signups v on v.task_id = t.id
  where t.event_id = p_event_id
    and exists (
      select 1 from public.events e
      where e.id = p_event_id
        and (e.visibility = 'public' or e.created_by = auth.uid() or public.is_admin()
             or exists (select 1 from public.club_members m where m.club_id = e.club_id and m.profile_id = auth.uid()))
    )
  group by t.id;
$$;

create or replace function public.get_event_rsvp_summary(p_event_id uuid)
returns table(rsvp_count bigint, my_rsvp_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select count(r.id)::bigint,
         (select r2.id
          from public.event_rsvps r2
          where r2.event_id = p_event_id
            and r2.profile_id = auth.uid()
          order by r2.created_at desc
          limit 1)
  from public.event_rsvps r
  where r.event_id = p_event_id
    and exists (
      select 1 from public.events e
      where e.id = p_event_id
        and (e.visibility = 'public' or e.created_by = auth.uid() or public.is_admin()
             or exists (select 1 from public.club_members m where m.club_id = e.club_id and m.profile_id = auth.uid()))
    );
$$;

create or replace function public.get_club_member_counts()
returns table(club_id uuid, member_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, count(m.id)::bigint
  from public.clubs c
  left join public.club_members m on m.club_id = c.id
  group by c.id;
$$;

create or replace function public.get_event_capacity_summary(p_event_ids uuid[])
returns table(event_id uuid, total_needed bigint, total_filled bigint)
language sql
security definer
set search_path = public
stable
as $$
  select e.id,
         coalesce(sum(t.volunteers_needed), 0)::bigint,
         coalesce(sum((select count(*) from public.volunteer_signups v where v.event_id = e.id and v.task_id = t.id)), 0)::bigint
  from public.events e
  left join public.tasks t on t.event_id = e.id
  where e.id = any(p_event_ids)
    and (e.visibility = 'public' or e.created_by = auth.uid() or public.is_admin()
         or exists (select 1 from public.club_members m where m.club_id = e.club_id and m.profile_id = auth.uid()))
  group by e.id;
$$;

revoke all on function public.get_event_task_summary(uuid) from public;
revoke all on function public.get_event_rsvp_summary(uuid) from public;
revoke all on function public.get_club_member_counts() from public;
revoke all on function public.get_event_capacity_summary(uuid[]) from public;
grant execute on function public.get_event_task_summary(uuid) to anon, authenticated;
grant execute on function public.get_event_rsvp_summary(uuid) to anon, authenticated;
grant execute on function public.get_club_member_counts() to anon, authenticated;
grant execute on function public.get_event_capacity_summary(uuid[]) to anon, authenticated;
