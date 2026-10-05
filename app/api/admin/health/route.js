import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const checks = {};
  let overallOk = true;

  // Database connectivity
  try {
    const startedAt = Date.now();
    const { error } = await auth.admin.from('profiles').select('id').limit(1).maybeSingle();
    checks.database = error
      ? { status: 'down', detail: 'Database query failed', message: error.message }
      : { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch {
    checks.database = { status: 'down', detail: 'Database connection failed' };
    overallOk = false;
  }

  // Storage connectivity
  try {
    const startedAt = Date.now();
    const { error } = await auth.admin.storage.listBuckets();
    checks.storage = error
      ? { status: 'down', detail: 'Storage query failed', message: error.message }
      : { status: 'ok', latency_ms: Date.now() - startedAt };
  } catch {
    checks.storage = { status: 'down', detail: 'Storage unavailable' };
    overallOk = false;
  }

  if (checks.database.status !== 'ok') overallOk = false;
  if (checks.storage.status !== 'ok') overallOk = false;


  return NextResponse.json({
    status: overallOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    // `health` is the page-facing name; retain `checks` for API consumers.
    health: checks,
    checks,
  }, { status: 200 });
}
