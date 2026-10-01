import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const checks = {};
  let overallOk = true;

  // Database connectivity
  try {
    const { error } = await auth.admin.from('profiles').select('id').limit(1).maybeSingle();
    checks.database = error ? { status: 'error', message: 'Query failed' } : { status: 'ok' };
  } catch {
    checks.database = { status: 'error', message: 'Connection failed' };
    overallOk = false;
  }

  // Storage connectivity
  try {
    const { error } = await auth.admin.storage.listBuckets();
    checks.storage = error ? { status: 'error', message: error.message } : { status: 'ok' };
  } catch {
    checks.storage = { status: 'error', message: 'Storage unavailable' };
    overallOk = false;
  }

  if (!checks.database.status === 'ok') overallOk = false;

  return NextResponse.json({
    status: overallOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  }, { status: overallOk ? 200 : 503 });
}
