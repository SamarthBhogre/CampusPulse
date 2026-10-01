import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * POST /api/events/[id]/rsvp
 * Toggles an RSVP for the authenticated user.
 * Enforces club membership server-side via the rsvp_to_event RPC.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Please sign in to RSVP' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('rsvp_to_event', { p_event_id: id });

  if (error) {
    // Translate database-level errors into user-friendly messages
    const userMsg = error.message?.includes('club member')
      ? 'You must be a club member to RSVP for this event.'
      : error.message?.includes('Not authenticated')
      ? 'Please sign in to RSVP.'
      : 'Could not update your RSVP right now. Please try again.';

    logger.error('RSVP toggle failed', error, { userId: user.id, eventId: id });
    return NextResponse.json({ error: userMsg }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
