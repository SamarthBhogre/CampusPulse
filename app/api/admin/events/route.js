import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const pageSize = 25;

  try {
    let query = auth.admin
      .from('events')
      .select('id, title, status, visibility, starts_at, created_at, created_by, club_id, clubs(name), profiles!events_created_by_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (search.trim()) {
      query = query.ilike('title', `%${search.trim()}%`);
    }
    if (status !== 'all') query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw error;
    return NextResponse.json({ events: data || [], total: count || 0, page, pageSize });
  } catch (err) {
    logger.error('Admin events list failed', err);
    return NextResponse.json({ error: 'Could not load events' }, { status: 500 });
  }
}
