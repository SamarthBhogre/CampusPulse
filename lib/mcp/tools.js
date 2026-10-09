import { z } from 'zod';
import { logger } from '@/lib/logger';
import { createAnonClient, buildAuthContext } from '@/lib/mcp/auth';
import * as discovery from '@/lib/services/discovery';
import * as participation from '@/lib/services/participation';
import * as profiles from '@/lib/services/profile';
import * as events from '@/lib/services/events';
import * as tasks from '@/lib/services/tasks';
import * as insights from '@/lib/services/event-insights';
import { previewAnnouncement, sendAnnouncement, ANNOUNCEMENT_AUDIENCES, MAX_MESSAGE_LENGTH } from '@/lib/services/announcements';
import { moderateEvent, MODERATION_ACTIONS } from '@/lib/services/moderation';

/**
 * CampusPulse MCP tools.
 *
 * Access levels:
 *   public     — anyone; reads only what RLS exposes to the caller
 *   student    — any signed-in, non-suspended user; acts only on their own data
 *   organizer  — role 'organizer'; manages only events they created
 *   admin      — role 'admin'; read/cancel any event, moderate events
 *
 * Tools are registered only for callers allowed to use them, and every
 * protected handler re-checks the verified role before doing anything.
 */

const ROLE_LEVELS = {
  public: () => true,
  student: (ctx) => Boolean(ctx),
  organizer: (ctx) => ctx?.profile.role === 'organizer',
  organizer_or_admin: (ctx) => ['organizer', 'admin'].includes(ctx?.profile.role),
  admin: (ctx) => ctx?.profile.role === 'admin',
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

// ── Input schema building blocks ──────────────────────────────────────────────
const id = (what) => z.string().uuid(`${what} must be a valid id`).describe(`The ${what} id (UUID)`);
const isoDate = (description) => z.string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be an ISO 8601 date or date-time')
  .describe(description);
const confirm = z.boolean().optional().describe(
  'Set to true only after the user has explicitly confirmed this action. Without it the tool returns a preview and changes nothing.'
);
const searchText = z.string().trim().max(100);

const toIso = (value) => (value ? new Date(value).toISOString() : null);

// ── Result helpers ────────────────────────────────────────────────────────────
function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function fail(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Converts a service result ({ error, status } or data) into an MCP tool result. */
function fromService(result) {
  if (result?.error) return fail(result.error);
  return ok(result);
}

function needsConfirmation(action, preview) {
  return ok({
    requires_confirmation: true,
    action,
    preview,
    next_step: 'Nothing has changed yet. Show this preview to the user and, only if they explicitly agree, call this tool again with the same arguments plus confirm: true.',
  });
}

/** `deps` lets tests inject Supabase clients; production uses real ones. */
export function registerCampusPulseTools(server, { authInfo = null, deps = {} } = {}) {
  const ctx = authInfo ? buildAuthContext(authInfo, deps) : null;
  const activeCtx = ctx && !ctx.isSuspended ? ctx : null;
  // Public reads run as the caller when signed in (so members see club-only events), else as anon.
  const readDb = () => activeCtx?.db || deps.anonClient || createAnonClient();
  const viewerId = activeCtx?.user.id || null;

  function register(name, level, config, handler) {
    if (!ROLE_LEVELS[level](activeCtx)) return;
    server.registerTool(name, config, async (args) => {
      if (level !== 'public') {
        if (!ctx) return fail('Sign in to CampusPulse to use this tool.');
        if (ctx.isSuspended) return fail('Your CampusPulse account is suspended.');
        if (!ROLE_LEVELS[level](activeCtx)) return fail('You do not have permission to use this tool.');
      }
      try {
        return await handler(args || {});
      } catch (error) {
        logger.error('MCP tool failed', error, { tool: name, userId: viewerId });
        return fail('Something went wrong while running this tool. Please try again.');
      }
    });
  }

  // ── Public: event discovery ─────────────────────────────────────────────────
  register('search_events', 'public', {
    title: 'Search events',
    description: 'Search active campus events by keyword, club (CampusPulse groups events by club rather than category), and date range. Defaults to upcoming events; pass date_from to include earlier ones. Returns attendance and volunteer availability.',
    inputSchema: {
      query: searchText.optional().describe('Keywords matched against event titles and descriptions'),
      club: searchText.optional().describe('Club name (or part of it) to filter by; this is the event category'),
      club_id: id('club').optional(),
      date_from: isoDate('Only events starting at or after this time (default: now)').optional(),
      date_to: isoDate('Only events starting at or before this time').optional(),
      open_volunteer_slots_only: z.boolean().optional().describe('Only events with unfilled volunteer slots'),
      page: z.number().int().min(0).max(100).optional().describe('Zero-based page number'),
      page_size: z.number().int().min(1).max(25).optional().describe('Results per page (default 10)'),
    },
    annotations: READ_ONLY,
  }, async (args) => fromService(await discovery.searchEvents(readDb(), {
    query: args.query,
    club: args.club,
    clubId: args.club_id,
    // Match the web events page, which shows upcoming events unless asked otherwise.
    dateFrom: toIso(args.date_from) || (args.date_to ? null : new Date().toISOString()),
    dateTo: toIso(args.date_to),
    openVolunteerSlotsOnly: args.open_volunteer_slots_only ?? false,
    page: args.page ?? 0,
    pageSize: args.page_size ?? 10,
  })));

  register('get_upcoming_events', 'public', {
    title: 'Upcoming events',
    description: 'List active campus events starting within the next N days, soonest first.',
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('How many days ahead to look (default 30)'),
      limit: z.number().int().min(1).max(25).optional().describe('Maximum events to return (default 10)'),
    },
    annotations: READ_ONLY,
  }, async (args) => fromService(await discovery.getUpcomingEvents(readDb(), { days: args.days ?? 30, limit: args.limit ?? 10 })));

  register('get_event_details', 'public', {
    title: 'Event details',
    description: 'Get full details for one event: description, schedule, location, organizer, registration status, and volunteer tasks.',
    inputSchema: { event_id: id('event') },
    annotations: READ_ONLY,
  }, async (args) => fromService(await discovery.getEventDetails(readDb(), args.event_id, { viewerId })));

  register('check_event_capacity', 'public', {
    title: 'Check event capacity',
    description: 'Check how many people are attending an event, its attendee limit, seats left, and whether registration is open.',
    inputSchema: { event_id: id('event') },
    annotations: READ_ONLY,
  }, async (args) => fromService(await discovery.checkEventCapacity(readDb(), args.event_id, { viewerId })));

  // ── Public: volunteering discovery ──────────────────────────────────────────
  register('search_volunteer_tasks', 'public', {
    title: 'Search volunteer tasks',
    description: 'Find volunteer tasks on upcoming active events, optionally filtered by keyword or event.',
    inputSchema: {
      query: searchText.optional().describe('Keywords matched against task titles and descriptions'),
      event_id: id('event').optional(),
      open_only: z.boolean().optional().describe('Only tasks with open spots (default true)'),
      limit: z.number().int().min(1).max(25).optional().describe('Maximum tasks to return (default 20)'),
    },
    annotations: READ_ONLY,
  }, async (args) => fromService(await discovery.searchVolunteerTasks(readDb(), {
    query: args.query,
    eventId: args.event_id,
    openOnly: args.open_only ?? true,
    limit: args.limit ?? 20,
  })));

  register('get_volunteer_task_details', 'public', {
    title: 'Volunteer task details',
    description: 'Get a volunteer task with its event and current availability.',
    inputSchema: { task_id: id('task') },
    annotations: READ_ONLY,
  }, async (args) => fromService(await discovery.getVolunteerTaskDetails(readDb(), args.task_id, { viewerId })));

  if (!activeCtx) return;

  // ── Student: registrations ──────────────────────────────────────────────────
  register('register_for_event', 'student', {
    title: 'Register for event',
    description: 'RSVP the signed-in student to an event. Fails if already registered, the event is full or closed, or it is a club-only event and the student is not a member.',
    inputSchema: { event_id: id('event') },
    annotations: WRITE,
  }, async (args) => fromService(await participation.registerForEvent(activeCtx, args.event_id)));

  register('cancel_event_registration', 'student', {
    title: 'Cancel event registration',
    description: "Cancel the signed-in student's RSVP for an event. Requires confirm: true; without it, returns a preview.",
    inputSchema: { event_id: id('event'), confirm },
    annotations: DESTRUCTIVE,
  }, async (args) => {
    if (!args.confirm) {
      const found = await participation.findMyRegistration(activeCtx, args.event_id);
      if (found.error) return fail(found.error);
      return needsConfirmation('cancel_event_registration', {
        event: found.registration.events,
        registered_at: found.registration.created_at,
        warning: 'If the event has an attendee limit, the seat may be taken by someone else.',
      });
    }
    return fromService(await participation.cancelRegistration(activeCtx, args.event_id));
  });

  register('get_my_registrations', 'student', {
    title: 'My registrations',
    description: "List the signed-in student's event registrations (upcoming by default).",
    inputSchema: { include_past: z.boolean().optional().describe('Include events that have already ended') },
    annotations: READ_ONLY,
  }, async (args) => fromService(await participation.getMyRegistrations(activeCtx, { includePast: args.include_past ?? false })));

  // ── Student: volunteering ───────────────────────────────────────────────────
  register('sign_up_for_volunteer_task', 'student', {
    title: 'Sign up to volunteer',
    description: 'Sign the signed-in student up for a volunteer task. Fails if already signed up, the task is full, or the event is club-only and the student is not a member.',
    inputSchema: { task_id: id('task') },
    annotations: WRITE,
  }, async (args) => fromService(await participation.signUpForTask(activeCtx, args.task_id)));

  register('cancel_volunteer_signup', 'student', {
    title: 'Cancel volunteer signup',
    description: "Withdraw the signed-in student from a volunteer task. Requires confirm: true; without it, returns a preview.",
    inputSchema: { task_id: id('task'), confirm },
    annotations: DESTRUCTIVE,
  }, async (args) => {
    if (!args.confirm) {
      const found = await participation.findMyVolunteerSignup(activeCtx, args.task_id);
      if (found.error) return fail(found.error);
      return needsConfirmation('cancel_volunteer_signup', {
        task: found.signup.tasks,
        event: found.signup.events,
        signed_up_at: found.signup.signed_up_at,
      });
    }
    return fromService(await participation.cancelVolunteerSignup(activeCtx, args.task_id));
  });

  register('get_my_volunteering', 'student', {
    title: 'My volunteering',
    description: "List the signed-in student's volunteer signups (upcoming by default).",
    inputSchema: { include_past: z.boolean().optional().describe('Include events that have already ended') },
    annotations: READ_ONLY,
  }, async (args) => fromService(await participation.getMyVolunteering(activeCtx, { includePast: args.include_past ?? false })));

  // ── Student: profile ────────────────────────────────────────────────────────
  register('get_my_profile', 'student', {
    title: 'My profile',
    description: "Get the signed-in user's own profile (name, username, email, role).",
    inputSchema: {},
    annotations: READ_ONLY,
  }, async () => fromService(await profiles.getOwnProfile(activeCtx.db, activeCtx.user)));

  register('update_my_profile', 'student', {
    title: 'Update my profile',
    description: "Update the signed-in user's display name and/or username. Role, email, and account status cannot be changed.",
    inputSchema: {
      full_name: z.string().trim().min(1).max(100).optional().describe('New display name'),
      username: z.string().trim().min(3).max(30).optional().describe('New username (3–30 chars: lowercase letters, digits, _ . -)'),
    },
    annotations: WRITE,
  }, async (args) => fromService(await profiles.updateOwnProfile(activeCtx.db, { full_name: args.full_name, username: args.username })));

  // ── Organizer: event management ─────────────────────────────────────────────
  const eventFields = {
    title: z.string().trim().min(1).max(200).describe('Event title'),
    description: z.string().trim().max(5000).nullable().optional().describe('Event description'),
    location: z.string().trim().max(300).nullable().optional().describe('Where the event happens'),
    starts_at: isoDate('Start date-time (ISO 8601, include a timezone offset)'),
    ends_at: isoDate('End date-time (ISO 8601)').nullable().optional(),
    club_id: id('club').nullable().optional(),
    visibility: z.enum(['public', 'club_only']).optional().describe('public, or club_only (members only)'),
    max_attendees: z.number().int().min(1).max(100000).nullable().optional().describe('Attendee limit; null for unlimited'),
    cover_image: z.string().url().max(2048).nullable().optional().describe('Cover image URL'),
  };

  register('create_event', 'organizer', {
    title: 'Create event',
    description: 'Create a campus event owned by the signed-in organizer.',
    inputSchema: eventFields,
    annotations: WRITE,
  }, async (args) => fromService(await events.createEvent(activeCtx, { ...args, visibility: args.visibility ?? 'public' })));

  register('update_event', 'organizer', {
    title: 'Update event',
    description: 'Update fields of an event the organizer owns; omitted fields are unchanged. All attendees and volunteers are notified, so this requires confirm: true.',
    inputSchema: {
      event_id: id('event'),
      ...Object.fromEntries(Object.entries(eventFields).map(([key, schema]) => [key, schema.optional()])),
      confirm,
    },
    annotations: WRITE,
  }, async ({ event_id: eventId, confirm: confirmed, ...changes }) => {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    if (Object.keys(defined).length === 0) return fail('Provide at least one field to update.');
    if (!confirmed) {
      const owner = await events.getManagedEvent(activeCtx, eventId, { columns: 'id, title, starts_at, status' });
      if (owner.error) return fail(owner.error);
      return needsConfirmation('update_event', {
        event: owner.event,
        changes: defined,
        effect: 'Every attendee and volunteer will be notified that the event was updated.',
      });
    }
    return fromService(await events.updateEvent(activeCtx, eventId, defined, { partial: true }));
  });

  register('cancel_event', 'organizer_or_admin', {
    title: 'Cancel event',
    description: 'Cancel an event (organizers: their own events; admins: any event). Participants are notified. Requires confirm: true.',
    inputSchema: { event_id: id('event'), confirm },
    annotations: DESTRUCTIVE,
  }, async (args) => {
    if (!args.confirm) {
      const owner = await events.getManagedEvent(activeCtx, args.event_id, { columns: 'id, title, starts_at, status', allowAdmin: true });
      if (owner.error) return fail(owner.error);
      const stats = await insights.getEventStatistics(activeCtx, args.event_id);
      return needsConfirmation('cancel_event', {
        event: owner.event,
        participants_to_notify: stats.error ? null : stats.unique_participants,
        effect: 'The event will be marked cancelled and every attendee and volunteer notified. Organizers cannot undo this.',
      });
    }
    return fromService(await events.cancelEvent(activeCtx, args.event_id));
  });

  register('create_volunteer_task', 'organizer', {
    title: 'Create volunteer task',
    description: 'Add a volunteer task to an event the organizer owns.',
    inputSchema: {
      event_id: id('event'),
      title: z.string().trim().min(1).max(200).describe('Task title'),
      description: z.string().trim().max(2000).nullable().optional().describe('What volunteers will do'),
      volunteers_needed: z.number().int().min(1).max(1000).describe('How many volunteers are needed'),
    },
    annotations: WRITE,
  }, async ({ event_id: eventId, ...input }) => fromService(await tasks.createTask(activeCtx, eventId, input)));

  register('update_volunteer_task', 'organizer', {
    title: 'Update volunteer task',
    description: "Update a volunteer task on an event the organizer owns. Capacity can't be set below the current number of signups.",
    inputSchema: {
      task_id: id('task'),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      volunteers_needed: z.number().int().min(1).max(1000).optional(),
    },
    annotations: WRITE,
  }, async ({ task_id: taskId, ...input }) => fromService(await tasks.updateTask(activeCtx, taskId, input)));

  register('get_event_participants', 'organizer_or_admin', {
    title: 'Event participants',
    description: 'List attendees and/or volunteers (name, username, email, check-in) for an event the organizer owns (admins: any event).',
    inputSchema: {
      event_id: id('event'),
      include: z.enum(['attendees', 'volunteers', 'both']).optional().describe('Which participants to list (default both)'),
    },
    annotations: READ_ONLY,
  }, async (args) => fromService(await insights.getEventParticipants(activeCtx, args.event_id, { include: args.include ?? 'both' })));

  register('get_event_statistics', 'organizer_or_admin', {
    title: 'Event statistics',
    description: 'Registration, attendance (check-in), and volunteering statistics for an event the organizer owns (admins: any event).',
    inputSchema: { event_id: id('event') },
    annotations: READ_ONLY,
  }, async (args) => fromService(await insights.getEventStatistics(activeCtx, args.event_id)));

  register('send_event_announcement', 'organizer', {
    title: 'Send event announcement',
    description: "Notify an owned event's attendees, volunteers, or both. Requires confirm: true; without it, returns the recipient count.",
    inputSchema: {
      event_id: id('event'),
      message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH).describe('Announcement text'),
      audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional().describe('attendees, volunteers, or both (default)'),
      confirm,
    },
    annotations: { ...WRITE, openWorldHint: true },
  }, async (args) => {
    const input = { message: args.message, audience: args.audience ?? 'both' };
    if (!args.confirm) {
      const preview = await previewAnnouncement(activeCtx, args.event_id, input);
      if (preview.error) return fail(preview.error);
      return needsConfirmation('send_event_announcement', {
        event: preview.event.title,
        audience: preview.audience,
        recipients: preview.recipientCount,
        message: preview.message,
      });
    }
    return fromService(await sendAnnouncement(activeCtx, args.event_id, input));
  });

  // ── Admin: moderation (mirrors PATCH /api/admin/events/[id]) ────────────────
  register('moderate_event', 'admin', {
    title: 'Moderate event',
    description: 'Admin only: hide an event from discovery, restore it, or cancel it. Requires confirm: true.',
    inputSchema: {
      event_id: id('event'),
      action: z.enum(MODERATION_ACTIONS).describe('hide, restore, or cancel'),
      confirm,
    },
    annotations: DESTRUCTIVE,
  }, async (args) => {
    if (!args.confirm) {
      const { data: event, error } = await activeCtx.admin
        .from('events').select('id, title, status, starts_at').eq('id', args.event_id).maybeSingle();
      if (error) return fail('Could not load this event');
      if (!event) return fail('Event not found');
      return needsConfirmation('moderate_event', { event, action: args.action });
    }
    return fromService(await moderateEvent(activeCtx, args.event_id, args.action));
  });
}
