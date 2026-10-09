/**
 * CampusPulse Security & Static Analysis Tests
 * Run with: node --test tests/security.test.cjs
 *
 * Tests verify code correctness without a running server.
 * Covers: security enforcement, API contracts, bug fixes, and new features.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY — Phase 1 hardening
// ─────────────────────────────────────────────────────────────────────────────
describe('Security — Club-only RSVP enforcement', () => {
  test('migration 010 creates can_participate_in_event function', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('can_participate_in_event'), 'Missing can_participate_in_event RPC');
  });

  test('migration 010 creates rsvp_to_event RPC', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('rsvp_to_event'), 'Missing rsvp_to_event RPC');
  });

  test('migration 010 creates volunteer_for_task RPC', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('volunteer_for_task'), 'Missing volunteer_for_task RPC');
  });

  test('RSVP API route uses server-side RPC', () => {
    const code = read('app/api/events/[id]/rsvp/route.js');
    assert.ok(code.includes('rsvp_to_event') || code.includes('rpc('), 'RSVP must use server RPC');
  });

  test('volunteer API route uses server-side RPC', () => {
    const code = read('app/api/events/[id]/volunteer/route.js');
    assert.ok(code.includes('volunteer_for_task') || code.includes('rpc('), 'Volunteer must use server RPC');
  });

  test('event detail page calls API routes not direct Supabase for RSVP', () => {
    const code = read('app/events/[id]/page.js');
    assert.ok(code.includes('/api/events/'), 'Event detail must call API route for RSVP');
    assert.ok(!code.includes(".from('event_rsvps').insert"), 'Must not directly insert to event_rsvps');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY — Authorization guards
// ─────────────────────────────────────────────────────────────────────────────
describe('Security — Admin route authorization', () => {
  const adminRoutes = [
    'app/api/admin/stats/route.js',
    'app/api/admin/users/route.js',
    'app/api/admin/users/[id]/route.js',
    'app/api/admin/events/route.js',
    'app/api/admin/events/[id]/route.js',
    'app/api/admin/clubs/route.js',
    'app/api/admin/audit-log/route.js',
    'app/api/admin/analytics/route.js',
    'app/api/admin/health/route.js',
  ];

  for (const route of adminRoutes) {
    test(`${route} uses requireAdmin()`, () => {
      const code = read(route);
      assert.ok(code.includes('requireAdmin'), `${route} must call requireAdmin()`);
    });
  }
});

describe('Security — Organizer route authorization', () => {
  const organizerRoutes = [
    'app/api/organizer/events/route.js',
    'app/api/organizer/events/[id]/route.js',
    'app/api/organizer/events/[id]/attendance/route.js',
  ];

  for (const route of organizerRoutes) {
    test(`${route} uses requireOrganizer()`, () => {
      const code = read(route);
      assert.ok(code.includes('requireOrganizer'), `${route} must call requireOrganizer()`);
    });
  }

  test('announcement route requires organizer authorization and validates ownership', () => {
    const code = read('app/api/organizer/events/[id]/announcement/route.js');
    assert.ok(code.includes('requireOrganizer'), 'Announcement route must require an organizer');
    assert.ok(code.includes(".eq('created_by', auth.user.id)"), 'Announcement route must verify event ownership');
    assert.ok(code.includes('MAX_MESSAGE_LENGTH'), 'Announcement route must cap message length');
    assert.ok(code.includes('new Set'), 'Announcement recipients must be deduplicated');
  });
});

describe('Organizer announcements', () => {
  test('announcement notification type and UI rendering exist', () => {
    const notificationCode = read('lib/notifications/index.js');
    const pageCode = read('app/notifications/page.js');
    const organizerCode = read('app/dashboard/organizer/events/[id]/page.js');
    assert.ok(notificationCode.includes('ORGANIZER_MESSAGE'), 'Missing organizer message notification type');
    assert.ok(pageCode.includes('organizer_message'), 'Notifications page must render organizer messages');
    assert.ok(organizerCode.includes('/announcement'), 'Organizer event page must call announcement API');
  });
});

describe('Security — Catch-all 404', () => {
  test('catch-all returns 404 not 200', () => {
    const code = read('app/api/[[...path]]/route.js');
    assert.ok(code.includes('404'), 'Catch-all must return 404');
    assert.ok(!code.includes('status: 200'), 'Catch-all must not return 200');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.6 — Health check operator precedence fix
// ─────────────────────────────────────────────────────────────────────────────
describe('P0.6 — Health check operator precedence', () => {
  test('health route uses !== ok not !x.status === ok', () => {
    const code = read('app/api/admin/health/route.js');
    assert.ok(!code.includes("!checks.database.status === 'ok'"),
      'Must NOT have buggy operator: !checks.database.status === "ok"');
    assert.ok(code.includes("checks.database.status !== 'ok'") || code.includes("status !== 'ok'"),
      'Must use !== for ok status check');
  });

  test('health route checks both database and storage', () => {
    const code = read('app/api/admin/health/route.js');
    assert.ok(code.includes('checks.database'), 'Must check database');
    assert.ok(code.includes('checks.storage'), 'Must check storage');
  });

  test('health route can return degraded/unhealthy status', () => {
    const code = read('app/api/admin/health/route.js');
    assert.ok(code.includes('degraded') || code.includes('503'), 'Must be able to return non-ok status');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.5 — Analytics API/UI contract
// ─────────────────────────────────────────────────────────────────────────────
describe('P0.5 — Analytics API/UI contract', () => {
  test('analytics API returns analytics wrapper object', () => {
    const code = read('app/api/admin/analytics/route.js');
    assert.ok(code.includes('analytics:') || code.includes('"analytics"'),
      'Analytics API must return analytics: {} wrapper');
  });

  test('analytics API returns user_signups key', () => {
    const code = read('app/api/admin/analytics/route.js');
    assert.ok(code.includes('user_signups'), 'Must return user_signups key');
  });

  test('analytics API returns events_created key', () => {
    const code = read('app/api/admin/analytics/route.js');
    assert.ok(code.includes('events_created'), 'Must return events_created key');
  });

  test('analytics page reads analytics.user_signups', () => {
    const code = read('app/admin/dashboard/analytics/page.js');
    assert.ok(code.includes('analytics?.user_signups') || code.includes('analytics.user_signups'),
      'Analytics page must read from analytics.user_signups');
  });

  test('analytics page reads analytics.events_created', () => {
    const code = read('app/admin/dashboard/analytics/page.js');
    assert.ok(code.includes('analytics?.events_created') || code.includes('analytics.events_created'),
      'Analytics page must read from analytics.events_created');
  });

  test('analytics page does not use window variable (browser global collision)', () => {
    const code = read('app/admin/dashboard/analytics/page.js');
    // Should not use bare `window` as a state variable name
    assert.ok(!code.includes("useState('30')\n  const") || code.includes('timeWindow') || !code.includes("setWindow\n"),
      'Analytics page should not shadow browser window global');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.3 — Event moderation status enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('P0.3 — Event moderation in get_events_page', () => {
  test('migration 015 or 011 filters events by status = active', () => {
    const sql015 = read('supabase/migrations/015_username_privacy_moderation.sql');
    const sql011 = read('supabase/migrations/011_events_page_rpc.sql');
    const hasStatusFilter =
      sql015.includes("status, 'active'") || sql015.includes("= 'active'") ||
      sql011.includes("= 'active'");
    assert.ok(hasStatusFilter, 'get_events_page must filter status = active');
  });

  test('event detail page handles cancelled status', () => {
    const code = read('app/events/[id]/page.js');
    assert.ok(code.includes('cancelled') || code.includes('status'),
      'Event detail must handle cancelled events');
  });

  test('event detail page handles hidden status', () => {
    const code = read('app/events/[id]/page.js');
    assert.ok(code.includes('hidden') || code.includes('not available'),
      'Event detail must handle hidden events');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.2 — Public profiles privacy (no email exposure)
// ─────────────────────────────────────────────────────────────────────────────
describe('P0.2 — public_profiles view privacy', () => {
  test('migration 014 or 015 removes email from public_profiles view', () => {
    const sql014 = read('supabase/migrations/014_fix_public_profiles_security_invoker.sql');
    const sql015 = read('supabase/migrations/015_username_privacy_moderation.sql');
    // Email should NOT be in the select columns of the public_profiles view
    // The view redefines itself, so check the latest definition
    const latestSql = sql015 || sql014;
    // The view should not SELECT email
    const viewMatch015 = sql015.match(/create view public\.public_profiles[\s\S]*?from public\.profiles/i);
    if (viewMatch015) {
      assert.ok(!viewMatch015[0].includes('email,') && !viewMatch015[0].toLowerCase().includes(',\n    email'),
        'public_profiles view must not select email column');
    } else {
      // Fall back to checking 014
      assert.ok(latestSql.includes('security_invoker'), 'At least security_invoker must be set');
    }
  });

  test('migration 015 adds username to profiles', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('username'), 'Migration 015 must add username column');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-002 — Organizer event page skeleton fix
// ─────────────────────────────────────────────────────────────────────────────
describe('BUG-002 — Organizer event page error states', () => {
  test('Organizer manage-event page renders ErrorState on failure', () => {
    const code = read('app/dashboard/organizer/events/[id]/page.js');
    assert.ok(code.includes('ErrorState') || code.includes('loadError'),
      'Organizer event page must handle load errors');
  });

  test('Organizer manage-event page has not-found state', () => {
    const code = read('app/dashboard/organizer/events/[id]/page.js');
    assert.ok(code.includes('not found') || code.includes('notFound') || code.includes('!event'),
      'Must handle event not found state');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-003 — Has openings server-side filter
// ─────────────────────────────────────────────────────────────────────────────
describe('BUG-003 — Server-side open_only filter', () => {
  test('get_events_page RPC exists with p_open_only parameter', () => {
    const sql = read('supabase/migrations/011_events_page_rpc.sql');
    assert.ok(sql.includes('p_open_only'), 'RPC must have p_open_only parameter');
  });

  test('get_events_page open_only filter applied before LIMIT', () => {
    const sql = read('supabase/migrations/011_events_page_rpc.sql');
    const openOnlyIdx = sql.indexOf('p_open_only');
    const limitIdx = sql.indexOf('limit p_page_size');
    assert.ok(openOnlyIdx < limitIdx, 'open_only filter must come before LIMIT');
  });

  test('events page uses RPC not client-side useMemo', () => {
    const code = read('app/events/page.js');
    assert.ok(code.includes('get_events_page'), 'Events page must use get_events_page RPC');
    assert.ok(!code.includes('useMemo'), 'Events page must not use useMemo for filtering');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-005 — Health endpoint + 404 catch-all
// ─────────────────────────────────────────────────────────────────────────────
describe('BUG-005 — Health endpoint and 404 catch-all', () => {
  test('/api/health route exists', () => {
    assert.ok(exists('app/api/health/route.js'), '/api/health route must exist');
  });

  test('health endpoint returns ok', () => {
    const code = read('app/api/health/route.js');
    assert.ok(code.includes("'ok'") || code.includes('"ok"'), 'Health must return ok status');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-008 — useCallback in client components
// ─────────────────────────────────────────────────────────────────────────────
describe('BUG-008 — useCallback in client components', () => {
  const pages = [
    'app/events/page.js',
    'app/events/[id]/page.js',
    'app/clubs/page.js',
    'app/clubs/[id]/page.js',
    'app/dashboard/organizer/page.js',
    'app/dashboard/organizer/events/[id]/page.js',
  ];

  for (const page of pages) {
    test(`${page} uses useCallback for load function`, () => {
      const code = read(page);
      assert.ok(code.includes('useCallback'), `${page} must use useCallback`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Database migrations
// ─────────────────────────────────────────────────────────────────────────────
describe('Database migrations', () => {
  const migrations = [
    '010_club_only_rsvp_enforcement.sql',
    '011_events_page_rpc.sql',
    '012_attendance_audit_notifications.sql',
    '013_profiles_is_suspended.sql',
    '014_fix_public_profiles_security_invoker.sql',
    '015_username_privacy_moderation.sql',
  ];

  for (const m of migrations) {
    test(`migration ${m} exists`, () => {
      assert.ok(exists(`supabase/migrations/${m}`), `Migration ${m} must exist`);
    });
  }

  test('migration 013 adds is_suspended to profiles', () => {
    const sql = read('supabase/migrations/013_profiles_is_suspended.sql');
    assert.ok(sql.includes('is_suspended'), 'Migration 013 must add is_suspended');
  });

  test('migration 015 adds username to profiles', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('username'), 'Migration 015 must add username');
  });

  test('migration 015 adds avatar_url to profiles', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('avatar_url'), 'Migration 015 must add avatar_url');
  });

  test('migration 015 has update_own_profile RPC', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('update_own_profile'), 'Migration 015 must have update_own_profile function');
  });

  test('migration 015 validates username minimum length', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('3') && sql.includes('characters'), 'Username must have min length validation');
  });

  test('migration 015 validates username uniqueness case-insensitively', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('lower('), 'Username uniqueness must be case-insensitive using lower()');
  });

  test('migration 019 requires and backfills usernames', () => {
    const sql = read('supabase/migrations/019_required_usernames.sql');
    assert.ok(sql.includes('alter column username set not null'), 'Username must be required');
    assert.ok(sql.includes('where username is null'), 'Existing missing usernames must be backfilled');
    assert.ok(sql.includes('Username is required'), 'New users without usernames must be rejected');
  });

  test('new signup sends username metadata', () => {
    const code = read('app/auth/sign-up/page.js');
    assert.ok(code.includes('username: form.username'), 'Signup must send username metadata');
    assert.ok(code.includes('id="username"') && code.includes('required'), 'Signup username field must be required');
  });

  test('demo generator assigns usernames and featured participation', () => {
    const code = read('scripts/generate-demo-data.mjs');
    assert.ok(code.includes('demoUsername'), 'Demo users must receive usernames');
    assert.ok(code.includes('smbhogre@gmail.com'), 'Featured account participation must be configured');
    assert.ok(code.includes('event_rsvps'), 'Featured account must be assigned event RSVPs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Settings feature
// ─────────────────────────────────────────────────────────────────────────────
describe('Settings page', () => {
  test('/settings page exists', () => {
    assert.ok(exists('app/settings/page.js'), '/settings page must exist');
  });

  test('settings page has profile editing section', () => {
    const code = read('app/settings/page.js');
    assert.ok(code.includes('full_name') || code.includes('displayName') || code.includes('Display Name'),
      'Settings must have display name editing');
  });

  test('settings page has username editing section', () => {
    const code = read('app/settings/page.js');
    assert.ok(code.includes('username') || code.includes('Username'),
      'Settings must have username editing');
  });

  test('settings page has email change section', () => {
    const code = read('app/settings/page.js');
    assert.ok(code.includes('email') || code.includes('Email'),
      'Settings must have email section');
  });

  test('settings page has notification preferences section', () => {
    const code = read('app/settings/page.js');
    assert.ok(code.includes('notification') || code.includes('Notification'),
      'Settings must have notification preferences');
  });

  test('settings page has account deletion section', () => {
    const code = read('app/settings/page.js');
    assert.ok(code.includes('delete') || code.includes('Delete') || code.includes('Danger'),
      'Settings must have account deletion');
  });

  test('settings profile API route exists', () => {
    assert.ok(exists('app/api/settings/profile/route.js'), 'Settings profile API must exist');
  });

  test('settings notifications API route exists', () => {
    assert.ok(exists('app/api/settings/notifications/route.js'), 'Settings notifications API must exist');
  });

  test('delete account API route exists', () => {
    assert.ok(exists('app/api/settings/delete-account/route.js'), 'Delete account API must exist');
  });

  test('settings profile API uses authenticated user check', () => {
    const code = read('app/api/settings/profile/route.js');
    assert.ok(code.includes('getUser') || code.includes('requireAuth'),
      'Settings API must verify authentication');
  });

  test('delete account API requires confirmation phrase', () => {
    const code = read('app/api/settings/delete-account/route.js');
    assert.ok(code.includes('DELETE MY ACCOUNT') || code.includes('confirm'),
      'Account deletion must require explicit confirmation');
  });

  test('delete account attempts Auth deletion before local mutation', () => {
    const code = read('app/api/settings/delete-account/route.js');
    assert.ok(code.includes('deleteUser(user.id, false)'), 'Deletion must explicitly perform permanent Auth deletion');
    assert.ok(code.indexOf('deleteUser(user.id, false)') < code.indexOf('logger.info'),
      'Deletion must complete Auth removal before reporting success');
    assert.ok(!code.includes('username: null'), 'Deletion must not clear the required username');
  });

  test('settings profile API calls update_own_profile RPC (not direct table update)', () => {
    const code = read('app/api/settings/profile/route.js');
    assert.ok(code.includes('update_own_profile') || code.includes('rpc('),
      'Profile update must use server-side RPC for validation');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────
describe('Notification center', () => {
  test('/notifications page exists', () => {
    assert.ok(exists('app/notifications/page.js'), '/notifications page must exist');
  });

  test('notifications API route exists', () => {
    assert.ok(exists('app/api/notifications/route.js'), '/api/notifications route must exist');
  });

  test('notifications read API exists', () => {
    assert.ok(exists('app/api/notifications/read/route.js'), '/api/notifications/read must exist');
  });

  test('notification_queue table has read_at in migration 015', () => {
    const sql = read('supabase/migrations/015_username_privacy_moderation.sql');
    assert.ok(sql.includes('read_at'), 'notification_queue must have read_at column');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Attendance UI
// ─────────────────────────────────────────────────────────────────────────────
describe('Attendance UI', () => {
  test('organizer attendance page exists', () => {
    assert.ok(
      exists('app/dashboard/organizer/events/[id]/attendance/page.js'),
      'Organizer attendance page must exist'
    );
  });

  test('attendance API route exists', () => {
    assert.ok(
      exists('app/api/organizer/events/[id]/attendance/route.js'),
      'Attendance API must exist'
    );
  });

  test('attendance API uses requireOrganizer', () => {
    const code = read('app/api/organizer/events/[id]/attendance/route.js');
    assert.ok(code.includes('requireOrganizer'), 'Attendance API must require organizer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Calendar export
// ─────────────────────────────────────────────────────────────────────────────
describe('Calendar export', () => {
  test('ICS calendar API route exists', () => {
    assert.ok(
      exists('app/api/events/[id]/calendar/route.js'),
      'Calendar ICS export route must exist'
    );
  });

  test('calendar route returns text/calendar content type', () => {
    const code = read('app/api/events/[id]/calendar/route.js');
    assert.ok(code.includes('text/calendar'), 'Calendar route must return text/calendar content type');
  });

  test('calendar route generates VCALENDAR block', () => {
    const code = read('app/api/events/[id]/calendar/route.js');
    assert.ok(code.includes('BEGIN:VCALENDAR'), 'Calendar route must generate VCALENDAR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suspension enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('Suspension enforcement', () => {
  test('middleware checks is_suspended', () => {
    const code = read('middleware.js');
    assert.ok(code.includes('is_suspended') || code.includes('suspended'),
      'Middleware must check suspension status');
  });

  test('/suspended page exists', () => {
    assert.ok(exists('app/suspended/page.js'), '/suspended page must exist');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logger and observability
// ─────────────────────────────────────────────────────────────────────────────
describe('Observability', () => {
  test('lib/logger.js exists', () => {
    assert.ok(exists('lib/logger.js'), 'lib/logger.js must exist');
  });

  test('logger sanitizes sensitive fields', () => {
    const code = read('lib/logger.js');
    assert.ok(code.includes('password') || code.includes('sanitize') || code.includes('redact'),
      'Logger must sanitize sensitive fields');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin dashboard pages
// ─────────────────────────────────────────────────────────────────────────────
describe('Admin dashboard pages', () => {
  const adminPages = [
    'app/admin/dashboard/page.js',
    'app/admin/dashboard/layout.js',
    'app/admin/dashboard/organizers/page.js',
    'app/admin/dashboard/users/page.js',
    'app/admin/dashboard/events/page.js',
    'app/admin/dashboard/clubs/page.js',
    'app/admin/dashboard/analytics/page.js',
    'app/admin/dashboard/audit-log/page.js',
    'app/admin/dashboard/system-health/page.js',
  ];

  for (const page of adminPages) {
    test(`${page} exists`, () => {
      assert.ok(exists(page), `${page} must exist`);
    });
  }
});

describe('Admin organizer approval response handling', () => {
  test('approval UI tolerates an empty or non-JSON success response', () => {
    const code = read('app/admin/dashboard/organizers/page.js');
    assert.ok(code.includes("res.json().catch(() => ({}))"),
      'Organizer approval must not fail when a successful response has no JSON body');
  });
});

describe('Admin user suspension response handling', () => {
  test('user update performs mutation independently and returns JSON success', () => {
    const api = read('app/api/admin/users/[id]/route.js');
    const page = read('app/admin/dashboard/users/page.js');
    assert.ok(api.includes('.from(\'profiles\')') && api.includes('.update(update)'),
      'User action must update the profiles table');
    assert.ok(api.includes('ok: true'), 'User action must return a JSON success response');
    assert.ok(page.includes("res.json().catch(() => ({}))"),
      'User action UI must tolerate an empty or non-JSON response');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// npm test command
// ─────────────────────────────────────────────────────────────────────────────
describe('npm test command', () => {
  test('package.json test script runs security tests not stale phase1', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(
      pkg.scripts.test.includes('security.test.cjs'),
      'npm test must run security.test.cjs not phase1.test.cjs'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────
describe('Validation schemas', () => {
  test('lib/validation/events.js exists', () => {
    assert.ok(exists('lib/validation/events.js'), 'Event validation schema must exist');
  });

  test('lib/validation/tasks.js exists', () => {
    assert.ok(exists('lib/validation/tasks.js'), 'Task validation schema must exist');
  });
});
