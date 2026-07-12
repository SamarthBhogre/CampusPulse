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
   - `supabase/migrations/004_production_hardening.sql`
   - `supabase/migrations/005_auth_role_hardening.sql`
   - `supabase/migrations/006_organizer_access_requests.sql`
   - `supabase/migrations/007_admin_role.sql`
   - If 006/007 fail because of a partial previous attempt, run `supabase/migrations/006_007_admin_setup_combined.sql` instead.
4. Create the `event-covers` Storage bucket (public, 5 MB limit) - or run `node scripts/setup-storage.mjs`
5. In **Authentication -> URL Configuration**, add your app URL to Site URL and Redirect URLs (`.../auth/callback`)

## Deploy to Vercel

1. Push this repo to GitHub
2. Import into Vercel: https://vercel.com/new
3. Add the three env vars in **Settings -> Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` = your production app origin, for example `https://campus-pulse-sable.vercel.app`
   - Optional: `CORS_ORIGINS` if another trusted origin must call this deployment directly
4. Deploy. Then update Supabase **Authentication -> URL Configuration**:
   - Site URL: your Vercel origin, for example `https://campus-pulse-sable.vercel.app`
   - Redirect URLs:
     - `https://campus-pulse-sable.vercel.app/auth/callback`
     - `https://campus-pulse-sable.vercel.app/auth/confirm`
     - `http://localhost:3000/auth/callback` for local development
     - `http://localhost:3000/auth/confirm` for local development
   - Remove old Emergent preview URLs unless you still intentionally use them.

### Supabase email templates

For reliable email confirmation across browsers/devices, use the `token_hash` confirmation route instead of the PKCE callback URL.

In Supabase **Authentication -> Email Templates -> Confirm signup**, set the confirmation link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm your email</a>
```

In **Reset password**, set the reset link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password">Reset your password</a>
```

## Approve organizer access

Admins can sign in from `/admin/sign-in` and review requests at `/admin/dashboard`.

Create the first admin by signing up normally, confirming the email, then running:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@campus.edu';
```

Organizer signup creates a pending request but does not grant organizer privileges automatically.

```sql
select id, email, full_name, organizer_requested_at
from public.profiles
where organizer_request_status = 'pending'
order by organizer_requested_at;
```

Approve a verified organizer:

```sql
update public.profiles
set role = 'organizer',
    organizer_request_status = 'approved'
where email = 'organizer@campus.edu';
```
