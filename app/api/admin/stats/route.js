import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [users, events, rsvps, signups, clubs, orgRequests] = await Promise.all([
      auth.admin.from('profiles').select('id, role, created_at', { count: 'exact', head: false }),
      auth.admin.from('events').select('id, starts_at, status', { count: 'exact', head: false }),
      auth.admin.from('event_rsvps').select('id', { count: 'exact', head: true }),
      auth.admin.from('volunteer_signups').select('id', { count: 'exact', head: true }),
      auth.admin.from('clubs').select('id', { count: 'exact', head: true }),
      auth.admin.from('profiles').select('id', { count: 'exact', head: true }).eq('organizer_request_status', 'pending'),
    ]);

    const allUsers = users.data || [];
    const allEvents = events.data || [];

    const stats = {
      users: {
        total: allUsers.length,
        students: allUsers.filter(u => u.role === 'student').length,
        organizers: allUsers.filter(u => u.role === 'organizer').length,
        admins: allUsers.filter(u => u.role === 'admin').length,
      },
      events: {
        total: allEvents.length,
        upcoming: allEvents.filter(e => new Date(e.starts_at) >= now).length,
        this_week: allEvents.filter(e => {
          const d = new Date(e.starts_at);
          return d >= now && d <= weekFromNow;
        }).length,
        this_month: allEvents.filter(e => {
          const d = new Date(e.starts_at);
          return d >= now && d <= monthFromNow;
        }).length,
        completed: allEvents.filter(e => new Date(e.starts_at) < now).length,
        active: allEvents.filter(e => (e.status || 'active') === 'active').length,
        hidden: allEvents.filter(e => e.status === 'hidden').length,
        cancelled: allEvents.filter(e => e.status === 'cancelled').length,
      },
      rsvps: { total: rsvps.count || 0 },
      volunteer_signups: { total: signups.count || 0 },
      clubs: { total: clubs.count || 0 },
      pending_organizer_requests: orgRequests.count || 0,
    };

    return NextResponse.json({ stats });
  } catch (err) {
    logger.error('Admin stats failed', err);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
