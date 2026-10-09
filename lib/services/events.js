import { eventInputSchema } from '@/lib/validation/events';
import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { logger } from '@/lib/logger';

/**
 * Shared event management logic used by the organizer API routes and the MCP server.
 *
 * Every function takes a context `{ user, admin, profile? }`:
 *   user    — the verified Supabase user (never client-supplied)
 *   admin   — service-role client, used only after authorization succeeds
 *   profile — optional verified profile; `role === 'admin'` unlocks admin-only paths
 *
 * Functions return `{ ...data }` on success or `{ error, status }` on failure.
 */

const EDITABLE_FIELDS = [
  'title', 'description', 'location', 'starts_at', 'ends_at',
  'cover_image', 'club_id', 'visibility', 'max_attendees',
];

export function isAdminContext(ctx) {
  return ctx?.profile?.role === 'admin';
}

/** Loads an event the caller manages: their own, or any event when allowAdmin and the caller is an admin. */
export async function getManagedEvent(ctx, eventId, { columns = 'id, created_by', allowAdmin = false } = {}) {
  let query = ctx.admin.from('events').select(columns).eq('id', eventId);
  if (!(allowAdmin && isAdminContext(ctx))) query = query.eq('created_by', ctx.user.id);
  const { data, error } = await query.maybeSingle();
  if (error) {
    logger.error('Managed event lookup failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not verify event ownership', status: 500 };
  }
  if (!data) return { error: 'Event not found or you do not own it', status: 404 };
  return { event: data };
}

/** Notifies every RSVP'd attendee and volunteer of an event, once each. */
export async function notifyEventParticipants(admin, eventId, type, payload) {
  const [{ data: rsvps }, { data: volunteers }] = await Promise.all([
    admin.from('event_rsvps').select('profile_id').eq('event_id', eventId),
    admin.from('volunteer_signups').select('profile_id').eq('event_id', eventId),
  ]);
  const recipientIds = new Set([...(rsvps || []), ...(volunteers || [])].map((row) => row.profile_id));
  for (const recipientId of recipientIds) {
    void enqueueNotification(recipientId, type, payload);
  }
  return recipientIds.size;
}

function toEventPayload(data) {
  return {
    title: data.title,
    description: data.description ?? null,
    location: data.location ?? null,
    cover_image: data.cover_image ?? null,
    visibility: data.visibility,
    club_id: data.club_id ?? null,
    starts_at: data.starts_at.toISOString(),
    ends_at: data.ends_at?.toISOString() ?? null,
  };
}

function parseEventInput(input, fallbackMessage) {
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || fallbackMessage, status: 400 };
  }
  return { data: parsed.data };
}

export async function createEvent(ctx, input) {
  const parsed = parseEventInput(input, 'Invalid event details');
  if (parsed.error) return parsed;

  const payload = {
    ...toEventPayload(parsed.data),
    max_attendees: parsed.data.max_attendees ?? null,
    created_by: ctx.user.id,
  };

  const { data, error } = await ctx.admin
    .from('events')
    .insert(payload)
    .select('id, title, starts_at, max_attendees, registration_mode, status')
    .single();

  if (error) {
    logger.error('Event creation failed', error, { userId: ctx.user.id });
    return { error: 'Could not create event', status: 500 };
  }
  return { event: data };
}

/**
 * Updates an event the caller owns and notifies its participants.
 * With `partial: true`, omitted fields keep their current values.
 */
export async function updateEvent(ctx, eventId, input, { partial = false } = {}) {
  const owner = await getManagedEvent(ctx, eventId, { columns: partial ? '*' : 'id, created_by' });
  if (owner.error) return owner;

  let merged = input;
  if (partial) {
    const current = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, owner.event[field]]));
    const changes = Object.fromEntries(Object.entries(input || {}).filter(([, value]) => value !== undefined));
    merged = { ...current, ...changes };
  }

  const parsed = parseEventInput(merged, 'Invalid event data');
  if (parsed.error) return parsed;

  const payload = { ...toEventPayload(parsed.data), updated_at: new Date().toISOString() };
  if (parsed.data.max_attendees !== undefined) payload.max_attendees = parsed.data.max_attendees;

  const { data, error } = await ctx.admin
    .from('events')
    .update(payload)
    .eq('id', eventId)
    .select('id, title, starts_at, ends_at, location, visibility, max_attendees, registration_mode, status, updated_at')
    .single();

  if (error) {
    logger.error('Event update failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not update event', status: 500 };
  }

  const notified = await notifyEventParticipants(ctx.admin, eventId, NOTIFICATION_TYPES.EVENT_UPDATED, {
    event_id: eventId,
    event_title: data.title,
  });
  return { event: data, notified };
}

/** Cancels an event owned by the caller (or any event for admins) and notifies participants. */
export async function cancelEvent(ctx, eventId) {
  const owner = await getManagedEvent(ctx, eventId, { columns: 'id, title, status, created_by', allowAdmin: true });
  if (owner.error) return owner;
  const { event } = owner;

  if (event.status === 'cancelled') return { error: 'This event is already cancelled', status: 409 };
  if (event.status === 'hidden' && !isAdminContext(ctx)) {
    return { error: 'This event has been hidden by an administrator and cannot be changed', status: 409 };
  }

  const { data, error } = await ctx.admin
    .from('events')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select('id, title, status')
    .single();
  if (error) {
    logger.error('Event cancellation failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not cancel event', status: 500 };
  }

  const notified = await notifyEventParticipants(ctx.admin, eventId, NOTIFICATION_TYPES.EVENT_CANCELLED, {
    event_id: eventId,
    event_title: event.title,
  });

  // An admin cancelling someone else's event is a moderation action; record it.
  if (event.created_by !== ctx.user.id && isAdminContext(ctx)) {
    const { error: auditError } = await (ctx.db || ctx.admin).rpc('write_audit_log', {
      p_action: 'event_cancel',
      p_target_type: 'event',
      p_target_id: eventId,
      p_previous: { status: event.status },
      p_new: { status: 'cancelled' },
      p_metadata: { title: event.title },
    });
    if (auditError) logger.warn('Audit log write failed', { eventId, error: auditError.message });
  }
  return { event: data, previousStatus: event.status, notified };
}
