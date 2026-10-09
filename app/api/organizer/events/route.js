import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { createEvent } from '@/lib/services/events';

export async function POST(request) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const result = await createEvent(auth, body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ event: result.event }, { status: 201 });
}
