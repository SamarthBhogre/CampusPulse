import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/analytics?days=30
 *
 * Returns aggregated analytics data in the shape the UI expects:
 * {
 *   analytics: {
 *     user_signups: [{ created_at }],        // new profiles
 *     events_created: [{ created_at }],       // new events
 *     rsvps: [{ created_at }],                // new RSVPs
 *     volunteer_signups: [{ created_at }],    // new volunteer signups
 *   },
 *   summary: {
 *     total_users, new_users, total_events, new_events,
 *     total_rsvps, new_rsvps, total_clubs, new_volunteer_signups
 *   },
 *   period_days: number
 * }
 */
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(7, parseInt(searchParams.get('days') || '30', 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      userSignups,
      eventsCreated,
      rsvps,
      volunteerSignups,
      totalUsers,
      totalEvents,
      totalRsvps,
      totalClubs,
    ] = await Promise.all([
      // New user registrations in period
      auth.admin.from('profiles')
        .select('created_at')
        .gte('created_at', since)
        .order('created_at'),
      // New events in period
      auth.admin.from('events')
        .select('id, created_at, title, status')
        .gte('created_at', since)
        .order('created_at'),
      // New RSVPs in period
      auth.admin.from('event_rsvps')
        .select('created_at')
        .gte('created_at', since)
        .order('created_at'),
      // New volunteer signups in period
      auth.admin.from('volunteer_signups')
        .select('created_at')
        .gte('created_at', since)
        .order('created_at'),
      // Total counts (head=true is faster — just gets count)
      auth.admin.from('profiles').select('id', { count: 'exact', head: true }),
      auth.admin.from('events').select('id', { count: 'exact', head: true }),
      auth.admin.from('event_rsvps').select('id', { count: 'exact', head: true }),
      auth.admin.from('clubs').select('id', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      analytics: {
        user_signups: userSignups.data || [],
        events_created: eventsCreated.data || [],
        rsvps: rsvps.data || [],
        volunteer_signups: volunteerSignups.data || [],
      },
      summary: {
        total_users: totalUsers.count || 0,
        new_users: (userSignups.data || []).length,
        total_events: totalEvents.count || 0,
        new_events: (eventsCreated.data || []).length,
        total_rsvps: totalRsvps.count || 0,
        new_rsvps: (rsvps.data || []).length,
        total_clubs: totalClubs.count || 0,
        new_volunteer_signups: (volunteerSignups.data || []).length,
      },
      period_days: days,
    });
  } catch (err) {
    logger.error('Admin analytics failed', err);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
