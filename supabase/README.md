# Campus Pulse - Supabase Setup

## Step 1 - Create a Supabase project
1. Go to https://supabase.com/dashboard and create a new project.
2. Wait ~1 minute for the project to provision.

## Step 2 - Grab your keys
- Go to **Settings -> API**
- Copy:
  - **Project URL** -> paste as `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** key -> paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role** key (secret) -> paste as `SUPABASE_SERVICE_ROLE_KEY`
- Update `/app/.env` with these three values, then restart nextjs: `sudo supervisorctl restart nextjs`

## Step 3 - (Recommended) Disable email confirmation for dev
- Go to **Authentication -> Providers -> Email**
- Turn **Confirm email** OFF (so you can sign up and log in immediately).

## Step 4 - Run the schema
- Open **SQL Editor** in Supabase.
- New Query -> paste the contents of `schema.sql` -> Run.

## Step 5 - Create seed accounts
Easiest option: sign up through the Campus Pulse UI itself with these two accounts (creates auth users + profile rows automatically):
- Email: `organizer@campus.edu` | Password: `Campus123!` | Role: **Organizer**
- Email: `student@campus.edu`   | Password: `Campus123!` | Role: **Student**

## Step 6 - Load seed events/tasks
- Open **SQL Editor** in Supabase.
- New Query -> paste the contents of `seed.sql` -> Run.
- This will attach clubs, events, and volunteer tasks to your organizer account.

Done! Log in and enjoy Campus Pulse.
