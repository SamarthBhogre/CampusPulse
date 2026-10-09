import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { logger } from '@/lib/logger';

export const ANNOUNCEMENT_AUDIENCES = ['attendees', 'volunteers', 'both'];
export const MAX_MESSAGE_LENGTH = 1000;
const AUDIENCES = new Set(ANNOUNCEMENT_AUDIENCES);

async function loadOwnedEvent(ctx, eventId) {
  const { data: event, error } = await ctx.admin
    .from('events')
    .select('id, title, created_by')
    .eq('id', eventId)
    .eq('created_by', ctx.user.id)
    .maybeSingle();
  if (error) {
    logger.error('Announcement event lookup failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not verify event ownership', status: 500 };
  }
  if (!event) return { error: 'Event not found or you do not own it', status: 404 };
  return { event };
}

function validate({ message, audience = 'both' }) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return { error: 'Message is required', status: 400 };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`, status: 400 };
  }
  if (typeof audience !== 'string' || !AUDIENCES.has(audience)) {
    return { error: 'Invalid announcement audience', status: 400 };
  }
  return { message: text, audience };
}

/** Resolves deduplicated recipient ids for an owned event (the organizer is excluded). */
async function loadRecipients(ctx, eventId, audience) {
  const includeRsvps = audience === 'attendees' || audience === 'both';
  const includeVolunteers = audience === 'volunteers' || audience === 'both';
  const [{ data: rsvps, error: rsvpError }, { data: volunteers, error: volunteerError }] = await Promise.all([
    includeRsvps
      ? ctx.admin.from('event_rsvps').select('profile_id').eq('event_id', eventId)
      : Promise.resolve({ data: [], error: null }),
    includeVolunteers
      ? ctx.admin.from('volunteer_signups').select('profile_id').eq('event_id', eventId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rsvpError || volunteerError) {
    logger.error('Announcement recipient lookup failed', rsvpError || volunteerError, { eventId, userId: ctx.user.id });
    return { error: 'Could not load announcement recipients', status: 500 };
  }
  const recipientIds = [...new Set([
    ...(rsvps || []).map((row) => row.profile_id),
    ...(volunteers || []).map((row) => row.profile_id),
  ])].filter((recipientId) => recipientId && recipientId !== ctx.user.id);
  return { recipientIds };
}

/** Counts who would receive an announcement without sending anything. */
export async function previewAnnouncement(ctx, eventId, input) {
  const valid = validate(input);
  if (valid.error) return valid;
  const owned = await loadOwnedEvent(ctx, eventId);
  if (owned.error) return owned;
  const recipients = await loadRecipients(ctx, eventId, valid.audience);
  if (recipients.error) return recipients;
  return { event: owned.event, audience: valid.audience, message: valid.message, recipientCount: recipients.recipientIds.length };
}

/** Sends an organizer announcement to an owned event's attendees and/or volunteers. */
export async function sendAnnouncement(ctx, eventId, input) {
  const owned = await loadOwnedEvent(ctx, eventId);
  if (owned.error) return owned;
  const valid = validate(input);
  if (valid.error) return valid;
  const recipients = await loadRecipients(ctx, eventId, valid.audience);
  if (recipients.error) return recipients;
  const { recipientIds } = recipients;

  if (recipientIds.length === 0) {
    return { sent: 0, message: 'There are no matching recipients for this announcement.' };
  }

  const { data: sender } = await ctx.admin.from('profiles').select('full_name').eq('id', ctx.user.id).maybeSingle();
  const payload = {
    event_id: eventId,
    event_title: owned.event.title,
    event_url: `/events/${eventId}`,
    message: valid.message,
    sender_name: sender?.full_name || 'The event organizer',
    audience: valid.audience,
  };

  // Queue independently so one failed insert does not block the rest.
  await Promise.all(recipientIds.map((recipientId) =>
    enqueueNotification(recipientId, NOTIFICATION_TYPES.ORGANIZER_MESSAGE, payload)
  ));

  return { sent: recipientIds.length };
}
