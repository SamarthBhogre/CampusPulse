import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { logger } from '@/lib/logger';

async function verifyOwnership(auth, eventId) {
  const { data, error } = await auth.admin
    .from('events').select('id').eq('id', eventId).eq('created_by', auth.user.id).maybeSingle();
  if (error) return { error: 'Could not verify event ownership', status: 500 };
  if (!data) return { error: 'Event not found', status: 404 };
  return { ok: true };
}

/** GET /api/organizer/events/[id]/attendance — list attendance records */
export async function GET(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const ownership = await verifyOwnership(auth, id);
  if (ownership.error) return NextResponse.json({ error: ownership.error }, { status: ownership.status });

  const { data, error } = await auth.admin
    .from('event_attendance')
    .select('id, profile_id, checked_in_at, note, profiles!event_attendance_profile_id_fkey(full_name, email)')
    .eq('event_id', id)
    .order('checked_in_at', { ascending: false });

  if (error) {
    logger.error('Attendance fetch failed', error, { eventId: id });
    return NextResponse.json({ error: 'Could not load attendance' }, { status: 500 });
  }
  return NextResponse.json({ attendance: data || [] });
}

/** POST /api/organizer/events/[id]/attendance — mark attended */
export async function POST(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const ownership = await verifyOwnership(auth, id);
  if (ownership.error) return NextResponse.json({ error: ownership.error }, { status: ownership.status });

  const body = await request.json().catch(() => ({}));
  const { profile_id, note } = body;
  if (!profile_id) return NextResponse.json({ error: 'profile_id is required' }, { status: 400 });

  const { data, error } = await auth.admin
    .from('event_attendance')
    .upsert({ event_id: id, profile_id, checked_in_by: auth.user.id, note: note || null })
    .select('id, profile_id, checked_in_at').single();

  if (error) {
    logger.error('Attendance mark failed', error, { eventId: id, profileId: profile_id });
    return NextResponse.json({ error: 'Could not mark attendance' }, { status: 500 });
  }
  return NextResponse.json({ attendance: data }, { status: 201 });
}

/** DELETE /api/organizer/events/[id]/attendance?profileId=... — remove check-in */
export async function DELETE(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const ownership = await verifyOwnership(auth, id);
  if (ownership.error) return NextResponse.json({ error: ownership.error }, { status: ownership.status });

  const profileId = new URL(request.url).searchParams.get('profileId');
  if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 });

  const { error } = await auth.admin
    .from('event_attendance').delete().eq('event_id', id).eq('profile_id', profileId);
  if (error) {
    logger.error('Attendance delete failed', error, { eventId: id, profileId });
    return NextResponse.json({ error: 'Could not remove check-in' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
