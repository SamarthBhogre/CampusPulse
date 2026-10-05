-- Student club creation requests and club manager assignments.

create table if not exists public.club_managers (
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

create index if not exists idx_club_managers_profile on public.club_managers(profile_id);

create table if not exists public.club_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 100),
  description text not null check (char_length(trim(description)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_club_id uuid references public.clubs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_requests_status_created on public.club_creation_requests(status, created_at desc);
create index if not exists idx_club_requests_requester on public.club_creation_requests(requester_id, created_at desc);
create unique index if not exists idx_one_pending_club_request_per_user
  on public.club_creation_requests(requester_id) where status = 'pending';

alter table public.club_managers enable row level security;
alter table public.club_creation_requests enable row level security;

drop policy if exists "club_managers_authenticated_read" on public.club_managers;
create policy "club_managers_authenticated_read" on public.club_managers
  for select to authenticated using (true);

drop policy if exists "club_requests_own_read" on public.club_creation_requests;
create policy "club_requests_own_read" on public.club_creation_requests
  for select to authenticated using (requester_id = auth.uid() or public.is_admin());

drop policy if exists "club_requests_own_insert" on public.club_creation_requests;
create policy "club_requests_own_insert" on public.club_creation_requests
  for insert to authenticated with check (requester_id = auth.uid());

grant select on public.club_managers to authenticated;
grant select, insert on public.club_creation_requests to authenticated;

-- Club managers can edit their clubs. Creation remains controlled by the
-- approval RPC below (existing organizer creation remains supported).
drop policy if exists "clubs_manager_update" on public.clubs;
create policy "clubs_manager_update" on public.clubs
  for update to authenticated
  using (
    exists (select 1 from public.club_managers m where m.club_id = clubs.id and m.profile_id = auth.uid())
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.club_managers m where m.club_id = clubs.id and m.profile_id = auth.uid())
    or public.is_admin()
  );

-- Student-facing request creation. The function keeps validation and the
-- initial manager/member assignment atomic.
create or replace function public.create_club_request(p_name text, p_description text)
returns public.club_creation_requests
language plpgsql
security definer set search_path = public
as $$
declare result_row public.club_creation_requests;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = 'PGRST301'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 or char_length(trim(p_name)) > 100 then raise exception 'Club name must be 3-100 characters'; end if;
  if char_length(trim(coalesce(p_description, ''))) < 10 or char_length(trim(p_description)) > 1000 then raise exception 'Description must be 10-1000 characters'; end if;
  if exists (select 1 from public.clubs where lower(name) = lower(trim(p_name))) then raise exception 'A club with this name already exists'; end if;
  if exists (select 1 from public.club_creation_requests where requester_id = auth.uid() and status = 'pending') then raise exception 'You already have a pending club request'; end if;

  insert into public.club_creation_requests (requester_id, name, description)
  values (auth.uid(), trim(p_name), trim(p_description))
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.create_club_request(text, text) from public;
grant execute on function public.create_club_request(text, text) to authenticated;

-- Admin approval/rejection. Approval creates the club, manager record, and
-- membership in one transaction.
create or replace function public.review_club_request(p_request_id uuid, p_action text, p_rejection_reason text default null)
returns public.club_creation_requests
language plpgsql
security definer set search_path = public
as $$
declare req public.club_creation_requests;
declare new_club_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into req from public.club_creation_requests where id = p_request_id for update;
  if req.id is null then raise exception 'Club request not found'; end if;
  if req.status <> 'pending' then raise exception 'Club request has already been reviewed'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Invalid review action'; end if;

  if p_action = 'approve' then
    if exists (select 1 from public.clubs where lower(name) = lower(req.name)) then raise exception 'A club with this name already exists'; end if;
    insert into public.clubs (name, description) values (req.name, req.description) returning id into new_club_id;
    insert into public.club_managers (club_id, profile_id, assigned_by) values (new_club_id, req.requester_id, auth.uid());
    insert into public.club_members (club_id, profile_id) values (new_club_id, req.requester_id) on conflict do nothing;
    update public.club_creation_requests
      set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), created_club_id = new_club_id
      where id = req.id returning * into req;
  else
    update public.club_creation_requests
      set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = nullif(trim(p_rejection_reason), '')
      where id = req.id returning * into req;
  end if;
  return req;
end;
$$;

revoke all on function public.review_club_request(uuid, text, text) from public;
grant execute on function public.review_club_request(uuid, text, text) to authenticated;
