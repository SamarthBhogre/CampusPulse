# Campus Pulse External Project Report

## Executive Summary

Campus Pulse is a Next.js 15 and Supabase based campus platform for discovering events, volunteering for tasks, joining clubs, and managing organizer/admin workflows. It centralizes campus communication that would otherwise be fragmented across chat groups, manual spreadsheets, and ad hoc announcements.

Confirmed from the codebase and live runtime verification:
- The app uses the Next.js App Router.
- Supabase provides authentication, Postgres, Row Level Security, and Storage.
- Events, clubs, RSVPs, volunteer signups, and memberships are stored in Supabase tables.
- Role-based access exists for student, organizer, and admin users.
- The app includes public browsing, organizer dashboards, and an admin approval queue.

Not verified:
- Real email delivery and mailbox confirmation flow.
- Production Supabase dashboard settings beyond what is documented in the repo.
- Automated test coverage.

## Project Overview

### Project Title

Campus Pulse

### Problem Statement

Campus communication is scattered across multiple tools, making it hard for students to discover events, sign up for volunteer tasks, join clubs, and for organizers to manage event operations in one place.

### Objective

To provide a unified campus platform where students can browse events and clubs, RSVP, volunteer, and where organizers and admins can manage event and access workflows.

### Target Users

- Students
- Organizers
- Admins

### Core Features

- Event discovery with search and filters
- RSVP attendance flow
- Volunteer task sign-up and withdrawal
- Club directory and membership flow
- Organizer event creation and management
- CSV export of attendees and volunteers
- Admin approval of organizer requests
- Email confirmation and password reset
- Dark mode

### Technologies Used

- Next.js 15
- React 18
- Supabase Auth
- Supabase Postgres
- Supabase RLS
- Supabase Storage
- Tailwind CSS
- shadcn/ui
- Radix UI
- next-themes
- date-fns
- sonner
- lucide-react

## Architecture Summary

### Overall Architecture

Campus Pulse is a mostly client-driven Next.js application with a small supporting API layer. The browser talks directly to Supabase for most reads and writes, while a few route handlers handle auth callback flows, profile repair, and admin authorization.

### Frontend Architecture

- App Router pages live under `app/`.
- Shared UI components live under `components/`.
- Browser-side Supabase clients are created in `lib/supabase/client.js`.
- Theme and toast providers are wired in `app/providers.js`.
- The navigation bar is global through `app/layout.js`.

### Backend Architecture

- There is no large custom REST API.
- The app relies on Supabase Postgres and RLS for most backend behavior.
- Small route handlers exist for auth and admin tasks.

### Database Architecture

- The schema is relational and UUID based.
- Foreign keys connect profiles, clubs, events, tasks, memberships, RSVPs, and volunteer signups.
- RLS controls who can read or mutate rows.
- A trigger enforces volunteer task capacity.

### Authentication Flow

1. User signs up with email/password.
2. Supabase sends confirmation or recovery links.
3. The app verifies confirmation through `/auth/confirm`.
4. Session cookies are managed through Supabase SSR utilities.
5. `ensureCurrentProfile()` repairs or creates a missing profile row.
6. Admin access is checked by server-side role lookup.

### API Communication

- Client components call Supabase directly for most domain data.
- Small Next routes wrap sensitive or session-based flows.
- Admin routes use the service role key on the server.

### State Management

Confirmed usage is mostly local React state and `useEffect`-driven fetching. `QueryClientProvider` exists, but no substantive query-cache usage was verified in the app flows reviewed.

### Folder Organization

- `app/` - routes, pages, and route handlers
- `components/` - shared UI components
- `hooks/` - custom hooks
- `lib/` - utilities, Supabase clients, auth helpers, CSV export
- `supabase/` - schema and migrations
- `scripts/` - setup and DB helper scripts
- `tests/` - currently empty except package marker

## Technology Stack Details

| Technology | Purpose | Why it is useful |
| --- | --- | --- |
| Next.js 15 | App routing and rendering | Clean full-stack React framework with production build support |
| React 18 | UI composition | Handles interactive pages and client state |
| Supabase Auth | Authentication | Email/password auth with confirmation and recovery |
| Supabase Postgres | Database | Strong relational model for campus entities |
| Supabase RLS | Authorization | Enforces access rules close to the data |
| Supabase Storage | File uploads | Stores event cover images |
| Tailwind CSS | Styling | Fast utility-based styling |
| shadcn/ui + Radix UI | Components | Accessible component primitives and consistent UI |
| next-themes | Theme toggling | Provides dark mode support |
| date-fns | Date formatting | Human-readable event dates |
| sonner | Toast notifications | User feedback on forms and actions |
| lucide-react | Icons | Consistent iconography |
| pg | Database scripts | Used in migration/query utilities |

## Environment Variables

Confirmed required variables from the repository:

| Variable | Purpose | Verified usage |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Used by Supabase clients and server routes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | Used by client/server Supabase sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key | Used for admin client and profile repair |
| `NEXT_PUBLIC_APP_URL` | Public app origin | Used for auth redirect URLs |
| `CORS_ORIGINS` | Optional CORS header origin list | Used in `next.config.js` |
| `SUPABASE_DB_PASSWORD` | Database password for scripts | Used by `scripts/query-db.mjs` and `scripts/run-migration.mjs` |

Relevant files:
- [`.env.example`](.env.example)
- [`.env.local`](.env.local)
- [lib/app-url.js](lib/app-url.js)
- [scripts/query-db.mjs](scripts/query-db.mjs)
- [scripts/run-migration.mjs](scripts/run-migration.mjs)

## Database Summary

### Tables

| Table | Purpose |
| --- | --- |
| `profiles` | User profile and role record |
| `clubs` | Campus clubs |
| `events` | Event records |
| `tasks` | Volunteer tasks per event |
| `volunteer_signups` | Volunteer registrations |
| `event_rsvps` | Attendance registrations |
| `club_members` | Club membership records |

### Relationships

- `profiles.id` references `auth.users.id`
- `events.club_id` references `clubs.id`
- `events.created_by` references `profiles.id`
- `tasks.event_id` references `events.id`
- `volunteer_signups.task_id` references `tasks.id`
- `volunteer_signups.event_id` references `events.id`
- `volunteer_signups.profile_id` references `profiles.id`
- `event_rsvps.event_id` references `events.id`
- `event_rsvps.profile_id` references `profiles.id`
- `club_members.club_id` references `clubs.id`
- `club_members.profile_id` references `profiles.id`

### Constraints

- UUID primary keys across core tables
- Unique constraints to prevent duplicate signups, RSVPs, and memberships
- `events.ends_at > starts_at` hardening constraint
- `tasks.volunteers_needed > 0` hardening constraint
- Task-capacity trigger to prevent overbooking

### How the Database Supports the Application

The database is the main control plane for integrity and authorization. RLS policies enforce read/write behavior, while foreign keys and triggers keep event, task, and signup data coherent.

## API Summary

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/[[...path]]` | GET, POST, OPTIONS | Health-style fallback |
| `/api/profile/ensure` | GET | Repair or create the authenticated user profile |
| `/api/admin/me` | GET | Verify admin identity |
| `/api/admin/organizer-requests` | GET | List organizer requests |
| `/api/admin/organizer-requests/[id]` | PATCH | Approve or reject requests |
| `/auth/callback` | GET | Exchange code for Supabase session |
| `/auth/confirm` | GET | Verify confirmation/recovery token |

## Feature Summary

### Public Pages

- Home page introduces the product and routes users into sign-up or events.
- Events page shows searchable/filterable event cards.
- Clubs page shows club listings and membership status.

### Student Features

- Sign up and sign in with email/password.
- RSVP to events.
- Volunteer for tasks.
- Join or leave clubs.
- View personal dashboard with attending and volunteering items.

### Organizer Features

- Create events.
- Edit event details.
- Add and remove volunteer tasks.
- Export volunteers and attendees as CSV.
- Manage cover images through Supabase Storage.

### Admin Features

- Review organizer approval requests.
- Approve or reject organizer requests.
- Access is gated by admin role checks on the server.

## Important Files

| Area | File |
| --- | --- |
| App shell | [app/layout.js](app/layout.js) |
| Providers | [app/providers.js](app/providers.js) |
| Navigation | [components/nav-bar.jsx](components/nav-bar.jsx) |
| Home page | [app/page.js](app/page.js) |
| Events list | [app/events/page.js](app/events/page.js) |
| Event detail | [app/events/[id]/page.js](app/events/%5Bid%5D/page.js) |
| Clubs list | [app/clubs/page.js](app/clubs/page.js) |
| Club detail | [app/clubs/[id]/page.js](app/clubs/%5Bid%5D/page.js) |
| Student dashboard | [app/dashboard/page.js](app/dashboard/page.js) |
| Organizer dashboard | [app/dashboard/organizer/page.js](app/dashboard/organizer/page.js) |
| Create event | [app/dashboard/organizer/events/new/page.js](app/dashboard/organizer/events/new/page.js) |
| Manage event | [app/dashboard/organizer/events/[id]/page.js](app/dashboard/organizer/events/%5Bid%5D/page.js) |
| Admin dashboard | [app/admin/dashboard/page.js](app/admin/dashboard/page.js) |
| Auth sign-up | [app/auth/sign-up/page.js](app/auth/sign-up/page.js) |
| Auth sign-in | [app/auth/sign-in/page.js](app/auth/sign-in/page.js) |
| Auth callback | [app/auth/callback/route.js](app/auth/callback/route.js) |
| Auth confirm | [app/auth/confirm/route.js](app/auth/confirm/route.js) |
| Profile ensure API | [app/api/profile/ensure/route.js](app/api/profile/ensure/route.js) |
| Admin auth helper | [lib/admin-auth.js](lib/admin-auth.js) |
| Supabase clients | [lib/supabase/client.js](lib/supabase/client.js), [lib/supabase/server.js](lib/supabase/server.js), [lib/supabase/admin.js](lib/supabase/admin.js) |
| Image upload | [components/image-upload.jsx](components/image-upload.jsx) |
| CSV export | [lib/csv.js](lib/csv.js) |

## Security Summary

Confirmed security measures:
- RLS is enabled on the main tables.
- Admin access uses server-side role checks.
- Auth redirect paths are sanitized to same-origin relative paths.
- Upload MIME types and size are constrained.
- Security headers are configured in `next.config.js`.

Known concerns from the code review:
- Some profile/member data is broadly readable.
- The app is still heavily client-driven for writes.
- No automated security regression tests were verified.

## Performance Summary

Observed strengths:
- Small custom backend surface.
- Standalone production output.
- Indexed tables and hardening constraints.

Observed risks:
- Client-side collection loading without pagination.
- Dashboard counts are computed by fetching related records.
- Large data sets could increase response time.

## Testing and Validation

Verified during this session:
- Production build completed successfully.
- Standalone server launched successfully after using the correct Node executable.
- Browser load confirmed for home, events, clubs, event detail, dashboards, and admin sign-in.
- Anonymous RSVP attempt redirected to sign-in.
- Organizer sign-in succeeded.
- Admin dashboard rejected the organizer account.

Not verified:
- End-to-end mutation success for RSVP/volunteer on a fully authenticated browser session.
- Real mailbox confirmation/recovery flow.
- Automated tests and CI pipelines.

## Live Runtime Notes

These were required to run the project in this environment:

1. Node was installed at `C:\Program Files\nodejs`, but not on PATH.
2. `next start` was not appropriate because the project uses `output: standalone`.
3. The correct runtime command was the generated standalone server.
4. Static assets had to be present under `.next/standalone/.next/static` for the browser to load CSS and chunks.

## Strengths

- Clear domain separation between students, organizers, and admins.
- Supabase RLS provides a strong authorization base.
- The UI is polished and modern.
- The app covers meaningful campus workflows end to end.
- The codebase is easy to explain in an external review.

## Weaknesses

- No verified automated tests.
- Some broad read access in the schema.
- Client-side data fetching dominates the application.
- Pagination is absent for major collections.
- Error handling is often raw rather than user-friendly.

## Potential Improvements

- Add automated tests for auth, RLS, and key user flows.
- Introduce pagination for events, clubs, and dashboards.
- Tighten profile and membership visibility.
- Move sensitive mutations behind server actions or RPCs.
- Add audit logging for organizer/admin actions.

## External Viva Questions and Answers

### Why this project?

To solve fragmented campus event communication and make discovery, volunteering, and club participation easier.

### Why this tech stack?

Next.js gives fast full-stack delivery, while Supabase provides auth, database, and storage with minimal backend overhead.

### Why this database?

Postgres matches the relational nature of clubs, events, tasks, RSVPs, and memberships, and RLS helps enforce access control.

### Why this architecture?

It keeps the system simple and fast to build while still providing secure data controls through Supabase.

### Biggest challenge?

Balancing simplicity, role-based access, and data integrity while keeping the UI easy to use.

### Future scope?

Notifications, attendance check-in, pagination, search improvements, audit logs, and more granular privacy controls.

### Security measures?

RLS, server-side admin checks, safe redirects, upload validation, and hardened headers.

### Scalability?

The data model is scalable, but read-heavy pages need pagination and server-side aggregation as data grows.

### Deployment?

The project is configured for standalone Next.js deployment and is documented for Vercel.

### Authentication?

Supabase email/password auth with confirmation and password reset.

### APIs?

A small set of helper routes for profile repair, auth confirmation, and admin approval workflows.

### Database design?

Relational, UUID-based, and protected by foreign keys, unique constraints, and RLS.

### Testing?

No meaningful automated tests were verified in the repository.

### Performance?

Good for a campus-scale pilot, but large lists will need pagination and better aggregation to scale.

## Presentation Content

### 1. Project Title

Campus Pulse

### 2. Problem Statement

Campus activities are difficult to discover and manage because information is spread across multiple disconnected channels.

### 3. Objectives

- Centralize event discovery
- Support RSVPs and volunteering
- Manage clubs and memberships
- Provide organizer dashboards
- Enable admin approval for organizers

### 4. Existing System

Manual coordination through messaging apps, notices, and spreadsheets.

### 5. Proposed System

A single web platform for students, organizers, and admins.

### 6. Technology Stack

Next.js, React, Supabase, Tailwind CSS, shadcn/ui, RLS, Storage, and supporting libraries.

### 7. System Architecture

Browser UI -> Next.js App Router -> Supabase Auth/Postgres/Storage, with small helper routes for auth and admin flows.

### 8. Database Design

Profiles, clubs, events, tasks, RSVP records, volunteer signups, and club memberships.

### 9. Module Breakdown

- Authentication
- Events
- Clubs
- Student dashboard
- Organizer dashboard
- Admin dashboard
- Media upload

### 10. Workflow

Sign up -> confirm email -> browse events -> RSVP/volunteer/join clubs -> organizers manage events -> admins approve organizers.

### 11. Key Features

Search, filters, RSVP, volunteering, club joining, event management, CSV export, image upload, dark mode, and admin approvals.

### 12. Screenshots to Capture

- Home page
- Events list
- Club list
- Club detail
- Event detail
- Student dashboard
- Organizer dashboard
- Create event
- Manage event
- Admin sign-in
- Admin dashboard

### 13. Challenges Faced

Role control, RLS configuration, upload validation, and keeping the app simple while covering multiple user roles.

### 14. Results

A working campus platform that supports discovery, attendance, volunteering, club participation, and role-based management.

### 15. Future Scope

Notifications, attendance check-in, audit logging, improved privacy, pagination, and analytics.

### 16. Conclusion

Campus Pulse demonstrates a practical campus platform built with a modern React stack and Supabase-backed data/auth control.

## Final Notes

This report is based on repository inspection and live verification in the current environment. Any item marked Not verified should be confirmed manually before formal submission if needed.