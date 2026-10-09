import { getManagedEvent } from '@/lib/services/events';
import { getRegistrationState } from '@/lib/event-registration';
import { logger } from '@/lib/logger';

/**
 * Participant lists and statistics for events the caller manages (their own
 * events; admins may read any event). Ownership is checked before the
 * service-role client reads participant data.
 */

const EVENT_COLUMNS = 'id, title, starts_at, status, created_by, max_attendees, registration_mode';

async function loadParticipationRows(admin, eventId) {
  const [rsvps, signups, attendance, tasks] = await Promise.all([
    admin.from('event_rsvps')
      .select('profile_id, created_at, profiles!event_rsvps_profile_id_fkey(full_name, username, email)')
      .eq('event_id', eventId)
      .order('created_at'),
    admin.from('volunteer_signups')
      .select('profile_id, task_id, signed_up_at, profiles!volunteer_signups_profile_id_fkey(full_name, username, email)')
      .eq('event_id', eventId)
      .order('signed_up_at'),
    admin.from('event_attendance').select('profile_id, checked_in_at').eq('event_id', eventId),
    admin.from('tasks').select('id, title, volunteers_needed').eq('event_id', eventId).order('created_at'),
  ]);
  const failed = [rsvps, signups, attendance, tasks].find((r) => r.error);
  if (failed) throw failed.error;
  return { rsvps: rsvps.data || [], signups: signups.data || [], attendance: attendance.data || [], tasks: tasks.data || [] };
}

export async function getEventParticipants(ctx, eventId, { include = 'both' } = {}) {
  const owner = await getManagedEvent(ctx, eventId, { columns: EVENT_COLUMNS, allowAdmin: true });
  if (owner.error) return owner;

  try {
    const rows = await loadParticipationRows(ctx.admin, eventId);
    const checkedIn = new Map(rows.attendance.map((a) => [a.profile_id, a.checked_in_at]));
    const taskTitles = new Map(rows.tasks.map((t) => [t.id, t.title]));
    const person = (row) => ({
      profile_id: row.profile_id,
      name: row.profiles?.full_name || null,
      username: row.profiles?.username || null,
      email: row.profiles?.email || null,
      checked_in_at: checkedIn.get(row.profile_id) || null,
    });

    const result = { event: { id: owner.event.id, title: owner.event.title, starts_at: owner.event.starts_at } };
    if (include !== 'volunteers') {
      result.attendees = rows.rsvps.map((row) => ({ ...person(row), registered_at: row.created_at }));
    }
    if (include !== 'attendees') {
      result.volunteers = rows.signups.map((row) => ({
        ...person(row),
        task_id: row.task_id,
        task: taskTitles.get(row.task_id) || null,
        signed_up_at: row.signed_up_at,
      }));
    }
    return result;
  } catch (error) {
    logger.error('Event participants lookup failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not load participants', status: 500 };
  }
}

export async function getEventStatistics(ctx, eventId) {
  const owner = await getManagedEvent(ctx, eventId, { columns: EVENT_COLUMNS, allowAdmin: true });
  if (owner.error) return owner;
  const { event } = owner;

  try {
    const rows = await loadParticipationRows(ctx.admin, eventId);
    const registration = getRegistrationState(event, rows.rsvps.length);
    const rsvpIds = new Set(rows.rsvps.map((r) => r.profile_id));
    const checkedInAttendees = rows.attendance.filter((a) => rsvpIds.has(a.profile_id)).length;
    const signupsByTask = rows.signups.reduce((map, s) => map.set(s.task_id, (map.get(s.task_id) || 0) + 1), new Map());
    const volunteersNeeded = rows.tasks.reduce((sum, t) => sum + t.volunteers_needed, 0);
    const uniqueParticipants = new Set([...rsvpIds, ...rows.signups.map((s) => s.profile_id)]);

    return {
      event: { id: event.id, title: event.title, starts_at: event.starts_at, status: event.status },
      registrations: {
        attending: registration.count,
        max_attendees: registration.max,
        spots_left: registration.spotsLeft,
        registration_mode: registration.mode,
        registration_open: event.status === 'active' && registration.isOpen,
        fill_rate: registration.max ? Number((registration.count / registration.max).toFixed(3)) : null,
      },
      attendance: {
        checked_in_total: rows.attendance.length,
        checked_in_registered_attendees: checkedInAttendees,
        attendance_rate: rows.rsvps.length ? Number((checkedInAttendees / rows.rsvps.length).toFixed(3)) : null,
      },
      volunteering: {
        tasks: rows.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          volunteers_needed: t.volunteers_needed,
          volunteers_signed_up: signupsByTask.get(t.id) || 0,
        })),
        volunteers_needed: volunteersNeeded,
        volunteer_signups: rows.signups.length,
      },
      unique_participants: uniqueParticipants.size,
    };
  } catch (error) {
    logger.error('Event statistics failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not load event statistics', status: 500 };
  }
}
