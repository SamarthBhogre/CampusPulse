import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action } = body;

  const allowedActions = ['hide', 'restore', 'cancel'];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const statusMap = { hide: 'hidden', restore: 'active', cancel: 'cancelled' };
  const newStatus = statusMap[action];

  try {
    const { data: prev } = await auth.admin
      .from('events').select('status, title').eq('id', id).maybeSingle();
    if (!prev) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const { data, error } = await auth.admin
      .from('events').update({ status: newStatus }).eq('id', id)
      .select('id, title, status').single();
    if (error) throw error;

    await auth.admin.rpc('write_audit_log', {
      p_action: `event_${action}`,
      p_target_type: 'event',
      p_target_id: id,
      p_previous: { status: prev.status },
      p_new: { status: newStatus },
      p_metadata: { title: prev.title },
    }).catch(() => {});

    return NextResponse.json({ event: data });
  } catch (err) {
    logger.error('Admin event moderate failed', err, { eventId: id, action });
    return NextResponse.json({ error: 'Could not update event' }, { status: 500 });
  }
}
