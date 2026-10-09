import { getRegistrationState } from '@/lib/event-registration';
import { logger } from '@/lib/logger';

/**
 * Read-only event and volunteer discovery.
 *
 * `db` is either an anonymous client (public access) or a client authenticated
 * as the caller, so RLS decides which events are visible (public events, plus
 * club-only events for members, creators and admins). Hidden events are never
 * returned to anyone but their organizer.
 */

const EVENT_DETAIL_COLUMNS = 'id, club_id, title, description, location, starts_at, ends_at, cover_image, visibility, created_by, status, max_attendees, registration_mode, clubs(name)';

/** Strips characters that carry meaning in PostgREST filters or LIKE patterns. */
export function sanitizeSearchTerm(value) {
  return String(value || '').replace(/[,()*%_\\:."'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function failure(message, error, context) {
  logger.error(message, error, context);
  return { error: 'Could not load event data right now', status: 500 };
}

function summarizeListedEvent(event) {
  const registration = event.registration
    ? getRegistrationState(event.registration, event.registration.rsvp_count)
    : null;
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    visibility: event.visibility,
    status: event.status,
    club: event.clubs?.name || null,
    club_id: event.club_id,
    volunteer_slots: {
      needed: Number(event.capacity?.total_needed || 0),
      filled: Number(event.capacity?.total_filled || 0),
    },
    registration: registration && {
      attending: registration.count,
      max_attendees: registration.max,
      spots_left: registration.spotsLeft,
      open: registration.isOpen,
    },
  };
}

/** Resolves a club name (the app's event category) to matching club ids. */
async function resolveClubIds(db, club) {
  const term = sanitizeSearchTerm(club);
  if (!term) return [];
  const { data, error } = await db.from('clubs').select('id, name').ilike('name', `%${term}%`).limit(10);
  if (error) throw error;
  return data || [];
}

export async function searchEvents(db, {
  query = null, club = null, clubId = null, dateFrom = null, dateTo = null,
  openVolunteerSlotsOnly = false, page = 0, pageSize = 10,
} = {}) {
  try {
    let clubIds = clubId ? [clubId] : [null];
    if (!clubId && club) {
      const clubs = await resolveClubIds(db, club);
      if (clubs.length === 0) return { events: [], total: 0, message: `No club matches "${club}"` };
      clubIds = clubs.map((c) => c.id);
    }

    // get_events_page filters by a single club; query each matched club and merge.
    const results = await Promise.all(clubIds.map((id) => db.rpc('get_events_page', {
      p_search: query || null,
      p_club_id: id,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_open_only: openVolunteerSlotsOnly,
      p_page: clubIds.length > 1 ? 0 : page,
      p_page_size: pageSize,
    })));
    const failed = results.find((r) => r.error);
    if (failed) return failure('MCP event search failed', failed.error, { query });

    const events = results
      .flatMap((r) => r.data?.events || [])
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, pageSize)
      .map(summarizeListedEvent);
    const total = results.reduce((sum, r) => sum + Number(r.data?.total || 0), 0);
    return { events, total, page };
  } catch (error) {
    return failure('MCP event search failed', error, { query });
  }
}

export async function getUpcomingEvents(db, { days = 30, limit = 10 } = {}) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return searchEvents(db, { dateFrom: now.toISOString(), dateTo: until.toISOString(), pageSize: limit });
}

async function loadEvent(db, eventId, viewerId) {
  const { data, error } = await db.from('events').select(EVENT_DETAIL_COLUMNS).eq('id', eventId).maybeSingle();
  if (error) return failure('MCP event lookup failed', error, { eventId });
  if (!data || (data.status === 'hidden' && data.created_by !== viewerId)) {
    return { error: 'Event not found', status: 404 };
  }
  return { event: data };
}

export async function checkEventCapacity(db, eventId, { viewerId = null } = {}) {
  const loaded = await loadEvent(db, eventId, viewerId);
  if (loaded.error) return loaded;
  const { data: summary, error } = await db.rpc('get_event_rsvp_summary', { p_event_id: eventId });
  if (error) return failure('MCP RSVP summary failed', error, { eventId });

  const state = getRegistrationState(loaded.event, summary?.[0]?.rsvp_count);
  return {
    event_id: eventId,
    title: loaded.event.title,
    status: loaded.event.status,
    attending: state.count,
    max_attendees: state.max,
    spots_left: state.spotsLeft,
    registration_open: loaded.event.status === 'active' && state.isOpen,
    registration_mode: state.mode,
    i_am_registered: Boolean(summary?.[0]?.my_rsvp_id),
  };
}

async function loadTaskSummaries(db, eventIds) {
  const summaries = await Promise.all(eventIds.map((id) => db.rpc('get_event_task_summary', { p_event_id: id })));
  const failed = summaries.find((s) => s.error);
  if (failed) throw failed.error;
  const byTask = new Map();
  for (const { data } of summaries) {
    for (const row of data || []) byTask.set(row.task_id, row);
  }
  return byTask;
}

function summarizeTask(task, summary) {
  const filled = Number(summary?.signup_count || 0);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    volunteers_needed: task.volunteers_needed,
    volunteers_signed_up: filled,
    spots_left: Math.max(0, task.volunteers_needed - filled),
    i_am_signed_up: Boolean(summary?.my_signup_id),
  };
}

export async function getEventDetails(db, eventId, { viewerId = null } = {}) {
  const loaded = await loadEvent(db, eventId, viewerId);
  if (loaded.error) return loaded;
  const { event } = loaded;

  try {
    const [organizer, tasks, capacity] = await Promise.all([
      db.from('public_profiles').select('full_name').eq('id', event.created_by).maybeSingle(),
      db.from('tasks').select('id, title, description, volunteers_needed').eq('event_id', eventId).order('created_at'),
      checkEventCapacity(db, eventId, { viewerId }),
    ]);
    if (tasks.error) throw tasks.error;
    if (capacity.error) return capacity;
    const taskSummaries = await loadTaskSummaries(db, [eventId]);

    return {
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        cover_image: event.cover_image,
        visibility: event.visibility,
        status: event.status,
        club: event.clubs?.name || null,
        organizer: organizer.data?.full_name || null,
        url_path: `/events/${event.id}`,
      },
      registration: capacity,
      volunteer_tasks: (tasks.data || []).map((task) => summarizeTask(task, taskSummaries.get(task.id))),
    };
  } catch (error) {
    return failure('MCP event detail failed', error, { eventId });
  }
}

export async function searchVolunteerTasks(db, { query = null, eventId = null, openOnly = true, limit = 20 } = {}) {
  try {
    let request = db
      .from('tasks')
      .select('id, title, description, volunteers_needed, event_id, events!inner(id, title, starts_at, location, status, clubs(name))')
      .eq('events.status', 'active')
      .gte('events.starts_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(Math.min(limit * 3, 100));
    if (eventId) request = request.eq('event_id', eventId);
    const term = sanitizeSearchTerm(query);
    if (term) request = request.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    const { data, error } = await request;
    if (error) throw error;

    const summaries = await loadTaskSummaries(db, [...new Set((data || []).map((t) => t.event_id))]);
    const tasks = (data || [])
      .map((task) => ({
        ...summarizeTask(task, summaries.get(task.id)),
        event: {
          id: task.events.id,
          title: task.events.title,
          starts_at: task.events.starts_at,
          location: task.events.location,
          club: task.events.clubs?.name || null,
        },
      }))
      .filter((task) => !openOnly || task.spots_left > 0)
      .slice(0, limit);
    return { tasks };
  } catch (error) {
    return failure('MCP volunteer task search failed', error, { query });
  }
}

export async function getVolunteerTaskDetails(db, taskId, { viewerId = null } = {}) {
  const { data: task, error } = await db
    .from('tasks')
    .select('id, title, description, volunteers_needed, event_id, events!inner(id, title, starts_at, ends_at, location, status, created_by, clubs(name))')
    .eq('id', taskId)
    .maybeSingle();
  if (error) return failure('MCP task lookup failed', error, { taskId });
  if (!task || (task.events.status === 'hidden' && task.events.created_by !== viewerId)) {
    return { error: 'Task not found', status: 404 };
  }
  try {
    const summaries = await loadTaskSummaries(db, [task.event_id]);
    const summary = summarizeTask(task, summaries.get(task.id));
    return {
      task: {
        ...summary,
        open: task.events.status === 'active' && summary.spots_left > 0,
        event: {
          id: task.events.id,
          title: task.events.title,
          starts_at: task.events.starts_at,
          ends_at: task.events.ends_at,
          location: task.events.location,
          status: task.events.status,
          club: task.events.clubs?.name || null,
        },
      },
    };
  } catch (summaryError) {
    return failure('MCP task summary failed', summaryError, { taskId });
  }
}
