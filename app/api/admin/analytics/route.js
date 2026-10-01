import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(7, parseInt(searchParams.get('days') || '30', 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [events, rsvps, signups, clubs] = await Promise.all([
      auth.admin.from('events').select('id, created_at, starts_at, status, club_id, clubs(name)').gte('created_at', since),
      auth.admin.from('event_rsvps').select('id, created_at, event_id').gte('created_at', since),
      auth.admin.from('volunteer_signups').select('id, created_at, event_id').gte('created_at', since),
      auth.admin.rpc('get_club_member_counts'),
    ]);

    return NextResponse.json({
      events: events.data || [],
      rsvps: rsvps.data || [],
      volunteer_signups: signups.data || [],
      club_member_counts: clubs.data || [],
      period_days: days,
    });
  } catch (err) {
    logger.error('Admin analytics failed', err);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
