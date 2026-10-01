import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/** GET /api/events/[id]/calendar — download .ics file for an event */
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: event, error } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, visibility, status')
    .eq('id', id)
    .maybeSingle();

  if (error || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (event.status === 'hidden') {
    return NextResponse.json({ error: 'Event not available' }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://campuspulse.app';
  const eventUrl = `${baseUrl}/events/${event.id}`;

  function formatIcsDate(iso) {
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace('.000', '');
  }

  const start = formatIcsDate(event.starts_at);
  const end = event.ends_at
    ? formatIcsDate(event.ends_at)
    : formatIcsDate(new Date(new Date(event.starts_at).getTime() + 60 * 60 * 1000).toISOString());

  const desc = (event.description || '').replace(/\n/g, '\\n').replace(/,/g, '\\,');
  const title = (event.title || 'CampusPulse Event').replace(/,/g, '\\,');
  const location = (event.location || '').replace(/,/g, '\\,');

  const uid = `${event.id}@campuspulse`;
  const now = formatIcsDate(new Date().toISOString());

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusPulse//CampusPulse//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    desc ? `DESCRIPTION:${desc}` : '',
    location ? `LOCATION:${location}` : '',
    `URL:${eventUrl}`,
    event.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${event.id}.ics"`,
    },
  });
}
