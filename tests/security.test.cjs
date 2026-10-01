/**
 * CampusPulse — Security & Regression Test Suite
 * Run with: node --test tests/security.test.cjs
 *
 * These are static analysis tests that verify:
 * 1. Security migrations contain the correct authorization logic
 * 2. API routes are properly guarded
 * 3. Confirmed bugs are fixed at the source level
 * 4. Validation schemas exist and enforce correct rules
 */

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ============================================================
// BATCH 1: Security — Club-only RSVP/Volunteer enforcement
// ============================================================
describe('Security: Club-only RSVP/Volunteer enforcement', () => {
  test('Migration 010 exists', () => {
    assert.ok(exists('supabase/migrations/010_club_only_rsvp_enforcement.sql'),
      'Migration 010 must exist');
  });

  test('Migration 010 defines can_participate_in_event function', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('can_participate_in_event'), 'Must define can_participate_in_event RPC');
  });

  test('Migration 010 replaces permissive rsvps_self_insert policy', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('drop policy if exists "rsvps_self_insert"'), 'Must drop old permissive policy');
    assert.ok(sql.includes('can_participate_in_event(event_id)'), 'New policy must call membership check');
  });

  test('Migration 010 enforces club membership for volunteer_signups insert', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('drop policy if exists "signups_self_insert"'), 'Must drop old volunteer policy');
    assert.ok(sql.includes('can_participate_in_event(event_id)'), 'Volunteer insert must check club membership');
  });

  test('Migration 010 defines rsvp_to_event security-definer RPC', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('create or replace function public.rsvp_to_event'), 'Must define rsvp_to_event RPC');
    assert.ok(sql.includes('security definer'), 'rsvp_to_event must be security definer');
  });

  test('Migration 010 defines volunteer_for_task security-definer RPC', () => {
    const sql = read('supabase/migrations/010_club_only_rsvp_enforcement.sql');
    assert.ok(sql.includes('create or replace function public.volunteer_for_task'), 'Must define volunteer_for_task RPC');
  });

  test('Event detail page no longer directly inserts into event_rsvps', () => {
    const page = read('app/events/[id]/page.js');
    // Must NOT have: supabase.from('event_rsvps').insert(
    assert.ok(!page.includes(".from('event_rsvps').insert("),
      'Event detail page must not directly insert into event_rsvps');
  });

  test('Event detail page no longer directly inserts into volunteer_signups', () => {
    const page = read('app/events/[id]/page.js');
    assert.ok(!page.includes(".from('volunteer_signups').insert("),
      'Event detail page must not directly insert into volunteer_signups');
  });

  test('Event detail page uses /api/events/[id]/rsvp API route', () => {
    const page = read('app/events/[id]/page.js');
    assert.ok(page.includes('/api/events/') && page.includes('/rsvp'),
      'RSVP must go through server-side API route');
  });

  test('RSVP API route exists', () => {
    assert.ok(exists('app/api/events/[id]/rsvp/route.js'), 'RSVP API route must exist');
  });

  test('Volunteer API route exists', () => {
    assert.ok(exists('app/api/events/[id]/volunteer/route.js'), 'Volunteer API route must exist');
  });

  test('RSVP API route requires authentication', () => {
    const route = read('app/api/events/[id]/rsvp/route.js');
    assert.ok(route.includes('getUser') || route.includes('requireOrganizer') || route.includes('requireAdmin'),
      'RSVP API must verify auth before processing');
    assert.ok(route.includes('401'), 'Must return 401 for unauthenticated requests');
  });

  test('Volunteer API route validates taskId', () => {
    const route = read('app/api/events/[id]/volunteer/route.js');
    assert.ok(route.includes('taskId'), 'Volunteer API must require taskId');
    assert.ok(route.includes('400'), 'Must return 400 for missing taskId');
  });
});

// ============================================================
// BATCH 2: Authorization boundaries — API route guards
// ============================================================
describe('Authorization: Admin API route guards', () => {
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
    'app/api/admin/organizer-requests/route.js',
    'app/api/admin/organizer-requests/[id]/route.js',
  ];

  for (const routePath of adminRoutes) {
    test(`${routePath} uses requireAdmin guard`, () => {
      assert.ok(exists(routePath), `Route must exist: ${routePath}`);
      const content = read(routePath);
      assert.ok(content.includes('requireAdmin'),
        `${routePath} must call requireAdmin() to guard all handlers`);
    });
  }

  const organizerRoutes = [
    'app/api/organizer/events/route.js',
    'app/api/organizer/events/[id]/route.js',
    'app/api/organizer/events/[id]/tasks/route.js',
    'app/api/organizer/events/[id]/attendance/route.js',
  ];

  for (const routePath of organizerRoutes) {
    test(`${routePath} uses requireOrganizer guard`, () => {
      assert.ok(exists(routePath), `Route must exist: ${routePath}`);
      const content = read(routePath);
      assert.ok(content.includes('requireOrganizer'),
        `${routePath} must call requireOrganizer() to guard all handlers`);
    });
  }
});

describe('Authorization: Organizer cannot modify other organizers events', () => {
  test('Organizer event PATCH verifies created_by = auth.user.id', () => {
    const route = read('app/api/organizer/events/[id]/route.js');
    assert.ok(
      route.includes('created_by') && (route.includes('auth.user.id') || route.includes("eq('created_by', auth.user.id)")),
      'Event PATCH must verify the event is owned by the authenticated organizer'
    );
  });

  test('Organizer task route verifies event ownership', () => {
    const route = read('app/api/organizer/events/[id]/tasks/route.js');
    assert.ok(
      route.includes('created_by') || route.includes('ownedEvent') || route.includes('ownership'),
      'Task route must verify event ownership before allowing task operations'
    );
  });
});

// ============================================================
// BATCH 3: Bug fixes verification
// ============================================================
describe('BUG-002: Organizer event page has explicit error state', () => {
  test('Organizer manage-event page has loadError state', () => {
    const page = read('app/dashboard/organizer/events/[id]/page.js');
    assert.ok(page.includes('loadError'), 'Must have separate loadError state');
  });

  test('Organizer manage-event page renders ErrorState on failure', () => {
    const page = read('app/dashboard/organizer/events/[id]/page.js');
    assert.ok(page.includes('ErrorState'), 'Must render ErrorState component on load failure');
  });

  test('Organizer manage-event page has not-found state', () => {
    const page = read('app/dashboard/organizer/events/[id]/page.js');
    // Must have a state path for event being null after successful load
    assert.ok(page.includes('!event') || page.includes('not found'), 'Must handle not-found event state');
  });

  test('Organizer manage-event page uses useCallback for load', () => {
    const page = read('app/dashboard/organizer/events/[id]/page.js');
    assert.ok(page.includes('useCallback'), 'Must use useCallback to stabilize load function (BUG-008)');
  });
});

describe('BUG-003: Open-only filter is server-side before pagination', () => {
  test('Migration 011 exists with get_events_page RPC', () => {
    assert.ok(exists('supabase/migrations/011_events_page_rpc.sql'), 'Migration 011 must exist');
    const sql = read('supabase/migrations/011_events_page_rpc.sql');
    assert.ok(sql.includes('get_events_page'), 'Must define get_events_page RPC');
    assert.ok(sql.includes('p_open_only'), 'RPC must accept p_open_only parameter');
    assert.ok(sql.includes('limit p_page_size offset'), 'LIMIT/OFFSET must come AFTER the filter');
  });

  test('Events page uses get_events_page RPC instead of client-side filter', () => {
    const page = read('app/events/page.js');
    assert.ok(page.includes('get_events_page'), 'Events page must call get_events_page RPC');
    // Must NOT have the old broken useMemo filter
    assert.ok(!page.includes('useMemo') || !page.includes('openOnly'),
      'Events page must not use useMemo to filter openOnly client-side after fetching');
  });
});

describe('BUG-005: Unknown API routes return 404', () => {
  test('Health endpoint exists at /api/health', () => {
    assert.ok(exists('app/api/health/route.js'), '/api/health route must exist');
    const content = read('app/api/health/route.js');
    assert.ok(content.includes('"ok"') || content.includes("'ok'"), 'Health route must return status ok');
  });

  test('Catch-all route returns 404', () => {
    const route = read('app/api/[[...path]]/route.js');
    assert.ok(route.includes('404'), 'Catch-all must return 404 for unmatched routes');
    assert.ok(!route.includes("status: 'ok'") || route.includes("status: 404"),
      'Catch-all must not return 200 for unknown paths');
  });
});

describe('BUG-008: React effect dependencies', () => {
  const pagesWithLoad = [
    'app/clubs/page.js',
    'app/clubs/[id]/page.js',
    'app/dashboard/organizer/page.js',
    'app/dashboard/organizer/events/[id]/page.js',
    'app/events/page.js',
  ];

  for (const pagePath of pagesWithLoad) {
    test(`${pagePath} uses useCallback`, () => {
      if (!exists(pagePath)) return; // skip if not present
      const content = read(pagePath);
      assert.ok(content.includes('useCallback'),
        `${pagePath} should use useCallback to stabilize the load function`);
    });
  }
});

// ============================================================
// BATCH 4: Validation schemas
// ============================================================
describe('Validation: Zod schemas', () => {
  test('eventInputSchema exists and has required fields', () => {
    const schema = read('lib/validation/events.js');
    assert.ok(schema.includes('title'), 'eventInputSchema must validate title');
    assert.ok(schema.includes('starts_at'), 'eventInputSchema must validate starts_at');
    assert.ok(schema.includes('visibility'), 'eventInputSchema must validate visibility');
    assert.ok(schema.includes('zod') || schema.includes('z.'), 'Must use Zod');
  });

  test('taskInputSchema exists and has required fields', () => {
    assert.ok(exists('lib/validation/tasks.js'), 'tasks validation schema must exist');
    const schema = read('lib/validation/tasks.js');
    assert.ok(schema.includes('title'), 'taskInputSchema must validate title');
    assert.ok(schema.includes('volunteers_needed'), 'taskInputSchema must validate volunteers_needed');
  });

  test('Event API route uses Zod validation on POST', () => {
    const route = read('app/api/organizer/events/route.js');
    assert.ok(route.includes('eventInputSchema') || route.includes('safeParse'),
      'Event creation API must use Zod schema validation');
  });

  test('Event API route uses Zod validation on PATCH', () => {
    const route = read('app/api/organizer/events/[id]/route.js');
    assert.ok(route.includes('eventInputSchema') || route.includes('safeParse'),
      'Event update API must use Zod schema validation');
  });
});

// ============================================================
// BATCH 5: Database schema and migration chain
// ============================================================
describe('Database: Migration chain is complete', () => {
  const expectedMigrations = [
    'supabase/migrations/002_add_rsvps.sql',
    'supabase/migrations/003_club_membership_visibility.sql',
    'supabase/migrations/004_production_hardening.sql',
    'supabase/migrations/005_auth_role_hardening.sql',
    'supabase/migrations/008_query_hardening.sql',
    'supabase/migrations/009_privacy_aggregates.sql',
    'supabase/migrations/010_club_only_rsvp_enforcement.sql',
    'supabase/migrations/011_events_page_rpc.sql',
    'supabase/migrations/012_attendance_audit_notifications.sql',
  ];

  for (const migPath of expectedMigrations) {
    test(`${path.basename(migPath)} exists`, () => {
      assert.ok(exists(migPath), `${migPath} must exist`);
    });
  }
});

describe('Database: Migration 012 schema coverage', () => {
  test('Migration 012 creates event_attendance table', () => {
    const sql = read('supabase/migrations/012_attendance_audit_notifications.sql');
    assert.ok(sql.includes('event_attendance'), 'Must create event_attendance table');
  });

  test('Migration 012 creates admin_audit_log table', () => {
    const sql = read('supabase/migrations/012_attendance_audit_notifications.sql');
    assert.ok(sql.includes('admin_audit_log'), 'Must create admin_audit_log table');
  });

  test('Migration 012 creates notification_queue table', () => {
    const sql = read('supabase/migrations/012_attendance_audit_notifications.sql');
    assert.ok(sql.includes('notification_queue'), 'Must create notification_queue table');
  });

  test('Migration 012 adds status column to events', () => {
    const sql = read('supabase/migrations/012_attendance_audit_notifications.sql');
    assert.ok(sql.includes('events') && sql.includes('status'), 'Must add status column to events table');
  });

  test('Migration 012 audit_log has RLS enabled', () => {
    const sql = read('supabase/migrations/012_attendance_audit_notifications.sql');
    assert.ok(sql.includes('enable row level security'), 'All new tables must have RLS enabled');
  });
});

// ============================================================
// BATCH 6: Admin dashboard completeness
// ============================================================
describe('Admin dashboard: Sub-pages exist', () => {
  const adminPages = [
    'app/admin/dashboard/page.js',
    'app/admin/dashboard/organizers/page.js',
    'app/admin/dashboard/users/page.js',
    'app/admin/dashboard/events/page.js',
    'app/admin/dashboard/clubs/page.js',
    'app/admin/dashboard/audit-log/page.js',
    'app/admin/dashboard/analytics/page.js',
    'app/admin/dashboard/system-health/page.js',
    'app/admin/dashboard/layout.js',
  ];

  for (const pagePath of adminPages) {
    test(`${pagePath} exists`, () => {
      assert.ok(exists(pagePath), `Admin page must exist: ${pagePath}`);
    });
  }
});

describe('Admin dashboard: Overview page shows real metrics', () => {
  test('Admin overview fetches from /api/admin/stats', () => {
    const page = read('app/admin/dashboard/page.js');
    assert.ok(page.includes('/api/admin/stats'), 'Admin overview must fetch real stats');
  });
});

// ============================================================
// BATCH 7: Observability
// ============================================================
describe('Observability: Structured logger', () => {
  test('lib/logger.js exists', () => {
    assert.ok(exists('lib/logger.js'), 'Structured logger must exist');
  });

  test('Logger sanitizes sensitive fields', () => {
    const logger = read('lib/logger.js');
    assert.ok(logger.includes('REDACTED') || logger.includes('blocked'),
      'Logger must redact sensitive fields like passwords and tokens');
  });

  test('Logger has info, warn, error methods', () => {
    const logger = read('lib/logger.js');
    assert.ok(logger.includes("'info'") || logger.includes('"info"'), 'Logger must support info level');
    assert.ok(logger.includes("'error'") || logger.includes('"error"'), 'Logger must support error level');
    assert.ok(logger.includes("'warn'") || logger.includes('"warn"'), 'Logger must support warn level');
  });
});

// ============================================================
// BATCH 8: Notifications
// ============================================================
describe('Notifications: Library exists and is wired', () => {
  test('lib/notifications/index.js exists', () => {
    assert.ok(exists('lib/notifications/index.js'), 'Notification library must exist');
  });

  test('Notification library exports enqueueNotification', () => {
    const lib = read('lib/notifications/index.js');
    assert.ok(lib.includes('enqueueNotification'), 'Must export enqueueNotification function');
  });

  test('Organizer requests route uses notifications', () => {
    const route = read('app/api/admin/organizer-requests/[id]/route.js');
    assert.ok(
      route.includes('enqueueNotification') || route.includes('notification'),
      'Organizer approval/rejection must enqueue notifications'
    );
  });
});

// ============================================================
// BATCH 9: Attendance system
// ============================================================
describe('Attendance: API routes exist', () => {
  test('Attendance API route exists', () => {
    assert.ok(
      exists('app/api/organizer/events/[id]/attendance/route.js'),
      'Attendance API must exist'
    );
  });

  test('Attendance API has GET, POST, and DELETE handlers', () => {
    const route = read('app/api/organizer/events/[id]/attendance/route.js');
    assert.ok(route.includes('export async function GET'), 'Must have GET handler');
    assert.ok(route.includes('export async function POST'), 'Must have POST handler');
    assert.ok(route.includes('export async function DELETE'), 'Must have DELETE handler');
  });
});
