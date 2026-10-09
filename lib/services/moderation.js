import { NOTIFICATION_TYPES } from '@/lib/notifications';
import { notifyEventParticipants } from '@/lib/services/events';
import { logger } from '@/lib/logger';

export const MODERATION_ACTIONS = ['hide', 'restore', 'cancel'];
const STATUS_BY_ACTION = { hide: 'hidden', restore: 'active', cancel: 'cancelled' };

/**
 * Admin event moderation. Callers must already have verified admin access
 * (requireAdmin or a verified MCP admin profile) before calling this.
 * The audit entry is written through `ctx.db` when available so the acting
 * admin is recorded as auth.uid().
 */
export async function moderateEvent(ctx, eventId, action) {
  if (!MODERATION_ACTIONS.includes(action)) return { error: 'Invalid action', status: 400 };
  const newStatus = STATUS_BY_ACTION[action];

  try {
    const { data: prev } = await ctx.admin
      .from('events').select('status, title').eq('id', eventId).maybeSingle();
    if (!prev) return { error: 'Event not found', status: 404 };

    const { data, error } = await ctx.admin
      .from('events').update({ status: newStatus }).eq('id', eventId)
      .select('id, title, status').single();
    if (error) throw error;

    if (action === 'cancel') {
      await notifyEventParticipants(ctx.admin, eventId, NOTIFICATION_TYPES.EVENT_CANCELLED, {
        event_id: eventId,
        event_title: prev.title,
      });
    }

    // Supabase query builders are thenables without .catch(), so check the
    // returned error; audit failures must not fail the moderation itself.
    const { error: auditError } = await (ctx.db || ctx.admin).rpc('write_audit_log', {
      p_action: `event_${action}`,
      p_target_type: 'event',
      p_target_id: eventId,
      p_previous: { status: prev.status },
      p_new: { status: newStatus },
      p_metadata: { title: prev.title },
    });
    if (auditError) logger.warn('Audit log write failed', { eventId, action, error: auditError.message });

    return { event: data, previousStatus: prev.status };
  } catch (err) {
    logger.error('Admin event moderate failed', err, { eventId, action });
    return { error: 'Could not update event', status: 500 };
  }
}
