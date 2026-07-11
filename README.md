# Campus Pulse

A Next.js + Supabase platform for discovering campus events, volunteering for tasks, and managing club activities.

## Tech stack

- **Next.js 15** (App Router) with React 18 + Tailwind CSS + shadcn/ui
- **Supabase**: Auth (email/password), Postgres (with RLS), Storage (event cover images)
- **next-themes** for dark mode

## Features

- Role-based auth (Student / Organizer) with email confirmation & password reset
- Browse events with search + club filter + date filter + open-tasks toggle
- Public and Club-only events (RLS-enforced)
- Volunteer for tasks + RSVP to attend
- Organizer dashboard: create/edit/delete events, manage tasks & volunteers
- Drag-and-drop cover image upload via Supabase Storage
- CSV export of volunteers + attendees per event
- Club membership with a browsable clubs directory
- Dark mode

## Local setup

```bash
yarn install
cp .env.example .env.local  # fill in your Supabase keys
yarn dev
```

## Supabase setup

1. Create a project at https://supabase.com/dashboard
2. Copy your Project URL + publishable + secret keys into `.env.local`
3. Run these SQL files in **SQL Editor** in order:
   - `supabase/schema.sql`
   - `supabase/migrations/002_add_rsvps.sql`
   - `supabase/migrations/003_club_membership_visibility.sql`
4. Create the `event-covers` Storage bucket (public, 5 MB limit) - or run `node scripts/setup-storage.mjs`
5. In **Authentication -> URL Configuration**, add your app URL to Site URL and Redirect URLs (`.../auth/callback`)

## Deploy to Vercel

1. Push this repo to GitHub
2. Import into Vercel: https://vercel.com/new
3. Add the three env vars in **Settings -> Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Then update Supabase Auth URL Configuration with the new Vercel URL.
