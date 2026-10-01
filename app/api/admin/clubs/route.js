import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const pageSize = 25;

  try {
    let query = auth.admin
      .from('clubs')
      .select('id, name, description, created_at', { count: 'exact' })
      .order('name')
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    const { data, count, error } = await query;
    if (error) throw error;

    // Get member counts per club
    const { data: counts } = await auth.admin.rpc('get_club_member_counts');
    const countMap = {};
    (counts || []).forEach(r => { countMap[r.club_id] = Number(r.member_count); });

    const clubs = (data || []).map(c => ({ ...c, member_count: countMap[c.id] || 0 }));
    return NextResponse.json({ clubs, total: count || 0, page, pageSize });
  } catch (err) {
    logger.error('Admin clubs list failed', err);
    return NextResponse.json({ error: 'Could not load clubs' }, { status: 500 });
  }
}
