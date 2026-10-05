import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const checks = {};
  let overallOk = true;
  const markFailure = (name, detail, message) => {
    checks[name] = { status: 'down', detail, ...(message ? { message } : {}) };
    overallOk = false;
  };

  // Database connectivity
  try {
    const startedAt = Date.now();
    const { error } = await auth.admin.from('profiles').select('id').limit(1).maybeSingle();
    checks.database = error
      ? { status: 'down', detail: 'Database query failed', message: error.message }
      : { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch { markFailure('database', 'Database connection failed'); }

  // Storage connectivity
  try {
    const startedAt = Date.now();
    const { error } = await auth.admin.storage.listBuckets();
    checks.storage = error
      ? { status: 'down', detail: 'Storage query failed', message: error.message }
      : { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch { markFailure('storage', 'Storage unavailable'); }

  // Verify the bucket used by image uploads, not just Storage API access.
  try {
    const startedAt = Date.now();
    const { data: buckets, error } = await auth.admin.storage.listBuckets();
    const bucket = (buckets || []).find((item) => item.id === 'event-covers');
    if (error) markFailure('event_covers_bucket', 'Could not inspect event-covers bucket', error.message);
    else if (!bucket) markFailure('event_covers_bucket', 'event-covers bucket is missing');
    else if (!bucket.public) markFailure('event_covers_bucket', 'event-covers bucket is not public');
    else checks.event_covers_bucket = { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch { markFailure('event_covers_bucket', 'Bucket check failed'); }

  // Verify the Auth service can answer an admin request.
  try {
    const startedAt = Date.now();
    const { error } = await auth.admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) markFailure('auth', 'Auth service query failed', error.message);
    else checks.auth = { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch { markFailure('auth', 'Auth service unavailable'); }

  // Verify tables used by the notification and club-management workflows.
  try {
    const startedAt = Date.now();
    const [{ error: notificationsError }, { error: managersError }] = await Promise.all([
      auth.admin.from('notification_queue').select('id').limit(1),
      auth.admin.from('club_managers').select('club_id').limit(1),
    ]);
    const error = notificationsError || managersError;
    if (error) markFailure('schema', 'Required application table is unavailable', error.message);
    else checks.schema = { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch { markFailure('schema', 'Schema check failed'); }

  // Exercise a read-only RPC used by the clubs and event pages.
  try {
    const startedAt = Date.now();
    const { error } = await auth.admin.rpc('get_club_member_counts');
    if (error) markFailure('critical_rpcs', 'Critical RPC check failed', error.message);
    else checks.critical_rpcs = { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch { markFailure('critical_rpcs', 'Critical RPC check failed'); }

  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || 'local';
  checks.deployment = { status: 'ok', detail: commit.slice(0, 12) };

  if (checks.database.status !== 'ok' || checks.storage.status !== 'ok') overallOk = false;

  return NextResponse.json({
    status: overallOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    // `health` is the page-facing name; retain `checks` for API consumers.
    health: checks,
    checks,
  }, { status: 200 });
}
