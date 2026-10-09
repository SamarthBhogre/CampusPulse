const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('privacy migration keeps organizer self-promotion disabled', () => {
  const sql = read('supabase/migrations/009_privacy_aggregates.sql');
  const roleMigration = read('supabase/migrations/005_auth_role_hardening.sql');
  assert.match(roleMigration, /values \([\s\S]*'student'/i);
  assert.match(sql, /profiles_event_participant_read/);
  assert.match(sql, /signups_owner_read/);
  assert.match(sql, /rsvps_owner_read/);
});

test('privacy migration exposes aggregate functions without raw public participation reads', () => {
  const sql = read('supabase/migrations/009_privacy_aggregates.sql');
  assert.match(sql, /get_event_task_summary/);
  assert.match(sql, /get_event_rsvp_summary/);
  assert.match(sql, /get_club_member_counts/);
  assert.match(sql, /revoke select on public\.volunteer_signups from anon, authenticated/);
  assert.match(sql, /revoke select on public\.event_rsvps from anon, authenticated/);
  assert.match(sql, /drop view if exists public\.public_profiles/);
});

test('query hardening avoids a redundant clubs name index', () => {
  const sql = read('supabase/migrations/008_query_hardening.sql');
  assert.doesNotMatch(sql, /idx_clubs_name/);
  assert.match(sql, /idx_events_visibility_starts_at/);
});

test('event discovery uses bounded database queries and aggregate capacity data', () => {
  const page = read('app/events/page.js');
  // Paging, search, and capacity aggregation happen inside the get_events_page RPC.
  assert.match(page, /rpc\('get_events_page'/);
  assert.match(page, /p_page_size:\s*PAGE_SIZE/);
  assert.match(page, /p_search:/);
  assert.match(page, /capacity=\{ev\.capacity\}/);
  assert.doesNotMatch(page, /volunteer_signups\(id\)/);
});
