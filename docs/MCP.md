# CampusPulse MCP Server

CampusPulse exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so AI assistants (Claude, Cursor, etc.) can discover events, register students, and help organizers manage events. It's built with the official TypeScript MCP SDK (`@modelcontextprotocol/sdk@1.26.0`) and Vercel's `mcp-handler@1.1.0`, using stateless Streamable HTTP, so it runs on Vercel serverless functions with no Redis.

## Endpoints

| Endpoint | Auth | Tools |
| --- | --- | --- |
| `https://<your-app>/api/mcp` | OAuth 2.1 (Supabase Auth) | Every tool the signed-in user's role allows |
| `https://<your-app>/api/mcp/public` | None | Read-only public discovery tools |
| `https://<your-app>/.well-known/oauth-protected-resource/api/mcp` | None | RFC 9728 metadata pointing clients to Supabase Auth |

An unauthenticated request to `/api/mcp` returns `401` with a `WWW-Authenticate` header naming the metadata URL, which is how MCP clients find out where to sign in.

## Required configuration

No new environment variables are needed. The server uses the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is used only on the server after authorization succeeds, and it's never sent to MCP clients.

In the Supabase dashboard, under **Authentication → OAuth Server**:

1. **Enable** the OAuth 2.1 server.
2. Set the **Authorization path** to `/oauth/consent`. The **Site URL** (Authentication → URL Configuration) must be your deployed app URL.
3. Enable **Dynamic client registration** so MCP clients can register themselves. Otherwise, register each client manually under OAuth Apps.
4. Recommended: switch JWT signing to asymmetric keys (Project Settings → JWT Keys), as Supabase advises for OAuth.

Apply migrations `020_event_attendee_capacity.sql` and `021_events_page_registration.sql` first if you haven't already.

## Connecting a client

Add `https://<your-app>/api/mcp` as a remote MCP server (for example, in Claude: Settings → Connectors → Add custom connector). The client opens `/oauth/consent`, where the user signs in and approves access.

## Tools and permissions

| Tool | Access | Notes |
| --- | --- | --- |
| `search_events` | Public | Keyword, club (the app's category), date range; upcoming by default |
| `get_upcoming_events` | Public | |
| `get_event_details` | Public | Includes registration status and volunteer tasks |
| `check_event_capacity` | Public | Attending, limit, seats left, open/closed |
| `search_volunteer_tasks` | Public | Upcoming active events only |
| `get_volunteer_task_details` | Public | |
| `register_for_event` | Student | Own RSVP only |
| `cancel_event_registration` | Student | **Requires `confirm: true`** |
| `get_my_registrations` | Student | |
| `sign_up_for_volunteer_task` | Student | Own signup only |
| `cancel_volunteer_signup` | Student | **Requires `confirm: true`** |
| `get_my_volunteering` | Student | |
| `get_my_profile` | Student | |
| `update_my_profile` | Student | Display name and username only |
| `create_event` | Organizer | `created_by` is always the caller |
| `update_event` | Organizer (own events) | **Requires `confirm: true`** (notifies all participants) |
| `cancel_event` | Organizer (own) / Admin (any) | **Requires `confirm: true`** |
| `create_volunteer_task` | Organizer (own events) | |
| `update_volunteer_task` | Organizer (own events) | Capacity can't drop below current signups |
| `get_event_participants` | Organizer (own) / Admin (any) | Names, usernames, emails, check-ins |
| `get_event_statistics` | Organizer (own) / Admin (any) | Registration, attendance, volunteering |
| `send_event_announcement` | Organizer (own events) | **Requires `confirm: true`** |
| `moderate_event` | Admin | hide / restore / cancel; **requires `confirm: true`** |

"Student" means any signed-in, non-suspended user. Organizers and admins also get the student tools. Suspended accounts only get the public tools. Each client only sees the tools it's allowed to call, and every protected handler checks the role again.

`search_campus_information` isn't implemented, because CampusPulse has no FAQ, policy, or facility data. Events have no category field, so the club acts as the category.

## Security model

- **Identity:** the bearer token is verified with Supabase Auth on every request. Only tokens issued to an OAuth client (with a `client_id` claim) are accepted, so browser session tokens can't be replayed. The user id comes from the verified token, and the role comes from `profiles`, never from tool arguments or token metadata.
- **Row-level security (RLS):** student reads and writes go through a Supabase client acting as the user, so the existing RLS policies, `update_own_profile`, and club-membership checks apply unchanged.
- **Duplicates and overbooking:** unique constraints on `(event_id, profile_id)` and `(task_id, profile_id)` block duplicates. The `enforce_event_rsvp_capacity` and `enforce_task_capacity` triggers lock the parent row, so concurrent signups can't overbook.
- **Organizer scope:** ownership is checked (`created_by = caller`) before any service-role query touches an event's data.
- **Confirmation:** consequential tools return a preview and change nothing unless they're called again with `confirm: true`.
- **Read-only tools** are annotated `readOnlyHint: true` and only call read paths.
- **Shared logic:** `lib/services/*` holds the business logic used by both the web API routes and the MCP tools.

## Tests

```bash
npm run test:mcp   # MCP tools, permissions, identity, confirmation, token verification
npm test           # security suite + MCP suite
```
