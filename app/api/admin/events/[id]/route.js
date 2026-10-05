import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';
import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';

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

    if (action === 'cancel') {
      const [{ data: rsvps }, { data: volunteers }] = await Promise.all([
        auth.admin.from('event_rsvps').select('profile_id').eq('event_id', id),
        auth.admin.from('volunteer_signups').select('profile_id').eq('event_id', id),
      ]);
      const recipientIds = new Set([...(rsvps || []), ...(volunteers || [])].map((row) => row.profile_id));
      for (const recipientId of recipientIds) {
        void enqueueNotification(recipientId, NOTIFICATION_TYPES.EVENT_CANCELLED, {
          event_id: id,
          event_title: prev.title,
        });
      }
    }

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
