/**
 * CampusPulse notification abstraction.
 * Enqueues notifications in the database; a separate processor delivers them.
 * Decouples notification delivery from the main request/transaction.
 */
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Enqueue a notification for a recipient.
 * @param {string} recipientId - profile id of the recipient
 * @param {string} type - notification type (e.g. 'rsvp_confirmation')
 * @param {Object} payload - notification data (event name, url, etc.)
 */
export async function enqueueNotification(recipientId, type, payload) {
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('notification_queue').insert({
      recipient_id: recipientId,
      type,
      payload,
      status: 'pending',
    });
    if (error) {
      logger.warn('Failed to enqueue notification', { recipientId, type, error: error.message });
    }
  } catch (err) {
    // Notifications must never block the main flow
    logger.warn('Notification enqueue threw', { recipientId, type, error: err.message });
  }
}

/** Notification type constants */
export const NOTIFICATION_TYPES = {
  RSVP_CONFIRMATION: 'rsvp_confirmation',
  VOLUNTEER_CONFIRMATION: 'volunteer_confirmation',
  ORGANIZER_APPROVED: 'organizer_approved',
  ORGANIZER_REJECTED: 'organizer_rejected',
  EVENT_UPDATED: 'event_updated',
  EVENT_CANCELLED: 'event_cancelled',
  EVENT_REMINDER: 'event_reminder',
  ORGANIZER_MESSAGE: 'organizer_message',
  RSVP_RECEIVED: 'rsvp_received',
  VOLUNTEER_RECEIVED: 'volunteer_received',
};
