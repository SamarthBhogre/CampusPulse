import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const role = searchParams.get('role') || 'all';
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const pageSize = 25;

  try {
    let query = auth.admin
      .from('profiles')
      .select('id, email, full_name, role, organizer_request_status, organizer_requested_at, created_at, is_suspended', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (search.trim()) {
      const term = search.trim();
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
    }
    if (role !== 'all') query = query.eq('role', role);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ users: data || [], total: count || 0, page, pageSize });
  } catch (err) {
    logger.error('Admin users list failed', err);
    return NextResponse.json({ error: 'Could not load users' }, { status: 500 });
  }
}
