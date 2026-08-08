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

Fallback for partial 006/007 setup:

- `supabase/migrations/006_007_admin_setup_combined.sql`

## Deploy

Set these in Vercel project environment variables and deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://campus-pulse-sable.vercel.app`

