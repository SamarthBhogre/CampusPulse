import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { logger } from '@/lib/logger';

/**
 * Student participation: RSVPs and volunteer signups.
 *
 * Mutations run through `ctx.db`, a Supabase client authenticated as the user,
 * so the existing database rules stay authoritative:
 *   - RLS insert policies enforce profile_id = auth.uid() and club membership
 *   - unique (event_id, profile_id) / (task_id, profile_id) prevent duplicates
 *   - enforce_event_rsvp_capacity / enforce_task_capacity triggers lock the
 *     parent row and prevent overbooking
 */

export async function notifyRsvpAdded(admin, userId, eventId) {
  const [{ data: event }, { data: actor }] = await Promise.all([
    admin.from('events').select('title, created_by').eq('id', eventId).maybeSingle(),
    admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ]);
  if (!event) return;
  void enqueueNotification(userId, NOTIFICATION_TYPES.RSVP_CONFIRMATION, { event_id: eventId, event_title: event.title });
  if (event.created_by && event.created_by !== userId) {
    void enqueueNotification(event.created_by, NOTIFICATION_TYPES.RSVP_RECEIVED, { event_id: eventId, event_title: event.title, actor_name: actor?.full_name || 'A student' });
  }
}

export async function notifyVolunteerAdded(admin, userId, eventId, taskId) {
  const [{ data: event }, { data: task }, { data: actor }] = await Promise.all([
    admin.from('events').select('title, created_by').eq('id', eventId).maybeSingle(),
    admin.from('tasks').select('title').eq('id', taskId).maybeSingle(),
    admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ]);
  if (!event) return;
  void enqueueNotification(userId, NOTIFICATION_TYPES.VOLUNTEER_CONFIRMATION, { event_id: eventId, event_title: event.title, task_title: task?.title });
  if (event.created_by && event.created_by !== userId) {
    void enqueueNotification(event.created_by, NOTIFICATION_TYPES.VOLUNTEER_RECEIVED, { event_id: eventId, event_title: event.title, task_title: task?.title, actor_name: actor?.full_name || 'A student' });
  }
}

function inactiveEventError(status) {
  return status === 'cancelled'
    ? { error: 'This event has been cancelled', status: 409 }
    : { error: 'This event is not currently available', status: 409 };
}

/** Maps database errors from RSVP / signup inserts to safe messages. */
function participationInsertError(error, kind) {
  const message = error?.message || '';
  if (error?.code === '23505') {
    return kind === 'rsvp'
      ? { error: 'You are already registered for this event', status: 409 }
      : { error: 'You are already signed up for this task', status: 409 };
  }
  if (message.includes('event is full')) return { error: 'This event is full. Registrations are closed.', status: 409 };
  if (message.includes('Registrations are closed')) return { error: 'Registrations are closed for this event.', status: 409 };
  if (message.includes('Task is full')) return { error: 'This task is already full.', status: 409 };
  if (error?.code === '42501' || message.includes('row-level security')) {
    return { error: 'You must be a club member to join this event.', status: 403 };
  }
  return null;
}

async function loadVisibleEvent(ctx, eventId) {
  const { data, error } = await ctx.db
    .from('events')
    .select('id, title, status, starts_at')
    .eq('id', eventId)
    .maybeSingle();
  if (error) {
    logger.error('Participation event lookup failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not load this event', status: 500 };
  }
  if (!data) return { error: 'Event not found', status: 404 };
  return { event: data };
}

export async function registerForEvent(ctx, eventId) {
  const loaded = await loadVisibleEvent(ctx, eventId);
  if (loaded.error) return loaded;
  if (loaded.event.status !== 'active') return inactiveEventError(loaded.event.status);

  const { data, error } = await ctx.db
    .from('event_rsvps')
    .insert({ event_id: eventId, profile_id: ctx.user.id })
    .select('id, event_id, created_at')
    .single();
  if (error) {
    const mapped = participationInsertError(error, 'rsvp');
    if (mapped) return mapped;
    logger.error('RSVP insert failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not register for this event right now', status: 500 };
  }

  await notifyRsvpAdded(ctx.admin, ctx.user.id, eventId);
  return { registration: { ...data, event_title: loaded.event.title } };
}

export async function cancelRegistration(ctx, eventId) {
  const { data, error } = await ctx.db
    .from('event_rsvps')
    .delete()
    .eq('event_id', eventId)
    .eq('profile_id', ctx.user.id)
    .select('id');
  if (error) {
    logger.error('RSVP delete failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not cancel your registration right now', status: 500 };
  }
  if (!data?.length) return { error: 'You are not registered for this event', status: 404 };
  return { cancelled: true, event_id: eventId };
}

/** Looks up the caller's own registration for an event, for confirmation previews. */
export async function findMyRegistration(ctx, eventId) {
  const { data, error } = await ctx.db
    .from('event_rsvps')
    .select('id, created_at, events(id, title, starts_at)')
    .eq('event_id', eventId)
    .eq('profile_id', ctx.user.id)
    .maybeSingle();
  if (error) return { error: 'Could not load your registration', status: 500 };
  if (!data) return { error: 'You are not registered for this event', status: 404 };
  return { registration: data };
}

export async function getMyRegistrations(ctx, { includePast = false } = {}) {
  const { data, error } = await ctx.db
    .from('event_rsvps')
    .select('id, created_at, events(id, title, starts_at, ends_at, location, status, visibility, clubs(name))')
    .eq('profile_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    logger.error('My registrations lookup failed', error, { userId: ctx.user.id });
    return { error: 'Could not load your registrations', status: 500 };
  }
  const now = Date.now();
  const registrations = (data || [])
    .filter((row) => row.events && (includePast || new Date(row.events.ends_at || row.events.starts_at).getTime() >= now))
    .map((row) => ({
      registration_id: row.id,
      registered_at: row.created_at,
      event: { ...row.events, club: row.events.clubs?.name || null, clubs: undefined },
    }));
  return { registrations };
}

export async function signUpForTask(ctx, taskId) {
  const { data: task, error: taskError } = await ctx.db
    .from('tasks')
    .select('id, event_id, title, volunteers_needed, events(id, title, status)')
    .eq('id', taskId)
    .maybeSingle();
  if (taskError) {
    logger.error('Volunteer task lookup failed', taskError, { taskId, userId: ctx.user.id });
    return { error: 'Could not load this task', status: 500 };
  }
  if (!task || !task.events) return { error: 'Task not found', status: 404 };
  if (task.events.status !== 'active') return inactiveEventError(task.events.status);

  const { data, error } = await ctx.db
    .from('volunteer_signups')
    .insert({ task_id: taskId, event_id: task.event_id, profile_id: ctx.user.id })
    .select('id, task_id, event_id, signed_up_at')
    .single();
  if (error) {
    const mapped = participationInsertError(error, 'task');
    if (mapped) return mapped;
    logger.error('Volunteer signup insert failed', error, { taskId, userId: ctx.user.id });
    return { error: 'Could not sign up for this task right now', status: 500 };
  }

  await notifyVolunteerAdded(ctx.admin, ctx.user.id, task.event_id, taskId);
  return { signup: { ...data, task_title: task.title, event_title: task.events.title } };
}

export async function cancelVolunteerSignup(ctx, taskId) {
  const { data, error } = await ctx.db
    .from('volunteer_signups')
    .delete()
    .eq('task_id', taskId)
    .eq('profile_id', ctx.user.id)
    .select('id');
  if (error) {
    logger.error('Volunteer signup delete failed', error, { taskId, userId: ctx.user.id });
    return { error: 'Could not cancel your signup right now', status: 500 };
  }
  if (!data?.length) return { error: 'You are not signed up for this task', status: 404 };
  return { cancelled: true, task_id: taskId };
}

export async function findMyVolunteerSignup(ctx, taskId) {
  const { data, error } = await ctx.db
    .from('volunteer_signups')
    .select('id, signed_up_at, tasks(id, title), events(id, title, starts_at)')
    .eq('task_id', taskId)
    .eq('profile_id', ctx.user.id)
    .maybeSingle();
  if (error) return { error: 'Could not load your signup', status: 500 };
  if (!data) return { error: 'You are not signed up for this task', status: 404 };
  return { signup: data };
}

export async function getMyVolunteering(ctx, { includePast = false } = {}) {
  const { data, error } = await ctx.db
    .from('volunteer_signups')
    .select('id, signed_up_at, tasks(id, title, description, volunteers_needed), events(id, title, starts_at, ends_at, location, status)')
    .eq('profile_id', ctx.user.id)
    .order('signed_up_at', { ascending: false })
    .limit(200);
  if (error) {
    logger.error('My volunteering lookup failed', error, { userId: ctx.user.id });
    return { error: 'Could not load your volunteering', status: 500 };
  }
  const now = Date.now();
  const signups = (data || [])
    .filter((row) => row.events && (includePast || new Date(row.events.ends_at || row.events.starts_at).getTime() >= now))
    .map((row) => ({ signup_id: row.id, signed_up_at: row.signed_up_at, task: row.tasks, event: row.events }));
  return { signups };
}
