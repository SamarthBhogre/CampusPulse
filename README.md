# Campus Pulse

Campus Pulse is a full-stack campus platform where students can discover events, RSVP, volunteer for tasks, and join clubs, while organizers manage events from a dedicated dashboard.

**Live app:** https://campus-pulse-sable.vercel.app/

## Features

- Student auth (email/password), event discovery, RSVP, and task volunteering
- Club directory with join/leave membership flow
- Organizer dashboard for event creation, task management, and CSV exports
- Admin dashboard to approve/reject organizer access requests
- Supabase Storage cover image uploads
- Dark mode support

## Tech Stack

- Next.js 15 (App Router), React 18
- Tailwind CSS + shadcn/ui + Radix UI
- Supabase (Auth, Postgres + RLS, Storage)
- Vercel deployment

## Local Setup

```bash
yarn install
cp .env.example .env.local
yarn dev
```

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CORS_ORIGINS` (optional)

## Supabase SQL Order

Run in this order:

1. `supabase/schema.sql`
2. `supabase/migrations/002_add_rsvps.sql`
3. `supabase/migrations/003_club_membership_visibility.sql`
4. `supabase/migrations/004_production_hardening.sql`
5. `supabase/migrations/005_auth_role_hardening.sql`
6. `supabase/migrations/006_organizer_access_requests.sql`
7. `supabase/migrations/007_admin_role.sql`
8. `supabase/migrations/008_query_hardening.sql`
9. `supabase/migrations/009_privacy_aggregates.sql`
10. `supabase/migrations/010_club_only_rsvp_enforcement.sql`
11. `supabase/migrations/011_events_page_rpc.sql`
12. `supabase/migrations/012_attendance_audit_notifications.sql`
13. `supabase/migrations/013_profiles_is_suspended.sql`
14. `supabase/migrations/014_fix_public_profiles_security_invoker.sql`
15. `supabase/migrations/015_username_privacy_moderation.sql`
16. `supabase/migrations/016_event_covers_storage.sql`
17. `supabase/migrations/017_club_creation_workflow.sql`
18. `supabase/migrations/018_organizer_application_details.sql`

Fallback for partial 006/007 setup:

- `supabase/migrations/006_007_admin_setup_combined.sql`

The final migration creates/configures the public `event-covers` Storage bucket
and allows signed-in users to upload only into their own folder. Run it in the
Supabase SQL Editor if image uploads currently return a Storage/RLS error.

## Deploy

Set these in Vercel project environment variables and deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://campus-pulse-sable.vercel.app`

## Generate demo data

With `.env.local` configured, run:

```bash
node scripts/generate-demo-data.mjs
```

The defaults create 100 demo accounts, 15 clubs, and 120 events, plus random
club memberships, RSVPs, volunteer tasks, and capacity-safe volunteer signups.
Adjust the size with `--users`, `--clubs`, and `--events`, for example:

```bash
node scripts/generate-demo-data.mjs --users 250 --clubs 25 --events 400
```

Demo accounts use emails such as `demo.0001@campus-pulse.test` and the password
`CampusDemo123!`, unless `DEMO_USER_PASSWORD` is set. The generator can be
rerun without duplicating matching demo accounts, clubs, or participation rows.

