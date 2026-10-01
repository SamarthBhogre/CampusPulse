import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const pageSize = 50;

  try {
    const { data, count, error } = await auth.admin
      .from('admin_audit_log')
      .select('id, actor_id, action, target_type, target_id, metadata, created_at, profiles!admin_audit_log_actor_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    return NextResponse.json({ entries: data || [], total: count || 0, page, pageSize });
  } catch (err) {
    logger.error('Admin audit log fetch failed', err);
    return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 });
  }
}
