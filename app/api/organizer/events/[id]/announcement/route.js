import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const AUDIENCES = new Set(['attendees', 'volunteers', 'both']);
const MAX_MESSAGE_LENGTH = 1000;

/** POST /api/organizer/events/[id]/announcement — notify event participants. */
export async function POST(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { data: event, error: eventError } = await auth.admin
    .from('events')
    .select('id, title, created_by')
    .eq('id', id)
    .eq('created_by', auth.user.id)
    .maybeSingle();

  if (eventError) {
    logger.error('Announcement event lookup failed', eventError, { eventId: id, userId: auth.user.id });
    return NextResponse.json({ error: 'Could not verify event ownership' }, { status: 500 });
  }
  if (!event) return NextResponse.json({ error: 'Event not found or you do not own it' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const audience = typeof body.audience === 'string' ? body.audience : 'both';

  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 400 });
  }
  if (!AUDIENCES.has(audience)) {
    return NextResponse.json({ error: 'Invalid announcement audience' }, { status: 400 });
  }

  const shouldIncludeRsvps = audience === 'attendees' || audience === 'both';
  const shouldIncludeVolunteers = audience === 'volunteers' || audience === 'both';
  const [{ data: rsvps, error: rsvpError }, { data: volunteers, error: volunteerError }, { data: sender }] = await Promise.all([
    shouldIncludeRsvps
      ? auth.admin.from('event_rsvps').select('profile_id').eq('event_id', id)
      : Promise.resolve({ data: [], error: null }),
    shouldIncludeVolunteers
      ? auth.admin.from('volunteer_signups').select('profile_id').eq('event_id', id)
      : Promise.resolve({ data: [], error: null }),
    auth.admin.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle(),
  ]);

  if (rsvpError || volunteerError) {
    logger.error('Announcement recipient lookup failed', rsvpError || volunteerError, { eventId: id, userId: auth.user.id });
    return NextResponse.json({ error: 'Could not load announcement recipients' }, { status: 500 });
  }

  const recipientIds = [...new Set([
    ...(rsvps || []).map((row) => row.profile_id),
    ...(volunteers || []).map((row) => row.profile_id),
  ])].filter((recipientId) => recipientId && recipientId !== auth.user.id);

  if (recipientIds.length === 0) {
    return NextResponse.json({ sent: 0, message: 'There are no matching recipients for this announcement.' });
  }

  const payload = {
    event_id: id,
    event_title: event.title,
    event_url: `/events/${id}`,
    message,
    sender_name: sender?.full_name || 'The event organizer',
    audience,
  };

  // Queue independently so one failed insert does not block the rest.
  await Promise.all(recipientIds.map((recipientId) =>
    enqueueNotification(recipientId, NOTIFICATION_TYPES.ORGANIZER_MESSAGE, payload)
  ));

  return NextResponse.json({ sent: recipientIds.length });
}
