import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { registrationModeSchema } from '@/lib/validation/events';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/organizer/events/[id]/registration
 * Sets registration_mode: 'auto' (close when full), 'open' (override the cap), 'closed'.
 */
export async function PATCH(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;

  const parsed = registrationModeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid registration mode' }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from('events')
    .update({ registration_mode: parsed.data.registration_mode, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('created_by', auth.user.id)
    .select('id, registration_mode, max_attendees')
    .maybeSingle();

  if (error) {
    logger.error('Organizer registration update failed', error, { eventId: id, userId: auth.user.id });
    return NextResponse.json({ error: 'Could not update registrations' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Event not found or you do not own it' }, { status: 404 });

  return NextResponse.json({ event: data });
}
