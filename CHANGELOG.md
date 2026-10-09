# Changelog

All notable changes to CampusPulse are documented here.

---

## [2.4.0] — 2026-10-10 — In-App AI Assistant

### ✨ Features

- Added a chat assistant to the website for signed-in users. It uses a
  floating button on every page except the auth pages, and is powered by
  Gemini (`gemini-3.5-flash` by default, free API tier).
- The assistant uses the same tools as the MCP server, run in-process with
  the user's own session. Students can find events, register, volunteer, and
  manage their profile. Organizers can also manage their events.
- Cancellations, event updates, announcements, and moderation appear as a
  preview card with **Confirm** / **Cancel** buttons. The model can never
  approve these itself; only the user's click runs them.

### 🔒 Security

- `POST /api/assistant` verifies the Supabase session cookie. Tools run with
  the user's RLS-scoped client and the same role gating as `/api/mcp`.
- The Gemini API key stays on the server.

### ✅ Tests

- Added 9 assistant tests with Gemini mocked: tool loop, `confirm` stripped
  from model calls, per-role tool lists, rate-limit handling, and
  confirm-only-confirmable actions.

### ⚙️ Setup

- Set `GEMINI_API_KEY` (free from Google AI Studio) in `.env.local` and in
  Vercel. `GEMINI_MODEL` is optional.

---

## [2.3.0] — 2026-10-09 — MCP Server

### ✨ Features

- Added a Model Context Protocol server built on the official TypeScript SDK
  (`@modelcontextprotocol/sdk@1.26.0`) and `mcp-handler@1.1.0`, using stateless
  Streamable HTTP on Vercel.
  - `/api/mcp`: OAuth 2.1 via Supabase Auth; tools follow the user's role.
  - `/api/mcp/public`: read-only public discovery, no sign-in.
- 23 tools across event discovery, registration, volunteering, profile,
  organizer management, and admin moderation. See `docs/MCP.md`.
- New `/oauth/consent` page for Supabase's OAuth server, and sign-in now
  supports a safe `?next=` return path.

### 🔒 Security

- Identity comes from the verified bearer token, and role comes from
  `profiles`. Only OAuth-issued tokens (with a `client_id` claim) are accepted.
- Student actions run as the user, so RLS, unique constraints, and the
  capacity triggers enforce access, duplicates, and overbooking.
- Cancellations, event updates, announcements, and moderation need
  `confirm: true` and otherwise return a preview without changing anything.

### ♻️ Refactor

- Moved event, task, announcement, participation, profile, and moderation
  logic into `lib/services/*`, shared by the API routes and the MCP tools.
  Route behaviour is unchanged.

### 🐛 Bug Fixes

- Fixed admin event moderation, user suspension, and organizer approval
  returning errors after a successful update. `rpc(...).catch()` throws
  because Supabase query builders have no `.catch` method.

### ✅ Tests

- Added 31 MCP tests (tool access per role, identity, duplicate/full/RLS
  failures, confirmation previews, token verification) using the MCP client
  over an in-memory transport. `npm test` now runs them.

### ⚙️ Setup

- Enable the OAuth 2.1 server in Supabase (Authentication → OAuth Server),
  set the authorization path to `/oauth/consent`, and enable dynamic client
  registration. No new environment variables.

---

## [2.2.1] — 2026-10-09 — Full Badge on Event Cards

### ✨ Features

- Event cards on the events page show a **Full** badge when the attendee limit
  is reached, or **Closed** when the organizer has closed registrations.

### 🔒 Database

- Migration `021_events_page_registration.sql` updates `get_events_page` to
  return each event's `registration` state (`max_attendees`,
  `registration_mode`, `rsvp_count`). Existing fields are unchanged.
  **Apply before deploying** for the badge to appear (cards render normally
  without it).

### ✅ Tests

- Added coverage for the registration data in `get_events_page` and the
  event card badge.

---

## [2.2.0] — 2026-10-09 — Event Attendee Capacity

### ✨ Features

- Organizers can set an optional attendee limit when creating or editing an
  event (blank = unlimited).
- Registrations close automatically once the limit is reached and reopen if an
  attendee cancels.
- New "Registrations" card on the manage-event page lets organizers close
  registrations manually, reopen them past the limit, or return to following
  the limit (`PATCH /api/organizer/events/[id]/registration`).
- Event pages show "X / Y attending" and spots left, and disable the RSVP
  button with "Event full" / "Registrations closed" when closed. Existing
  attendees can still cancel.
- Organizer dashboard shows RSVP counts against the limit.

### 🔒 Database

- Migration `020_event_attendee_capacity.sql` adds `events.max_attendees` and
  `events.registration_mode` (`auto` | `open` | `closed`), plus a
  `BEFORE INSERT` trigger on `event_rsvps` that locks the event row to prevent
  concurrent overbooking. **Apply before deploying** — event pages read the
  new columns.
- The RSVP API returns `409` with a clear message for full or closed events.

### ✅ Tests

- Added attendee capacity coverage to the security suite.
- Updated the stale Phase 1 event discovery test to check the
  `get_events_page` RPC instead of the removed client-side queries. All 113
  tests pass.

---

## [2.1.10] — 2026-10-09 — Organizer Approval Update Fix

### 🐛 Bug Fixes

- Fixed organizer approval failures caused by combining the database mutation
  with the returned-row query.
- Approval now updates the profile first, then loads the updated result
  separately before sending the success response.

### ✅ Tests

- Added regression coverage for the separated organizer approval mutation and
  response read.

---

## [2.1.9] — 2026-10-09 — Account Deletion Fix

### 🐛 Bug Fixes

- Fixed account deletion failing after usernames became required.
- Auth deletion now happens before any local cleanup, preventing partially
  anonymized accounts when the Auth operation fails.
- Explicitly requests permanent Supabase Auth deletion.

### ✅ Tests

- Added regression coverage for required-username account deletion. The
  security suite passes 104/104 tests.

---

## [2.1.8] — 2026-10-09 — User Suspension Update Fix

### 🐛 Bug Fixes

- Fixed admin suspend/restore actions failing during Supabase update response
  handling.
- Admin user actions now return a guaranteed JSON success response and tolerate
  empty error responses in the dashboard.

### ✅ Tests

- Added regression coverage for admin suspend/restore response handling. The
  security suite passes 103/103 tests.

---

## [2.1.7] — 2026-10-09 — Organizer Approval Response Fix

### 🐛 Bug Fixes

- Fixed organizer approval showing `Unexpected end of JSON input` after a
  successful approval when the response body was empty or non-JSON.
- Added regression coverage for tolerant admin approval response handling.

---

## [2.1.6] — 2026-10-08 — Required Usernames & Demo Participation

### ✨ New Features

- Usernames are now required during account creation and in the database.
- Existing profiles receive collision-safe usernames during migration 019 and
  can update them from Settings.
- Demo accounts receive deterministic usernames such as `demo_0001`.
- The demo generator assigns `smbhogre@gmail.com` several randomized public
  event RSVPs when that account exists.

### 🔒 Security

- New-user profile creation rejects missing, invalid, or duplicate usernames.
- Username clearing is disabled after the required-username migration.

### ✅ Tests

- Added coverage for required usernames, signup metadata, migration backfill,
  and demo participation. The security suite passes 101/101 tests.

---

## [2.1.5] — 2026-10-08 — Organizer Event Announcements

### ✨ New Features

- Added organizer announcements for event RSVP attendees, volunteers, or both.
- Added private in-app organizer message notifications with a 1,000-character
  limit and duplicate-recipient protection.
- Added organizer message rendering in the notification center.

### 🔒 Security

- Announcement sending requires an approved organizer who owns the event.
- Recipient selection uses participant IDs and does not expose student emails.

### ✅ Tests

- Added authorization, ownership, validation, deduplication, and UI contract
  coverage for announcements. The security suite passes 98/98 tests.

---

## [2.1.5] — 2026-10-08 — Demo Data Migration Safety

- Added a seed option to the demo-data generator so fresh environments can
  produce different deterministic datasets.
- Preserved `smbhogre@gmail.com` as a student/member when assigning demo club
  manager records.

---

## [2.1.4] — 2026-10-05 — Mumbai Function Region

- Configured Vercel Functions to run in Mumbai (`bom1`) to reduce latency for
  the India-based Supabase deployment and users.

---

## [2.1.3] — 2026-10-05 — Admin Club Listing Fix

### 🐛 Bug Fixes

- Fixed the admin clubs API returning HTTP 500 when loading manager names by
  replacing the unsupported `public_profiles` relationship embed with explicit
  manager and profile lookups.

---

## [2.1.2] — 2026-10-05 — Health Checks & Notifications

### ✨ New Features

- Expanded admin System Health with Auth, event-covers bucket configuration,
  schema, critical RPC, deployment-version, and latency checks.
- Added user RSVP and volunteer confirmation notifications.
- Added organizer notifications when users RSVP or volunteer for their events.
- Added participant notifications for organizer event updates and admin event
  cancellations.
- Added a notification test utility for validating student and organizer inboxes.

### 🐛 Bug Fixes

- Fixed the System Health page/API response mismatch that left the checks grid
  empty.
- Degraded health responses now remain visible instead of being hidden by a
  generic error state.

---

## [2.1.1] — 2026-10-05 — System Health Dashboard Fix

- Fixed the admin System Health page reading `health` while the API returned
  `checks`, which left the checks grid empty.
- Added database and Storage latency values and ensured degraded health details
  remain visible with a successful API response.

---

## [2.1.0] — 2026-10-05 — Organizer Review & Club Management

### ✨ New Features

- Added organizer applications with organization name/type, website, description,
  and previous organizing experience.
- Added pending-review and rejected-application screens. Applicants can browse
  events and clubs while access is under review.
- Added permanent account/data deletion for rejected organizer applicants.
- Added student club creation requests with admin approval and automatic first
  manager/member assignment.
- Added club manager assignments and admin club-request management.
- Added repeatable demo-data generation for users, clubs, events, memberships,
  RSVPs, tasks, and volunteer signups.
- Added Supabase Storage bucket/RLS setup for event cover image uploads.

### 🔒 Security

- Organizer applicants remain students until explicitly approved by an admin.
- Middleware restricts pending/rejected applicants from dashboards and other
  application areas.
- Club request approval is transactional and creates the club, manager, and
  initial membership together.
- Permanent deletion removes rejected applicants' profile, requests,
  memberships, participation records, and Auth account.

---

## [2.0.0] — 2026-10-01 — Production Hardening

This release takes CampusPulse from MVP/pre-production to a production-ready state.
It covers security hardening, bug fixes, a complete admin dashboard, attendance tracking,
notifications, structured observability, and a comprehensive test suite.

---

### 🔒 Security

- **Fix critical RSVP/volunteer authorization bypass** — Non-members could previously RSVP
  to or volunteer for club-only events directly via the Supabase client. Authorization is
  now enforced at the database level via `can_participate_in_event()`, `rsvp_to_event()`,
  and `volunteer_for_task()` security-definer RPCs (migration 010). Frontend calls are
  routed through validated server-side API routes; direct client inserts are gone.
- **Centralize all sensitive mutations through API routes** — Event creation, editing,
  deletion, task management, RSVP, and volunteer operations now all go through
  authenticated, ownership-verified API routes instead of direct browser Supabase calls.
- **Add `requireOrganizer()` helper** (`lib/organizer-auth.js`) — Consistent server-side
  organizer guard used across all organizer routes.
- **Organizer A cannot touch Organizer B's events** — Every organizer mutation verifies
  `created_by = auth.user.id` before proceeding.
- **Unknown API paths return 404** — The previous catch-all returned `200 OK` for any
  path. It now returns `404 Not Found`.
- **Structured logger with PII sanitization** (`lib/logger.js`) — Passwords, tokens,
  secrets, and keys are automatically redacted from log output. JSON format in production,
  human-readable in development.

---

### 🐛 Bug Fixes

- **BUG-002** — Organizer event management page was stuck on skeleton UI when an error
  occurred. Now has distinct `loading`, `loadError`, and `notFound` states with a retry
  action and proper `ErrorState` component rendering.
- **BUG-003** — "Has openings" filter was applied client-side on an already-paginated
  slice of results. A new `get_events_page` RPC (migration 011) applies the `open_only`
  filter before `LIMIT/OFFSET`, so pagination counts and results are always accurate.
- **BUG-005** — Added a dedicated `/api/health` endpoint returning structured health JSON.
  The catch-all route now returns `404` for all unmatched paths.
- **BUG-008** — Fixed React `useEffect` missing dependency warnings across six pages:
  `app/events/page.js`, `app/events/[id]/page.js`, `app/clubs/page.js`,
  `app/clubs/[id]/page.js`, `app/dashboard/organizer/page.js`,
  `app/dashboard/organizer/events/[id]/page.js`. All `load` functions are now wrapped
  in `useCallback` with correct dependency arrays.
- **BUG-010 (partial)** — Improved `alt` text on event cover images and club event cards.
  Added `aria-hidden="true"` to decorative icons. Added `aria-label` on destructive
  action buttons.
- **Fix `/api/admin/system-health` 404** — System Health page was calling the wrong URL.
  Corrected to `/api/admin/health`.
- **Fix `is_suspended` column missing** — Admin Users page was crashing with a 500 error
  because the `profiles.is_suspended` column did not exist. Migration 013 adds it.

---

### ✨ New Features

#### Admin Dashboard (complete rewrite)

The admin area is now a full campus administration and operations centre.

- **Overview** (`/admin/dashboard`) — Real-time metric cards: total users by role,
  events by time window and status, total RSVPs, volunteer signups, clubs, and a
  prominent banner for pending organizer requests.
- **Organizer Management** (`/admin/dashboard/organizers`) — Approve and reject
  organizer applications. Every decision writes an audit log entry and enqueues a
  notification to the applicant.
- **User Management** (`/admin/dashboard/users`) — Paginated, searchable user list
  with role filter. Suspend and restore accounts with confirmation dialogs.
- **Event Moderation** (`/admin/dashboard/events`) — Paginated event list with status
  filter. Hide, cancel, and restore events with audit trail.
- **Club Management** (`/admin/dashboard/clubs`) — Searchable club list with live
  member counts.
- **Analytics** (`/admin/dashboard/analytics`) — Time-series charts (7 / 30 / 90 days)
  for events created, RSVPs, volunteer signups, and most-active clubs by event count.
  Powered by Recharts.
- **Audit Log** (`/admin/dashboard/audit-log`) — Paginated, colour-coded log of all
  administrative actions with actor identity, target, and metadata.
- **System Health** (`/admin/dashboard/system-health`) — Live database and storage
  connectivity checks with overall status banner.
- **Sidebar layout** (`app/admin/dashboard/layout.js`) — Collapsible sidebar with
  navigation, pending-request badge, admin identity footer, and sign-out.

#### New Admin API Routes

| Route | Purpose |
|---|---|
| `GET /api/admin/stats` | Aggregated platform statistics |
| `GET /api/admin/users` | Paginated user list with search and role filter |
| `PATCH /api/admin/users/[id]` | Suspend / restore / remove organizer role |
| `GET /api/admin/events` | Paginated event list with search and status filter |
| `PATCH /api/admin/events/[id]` | Hide / restore / cancel event |
| `GET /api/admin/clubs` | Paginated club list with member counts |
| `GET /api/admin/audit-log` | Paginated admin audit log |
| `GET /api/admin/analytics` | Time-series analytics data |
| `GET /api/admin/health` | DB + Storage health probe |

#### Attendance Tracking

- New `event_attendance` table with RLS (migration 012).
- `GET/POST/DELETE /api/organizer/events/[id]/attendance` — Organizers can mark
  attendance, undo check-ins, and list attendees with profile details. All endpoints
  verify event ownership before processing.

#### Notification System

- `lib/notifications/index.js` — `enqueueNotification(recipientId, type, payload)`
  writes to a `notification_queue` table (migration 012). Fire-and-forget; errors
  never block the main request.
- `NOTIFICATION_TYPES` constants for all system events.
- Organizer approval and rejection now enqueue notifications to the applicant.

---

### 🗄️ Database Migrations

| File | Description |
|---|---|
| `010_club_only_rsvp_enforcement.sql` | `can_participate_in_event`, `rsvp_to_event`, `volunteer_for_task` RPCs; fixed INSERT policies on `event_rsvps` and `volunteer_signups` |
| `011_events_page_rpc.sql` | `get_events_page` RPC — server-side pagination with open-only filter before LIMIT/OFFSET |
| `012_attendance_audit_notifications.sql` | `event_attendance`, `admin_audit_log`, `notification_queue`, `notification_preferences` tables; `write_audit_log()` security-definer function; `status` column on `events` |
| `013_profiles_is_suspended.sql` | `is_suspended` boolean column on `profiles` with partial index |

---

### 🧪 Tests

- **`tests/security.test.cjs`** — 79 static analysis tests covering:
  - Security: club-only RSVP/volunteer enforcement
  - Authorization: every admin and organizer route is guarded
  - Organizer cross-event isolation
  - All confirmed bug fixes (BUG-002, BUG-003, BUG-005, BUG-008)
  - Zod validation schemas
  - Complete migration chain
  - Admin dashboard page coverage
  - Logger, notifications, and attendance API

**Result: 79 / 79 passing.**

---

### 🔧 Refactors & Code Quality

- `app/api/organizer/events/route.js` — Migrated from inline auth to `requireOrganizer()`.
- `app/api/organizer/events/[id]/route.js` — Added `GET` (fetch for edit form) and
  `DELETE` handlers. PATCH now uses explicit field mapping and ownership pre-check.
- `app/api/admin/organizer-requests/[id]/route.js` — Now writes audit log entry and
  enqueues notification on every decision.
- `lib/validation/events.js` and `lib/validation/tasks.js` — Shared Zod schemas used
  by both create and edit flows.
- `app/clubs/[id]/page.js` — Added proper loading skeleton, `ErrorState` on failure,
  improved alt text on event images.

---

### 📦 New Files Summary

```
lib/logger.js
lib/organizer-auth.js
lib/notifications/index.js
lib/validation/events.js
lib/validation/tasks.js
app/api/health/route.js
app/api/events/[id]/rsvp/route.js
app/api/events/[id]/volunteer/route.js
app/api/organizer/events/[id]/attendance/route.js
app/api/admin/stats/route.js
app/api/admin/users/route.js
app/api/admin/users/[id]/route.js
app/api/admin/events/route.js
app/api/admin/events/[id]/route.js
app/api/admin/clubs/route.js
app/api/admin/audit-log/route.js
app/api/admin/analytics/route.js
app/api/admin/health/route.js
app/admin/dashboard/layout.js
app/admin/dashboard/organizers/page.js
app/admin/dashboard/users/page.js
app/admin/dashboard/events/page.js
app/admin/dashboard/clubs/page.js
app/admin/dashboard/analytics/page.js
app/admin/dashboard/audit-log/page.js
app/admin/dashboard/system-health/page.js
supabase/migrations/010_club_only_rsvp_enforcement.sql
supabase/migrations/011_events_page_rpc.sql
supabase/migrations/012_attendance_audit_notifications.sql
supabase/migrations/013_profiles_is_suspended.sql
tests/security.test.cjs
```
