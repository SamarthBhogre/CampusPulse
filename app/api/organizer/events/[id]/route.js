import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { eventInputSchema } from '@/lib/validation/events';
import { logger } from '@/lib/logger';

async function getOwnedEvent(auth, id) {
  const { data, error } = await auth.admin
    .from('events')
    .select('id, created_by')
    .eq('id', id)
    .eq('created_by', auth.user.id)
    .maybeSingle();
  if (error) {
    logger.error('Organizer event ownership lookup failed', error, { eventId: id });
    return { error: 'Could not verify event ownership', status: 500 };
  }
  if (!data) return { error: 'Event not found or you do not own it', status: 404 };
  return { event: data };
}

/** GET /api/organizer/events/[id] — fetch event for the edit form */
export async function GET(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const owner = await getOwnedEvent(auth, id);
  if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const { data, error } = await auth.admin
    .from('events')
    .select('*, clubs(id, name)')
    .eq('id', id)
    .single();
  if (error) {
    logger.error('Organizer event fetch failed', error, { eventId: id });
    return NextResponse.json({ error: 'Could not load event' }, { status: 500 });
  }
  return NextResponse.json({ event: data });
}

/** PATCH /api/organizer/events/[id] — update event with server-side Zod validation */
export async function PATCH(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const owner = await getOwnedEvent(auth, id);
  if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const body = await request.json().catch(() => ({}));
  const parsed = eventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid event data' },
      { status: 400 }
    );
  }

  const payload = {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    location: parsed.data.location ?? null,
    cover_image: parsed.data.cover_image ?? null,
    visibility: parsed.data.visibility,
    club_id: parsed.data.club_id ?? null,
    starts_at: parsed.data.starts_at.toISOString(),
    ends_at: parsed.data.ends_at?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.admin
    .from('events')
    .update(payload)
    .eq('id', id)
    .select('id, title, starts_at, updated_at')
    .single();

  if (error) {
    logger.error('Organizer event update failed', error, { eventId: id, userId: auth.user.id });
    return NextResponse.json({ error: 'Could not update event' }, { status: 500 });
  }
  return NextResponse.json({ event: data });
}

/** DELETE /api/organizer/events/[id] — delete owned event */
export async function DELETE(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const owner = await getOwnedEvent(auth, id);
  if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const { error } = await auth.admin.from('events').delete().eq('id', id);
  if (error) {
    logger.error('Organizer event deletion failed', error, { eventId: id, userId: auth.user.id });
    return NextResponse.json({ error: 'Could not delete event' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
