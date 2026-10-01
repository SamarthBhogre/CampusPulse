import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { eventInputSchema } from '@/lib/validation/events';
import { logger } from '@/lib/logger';

export async function POST(request) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const parsed = eventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid event details' },
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
    created_by: auth.user.id,
  };

  const { data, error } = await auth.admin
    .from('events')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    logger.error('Organizer event creation failed', error, { userId: auth.user.id });
    return NextResponse.json({ error: 'Could not create event' }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
}
