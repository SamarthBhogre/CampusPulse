-- Additional information required for organizer review.

alter table public.profiles
  add column if not exists organizer_org_name text,
  add column if not exists organizer_org_type text,
  add column if not exists organizer_org_website text,
  add column if not exists organizer_org_description text,
  add column if not exists organizer_experience text,
  add column if not exists organizer_rejection_reason text;

comment on column public.profiles.organizer_org_name is 'Organization, company, department, or community represented by the applicant.';
comment on column public.profiles.organizer_org_type is 'Applicant-provided organization type.';
comment on column public.profiles.organizer_org_website is 'Optional organization website or public proof link.';
comment on column public.profiles.organizer_org_description is 'Applicant explanation of the organization and event purpose.';
comment on column public.profiles.organizer_experience is 'Applicant experience organizing events or communities.';

-- Preserve the additional application fields when the Auth trigger creates a
-- profile. The role remains student until an admin approves the request.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, full_name, role, organizer_request_status, organizer_requested_at,
    organizer_org_name, organizer_org_type, organizer_org_website,
    organizer_org_description, organizer_experience
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
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

-- Only the review flow or an admin may change application review state/details.
-- Existing self-update policy continues to protect role and suspension fields.
drop policy if exists "profiles_self_update_application" on public.profiles;
create policy "profiles_self_update_application" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and organizer_request_status = (select organizer_request_status from public.profiles where id = auth.uid())
  );
