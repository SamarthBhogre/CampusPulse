import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { moderateEvent } from '@/lib/services/moderation';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await moderateEvent(auth, id, body.action);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ event: result.event });
}
