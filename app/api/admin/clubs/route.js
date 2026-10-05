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

    // Fetch manager records separately. PostgREST cannot reliably embed the
    // public_profiles view through club_managers because the view has no FK
    // relationship metadata.
    const clubIds = (data || []).map(c => c.id);
    let managerRows = [];
    if (clubIds.length) {
      const { data, error: managerError } = await auth.admin
        .from('club_managers')
        .select('club_id, profile_id')
        .in('club_id', clubIds);
      if (managerError) throw managerError;
      managerRows = data || [];
    }
    const managerIds = [...new Set(managerRows.map(row => row.profile_id).filter(Boolean))];
    let managerProfiles = [];
    if (managerIds.length) {
      const { data, error: profileError } = await auth.admin
        .from('profiles')
        .select('id, full_name, username')
        .in('id', managerIds);
      if (profileError) throw profileError;
      managerProfiles = data || [];
    }
    const profileMap = Object.fromEntries(managerProfiles.map(profile => [profile.id, profile]));
    const managersByClub = {};
    managerRows.forEach(row => {
      const profile = profileMap[row.profile_id];
      if (profile) (managersByClub[row.club_id] ||= []).push(profile);
    });

    // Get member counts per club
    const { data: counts, error: countsError } = await auth.admin.rpc('get_club_member_counts');
    if (countsError) throw countsError;
    const countMap = {};
    (counts || []).forEach(r => { countMap[r.club_id] = Number(r.member_count); });

    const clubs = (data || []).map(c => ({ ...c, member_count: countMap[c.id] || 0, managers: managersByClub[c.id] || [] }));
    return NextResponse.json({ clubs, total: count || 0, page, pageSize });
  } catch (err) {
    logger.error('Admin clubs list failed', err);
    return NextResponse.json({ error: 'Could not load clubs' }, { status: 500 });
  }
}
