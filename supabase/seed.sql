-- Campus Pulse Seed Data
-- Run this AFTER schema.sql and AFTER creating at least one user via the signup form.
-- Or alternatively, create the seed users via Supabase Dashboard -> Authentication -> Add User.
--
-- QUICK PATH:
-- 1) Sign up 2 users through the app: e.g. organizer@campus.edu (role=organizer) and student@campus.edu (role=student)
-- 2) Run the block below - it will attach events/tasks to your organizer user automatically.

-- Seed clubs
insert into public.clubs (name, description) values
  ('Computer Science Society', 'Building the next generation of engineers through hackathons and workshops.'),
  ('Environmental Club', 'Sustainability initiatives, tree plantation drives, and awareness campaigns.'),
  ('Cultural Committee', 'Fests, music nights, drama and dance events.'),
  ('Sports Council', 'Intramural tournaments and inter-college competitions.'),
  ('Volunteer Outreach', 'Community service, blood donation, food drives.')
on conflict (name) do nothing;

-- Seed events + tasks tied to first organizer profile found
do $$
declare
  organizer_id uuid;
  cs_club uuid;
  env_club uuid;
  cult_club uuid;
  sport_club uuid;
  vol_club uuid;
  ev1 uuid;
  ev2 uuid;
  ev3 uuid;
  ev4 uuid;
  ev5 uuid;
begin
  select id into organizer_id from public.profiles where role='organizer' order by created_at limit 1;
  if organizer_id is null then
    raise notice 'No organizer profile found. Sign up a user with role=organizer first, then re-run this seed.';
    return;
  end if;

  select id into cs_club from public.clubs where name='Computer Science Society';
  select id into env_club from public.clubs where name='Environmental Club';
  select id into cult_club from public.clubs where name='Cultural Committee';
  select id into sport_club from public.clubs where name='Sports Council';
  select id into vol_club from public.clubs where name='Volunteer Outreach';

  insert into public.events (club_id, title, description, location, starts_at, ends_at, cover_image, created_by)
  values (cs_club, 'HackNight 2025', 'A 12-hour hackathon with free food, prizes worth $2000 and mentorship from industry experts.', 'Engineering Block, Hall A', now() + interval '7 days', now() + interval '7 days 12 hours', 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800', organizer_id) returning id into ev1;

  insert into public.events (club_id, title, description, location, starts_at, ends_at, cover_image, created_by)
  values (env_club, 'Campus Tree Plantation Drive', 'Help us plant 500 saplings across campus. Refreshments and volunteer certificates provided.', 'North Lawn', now() + interval '3 days', now() + interval '3 days 4 hours', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800', organizer_id) returning id into ev2;

  insert into public.events (club_id, title, description, location, starts_at, ends_at, cover_image, created_by)
  values (cult_club, 'Spring Cultural Fest', 'Two-day cultural extravaganza with music, dance, drama and food stalls.', 'Main Auditorium', now() + interval '14 days', now() + interval '15 days 20 hours', 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800', organizer_id) returning id into ev3;

  insert into public.events (club_id, title, description, location, starts_at, ends_at, cover_image, created_by)
  values (sport_club, 'Inter-College Football Tournament', 'Cheer on our team as they take on 8 other colleges. Volunteers needed for logistics.', 'Sports Field', now() + interval '10 days', now() + interval '10 days 8 hours', 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800', organizer_id) returning id into ev4;

  insert into public.events (club_id, title, description, location, starts_at, ends_at, cover_image, created_by)
  values (vol_club, 'Blood Donation Camp', 'Partnering with City Hospital. Every donor saves 3 lives.', 'Health Center', now() + interval '5 days', now() + interval '5 days 6 hours', 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=800', organizer_id) returning id into ev5;

  -- Tasks
  insert into public.tasks (event_id, title, description, volunteers_needed) values
    (ev1, 'Registration Desk', 'Check in participants and hand out swag kits.', 3),
    (ev1, 'Food Distribution', 'Help distribute snacks and refreshments through the night.', 4),
    (ev1, 'Judging Coordinator', 'Assist judges with schedules and score tracking.', 2),
    (ev2, 'Sapling Distributor', 'Distribute saplings and tools to volunteer groups.', 5),
    (ev2, 'Photography', 'Capture memorable moments of the drive.', 2),
    (ev3, 'Stage Setup', 'Assist crew with stage & backdrop assembly.', 6),
    (ev3, 'Ticketing & Entry', 'Manage entry gates and audience seating.', 4),
    (ev4, 'Score Board', 'Update the score board in real-time.', 2),
    (ev4, 'First Aid Support', 'Stay near the field with the first-aid kit.', 3),
    (ev5, 'Registration & Screening Assistant', 'Help donors fill forms & screening questionnaires.', 4);
end $$;
