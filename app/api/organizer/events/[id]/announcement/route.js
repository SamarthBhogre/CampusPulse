import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { sendAnnouncement } from '@/lib/services/announcements';

/** POST /api/organizer/events/[id]/announcement — notify event participants. */
export async function POST(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await sendAnnouncement(auth, id, { message: body.message, audience: body.audience ?? 'both' });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result);
}
