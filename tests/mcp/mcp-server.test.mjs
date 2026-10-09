/**
 * CampusPulse MCP server tests: tool permissions, identity, confirmation, and
 * failure handling. Drives the real tool handlers through the official MCP
 * client over an in-memory transport, with Supabase clients mocked.
 *
 * Run with: node --import ./tests/mcp/register-aliases.mjs --test tests/mcp/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerCampusPulseTools } from '@/lib/mcp/tools';
import { verifyMcpToken } from '@/lib/mcp/auth';
import { sanitizeSearchTerm } from '@/lib/services/discovery';
import { createMockSupabase, opArg, fakeJwt } from './mock-supabase.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const TASK_ID = '44444444-4444-4444-8444-444444444444';

const PUBLIC_TOOLS = [
  'search_events', 'get_upcoming_events', 'get_event_details', 'check_event_capacity',
  'search_volunteer_tasks', 'get_volunteer_task_details',
];
const STUDENT_TOOLS = [
  'register_for_event', 'cancel_event_registration', 'get_my_registrations',
  'sign_up_for_volunteer_task', 'cancel_volunteer_signup', 'get_my_volunteering',
  'get_my_profile', 'update_my_profile',
];
const ORGANIZER_TOOLS = [
  'create_event', 'update_event', 'cancel_event', 'create_volunteer_task',
  'update_volunteer_task', 'get_event_participants', 'get_event_statistics', 'send_event_announcement',
];

function authInfoFor(role, { isSuspended = false } = {}) {
  return { token: 'token', clientId: 'client', scopes: [], extra: { userId: USER_ID, email: 'me@campus.edu', role, isSuspended } };
}

async function connect({ authInfo = null, userClient, adminClient, anonClient } = {}) {
  const deps = {
    userClient: userClient || createMockSupabase(),
    adminClient: adminClient || createMockSupabase(),
    anonClient: anonClient || createMockSupabase(),
  };
  const server = new McpServer({ name: 'campus-pulse-test', version: '0.0.0' });
  registerCampusPulseTools(server, { authInfo, deps });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, ...deps };
}

async function toolNames(client) {
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

const sorted = (...lists) => lists.flat().sort();

// ─────────────────────────────────────────────────────────────────────────────
describe('Tool access by role', () => {
  test('unauthenticated callers only get public read-only tools', async () => {
    const { client } = await connect();
    assert.deepEqual(await toolNames(client), sorted(PUBLIC_TOOLS));
  });

  test('students get public and their own-data tools, nothing organizer-level', async () => {
    const { client } = await connect({ authInfo: authInfoFor('student') });
    assert.deepEqual(await toolNames(client), sorted(PUBLIC_TOOLS, STUDENT_TOOLS));
  });

  test('organizers get student and organizer tools but not admin moderation', async () => {
    const { client } = await connect({ authInfo: authInfoFor('organizer') });
    assert.deepEqual(await toolNames(client), sorted(PUBLIC_TOOLS, STUDENT_TOOLS, ORGANIZER_TOOLS));
  });

  test('admins get read/cancel on any event plus moderation, but cannot author events', async () => {
    const { client } = await connect({ authInfo: authInfoFor('admin') });
    assert.deepEqual(await toolNames(client), sorted(
      PUBLIC_TOOLS, STUDENT_TOOLS,
      ['cancel_event', 'get_event_participants', 'get_event_statistics', 'moderate_event'],
    ));
  });

  test('suspended accounts are limited to public tools', async () => {
    const { client } = await connect({ authInfo: authInfoFor('organizer', { isSuspended: true }) });
    assert.deepEqual(await toolNames(client), sorted(PUBLIC_TOOLS));
  });

  test('calling an unregistered protected tool fails', async () => {
    const { client } = await connect({ authInfo: authInfoFor('student') });
    const result = await client.callTool({ name: 'create_event', arguments: { title: 'x', starts_at: '2030-01-01T10:00:00Z' } })
      .catch((error) => ({ isError: true, content: [{ text: error.message }] }));
    assert.equal(result.isError, true);
  });

  test('read-only tools are annotated read-only and mutating tools are not', async () => {
    const { client } = await connect({ authInfo: authInfoFor('organizer') });
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const readOnly = PUBLIC_TOOLS.includes(tool.name) || tool.name.startsWith('get_');
      assert.equal(tool.annotations?.readOnlyHint, readOnly, `${tool.name} readOnlyHint`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Public tools', () => {
  test('search_events runs as anon through get_events_page and never mutates', async () => {
    const anonClient = createMockSupabase((call) => (call.rpc === 'get_events_page'
      ? { data: { total: 1, events: [{ id: EVENT_ID, title: 'Hack Night', starts_at: '2030-01-01T10:00:00Z', capacity: { total_needed: 4, total_filled: 1 }, registration: { max_attendees: 50, registration_mode: 'auto', rsvp_count: 50 } }] }, error: null }
      : { data: null, error: null }));
    const { client } = await connect({ anonClient });

    const result = await client.callTool({ name: 'search_events', arguments: { query: 'hack', page_size: 5 } });
    assert.equal(result.isError, undefined);
    const [event] = result.structuredContent.events;
    assert.equal(event.title, 'Hack Night');
    assert.deepEqual(event.registration, { attending: 50, max_attendees: 50, spots_left: 0, open: false });
    assert.equal(anonClient.calls[0].params.p_page_size, 5);
    assert.equal(anonClient.mutations().length, 0);
  });

  test('hidden events are not exposed through get_event_details', async () => {
    const anonClient = createMockSupabase((call) => (call.table === 'events'
      ? { data: { id: EVENT_ID, title: 'Secret', status: 'hidden', created_by: OTHER_USER_ID }, error: null }
      : { data: null, error: null }));
    const { client } = await connect({ anonClient });
    const result = await client.callTool({ name: 'get_event_details', arguments: { event_id: EVENT_ID } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not found/i);
  });

  test('invalid ids are rejected by input validation', async () => {
    const { client, anonClient } = await connect();
    const result = await client.callTool({ name: 'check_event_capacity', arguments: { event_id: 'not-a-uuid' } });
    assert.equal(result.isError, true);
    assert.equal(anonClient.calls.length, 0);
  });

  test('search terms cannot inject PostgREST filter syntax', () => {
    assert.equal(sanitizeSearchTerm('a,b)or(id.eq.1%_x'), 'a b or id eq 1 x');
    assert.equal(sanitizeSearchTerm('x'.repeat(300)).length, 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Student identity and registrations', () => {
  const activeEvent = { data: { id: EVENT_ID, title: 'Hack Night', status: 'active', starts_at: '2030-01-01T10:00:00Z' }, error: null };

  test('register_for_event always inserts the verified user, ignoring client-supplied ids', async () => {
    const userClient = createMockSupabase((call) => {
      if (call.table === 'events') return activeEvent;
      if (call.table === 'event_rsvps') return { data: { id: 'rsvp-1', event_id: EVENT_ID, created_at: 'now' }, error: null };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });

    const result = await client.callTool({ name: 'register_for_event', arguments: { event_id: EVENT_ID, profile_id: OTHER_USER_ID } });
    assert.equal(result.isError, undefined);
    const insert = userClient.mutations().find((c) => c.table === 'event_rsvps');
    assert.deepEqual(opArg(insert, 'insert')[0], { event_id: EVENT_ID, profile_id: USER_ID });
  });

  test('duplicate registrations surface a clear error (unique constraint)', async () => {
    const userClient = createMockSupabase((call) => {
      if (call.table === 'events') return activeEvent;
      if (call.table === 'event_rsvps') return { data: null, error: { code: '23505', message: 'duplicate key value' } };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });
    const result = await client.callTool({ name: 'register_for_event', arguments: { event_id: EVENT_ID } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /already registered/);
  });

  test('a full event is reported from the capacity trigger', async () => {
    const userClient = createMockSupabase((call) => {
      if (call.table === 'events') return activeEvent;
      if (call.table === 'event_rsvps') return { data: null, error: { code: 'P0001', message: 'This event is full' } };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });
    const result = await client.callTool({ name: 'register_for_event', arguments: { event_id: EVENT_ID } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /full/);
  });

  test('club-only events reject non-members via RLS', async () => {
    const userClient = createMockSupabase((call) => {
      if (call.table === 'events') return activeEvent;
      if (call.table === 'event_rsvps') return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });
    const result = await client.callTool({ name: 'register_for_event', arguments: { event_id: EVENT_ID } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /club member/);
  });

  test('cancelled events cannot be joined', async () => {
    const userClient = createMockSupabase((call) => (call.table === 'events'
      ? { data: { ...activeEvent.data, status: 'cancelled' }, error: null }
      : { data: null, error: null }));
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });
    const result = await client.callTool({ name: 'register_for_event', arguments: { event_id: EVENT_ID } });
    assert.equal(result.isError, true);
    assert.equal(userClient.mutations().length, 0);
  });

  test('cancel_event_registration previews without confirm and deletes only the caller\'s row with confirm', async () => {
    const userClient = createMockSupabase((call) => {
      if (call.table !== 'event_rsvps') return { data: null, error: null };
      if (call.terminal === 'maybeSingle') return { data: { id: 'rsvp-1', created_at: 'now', events: { id: EVENT_ID, title: 'Hack Night' } }, error: null };
      return { data: [{ id: 'rsvp-1' }], error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });

    const preview = await client.callTool({ name: 'cancel_event_registration', arguments: { event_id: EVENT_ID } });
    assert.equal(preview.structuredContent.requires_confirmation, true);
    assert.equal(userClient.mutations().length, 0, 'preview must not mutate');

    const done = await client.callTool({ name: 'cancel_event_registration', arguments: { event_id: EVENT_ID, confirm: true } });
    assert.equal(done.structuredContent.cancelled, true);
    const [del] = userClient.mutations();
    assert.ok(del.ops.some(([op, col, val]) => op === 'eq' && col === 'profile_id' && val === USER_ID));
  });

  test('volunteer signup inserts the verified user and maps a full task', async () => {
    const userClient = createMockSupabase((call) => {
      if (call.table === 'tasks') return { data: { id: TASK_ID, event_id: EVENT_ID, title: 'Desk', volunteers_needed: 2, events: { id: EVENT_ID, title: 'Hack Night', status: 'active' } }, error: null };
      if (call.table === 'volunteer_signups') return { data: null, error: { code: 'P0001', message: 'Task is full' } };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });
    const result = await client.callTool({ name: 'sign_up_for_volunteer_task', arguments: { task_id: TASK_ID } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /already full/);
    const insert = userClient.mutations().find((c) => c.table === 'volunteer_signups');
    assert.deepEqual(opArg(insert, 'insert')[0], { task_id: TASK_ID, event_id: EVENT_ID, profile_id: USER_ID });
  });

  test('update_my_profile only sends name/username to update_own_profile', async () => {
    const userClient = createMockSupabase((call) => (call.rpc === 'update_own_profile'
      ? { data: { id: USER_ID, full_name: 'New Name' }, error: null }
      : { data: null, error: null }));
    const { client } = await connect({ authInfo: authInfoFor('student'), userClient });
    const result = await client.callTool({ name: 'update_my_profile', arguments: { full_name: 'New Name', role: 'admin', is_suspended: false } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(userClient.calls[0].params, { p_full_name: 'New Name', p_username: null, p_avatar_url: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Organizer authorization and confirmation', () => {
  test('organizers cannot update events they do not own', async () => {
    // Ownership lookup filters by created_by = caller; no row means not theirs.
    const adminClient = createMockSupabase(() => ({ data: null, error: null }));
    const { client } = await connect({ authInfo: authInfoFor('organizer'), adminClient });
    const result = await client.callTool({ name: 'update_event', arguments: { event_id: EVENT_ID, title: 'Mine now', confirm: true } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /do not own/);
    const lookup = adminClient.calls[0];
    assert.ok(lookup.ops.some(([op, col, val]) => op === 'eq' && col === 'created_by' && val === USER_ID));
    assert.equal(adminClient.mutations().length, 0);
  });

  test('create_event sets created_by from the verified user', async () => {
    const adminClient = createMockSupabase((call) => (call.table === 'events'
      ? { data: { id: EVENT_ID, title: 'Hack Night' }, error: null }
      : { data: null, error: null }));
    const { client } = await connect({ authInfo: authInfoFor('organizer'), adminClient });
    const result = await client.callTool({ name: 'create_event', arguments: { title: 'Hack Night', starts_at: '2030-01-01T10:00:00Z', max_attendees: 50 } });
    assert.equal(result.isError, undefined);
    const [insert] = adminClient.mutations();
    const payload = opArg(insert, 'insert')[0];
    assert.equal(payload.created_by, USER_ID);
    assert.equal(payload.max_attendees, 50);
  });

  test('send_event_announcement previews recipients and queues nothing until confirmed', async () => {
    const adminClient = createMockSupabase((call) => {
      if (call.table === 'events') return { data: { id: EVENT_ID, title: 'Hack Night', created_by: USER_ID }, error: null };
      if (call.table === 'event_rsvps') return { data: [{ profile_id: 'a' }, { profile_id: 'b' }], error: null };
      if (call.table === 'volunteer_signups') return { data: [{ profile_id: 'b' }, { profile_id: USER_ID }], error: null };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('organizer'), adminClient });
    const preview = await client.callTool({ name: 'send_event_announcement', arguments: { event_id: EVENT_ID, message: 'Doors open at 6' } });
    assert.equal(preview.structuredContent.requires_confirmation, true);
    assert.equal(preview.structuredContent.preview.recipients, 2, 'deduplicated, organizer excluded');
    assert.equal(adminClient.mutations().length, 0);
  });

  test('cancel_event requires confirmation before changing status', async () => {
    const adminClient = createMockSupabase((call) => (call.table === 'events'
      ? { data: { id: EVENT_ID, title: 'Hack Night', status: 'active', created_by: USER_ID, starts_at: 'x' }, error: null }
      : { data: [], error: null }));
    const { client } = await connect({ authInfo: authInfoFor('organizer'), adminClient });
    const preview = await client.callTool({ name: 'cancel_event', arguments: { event_id: EVENT_ID } });
    assert.equal(preview.structuredContent.requires_confirmation, true);
    assert.equal(adminClient.mutations().length, 0);

    await client.callTool({ name: 'cancel_event', arguments: { event_id: EVENT_ID, confirm: true } });
    const [update] = adminClient.mutations();
    assert.deepEqual(opArg(update, 'update')[0].status, 'cancelled');
  });

  test('task capacity cannot drop below existing signups', async () => {
    const adminClient = createMockSupabase((call) => {
      if (call.table === 'tasks') return { data: { id: TASK_ID, event_id: EVENT_ID, events: { created_by: USER_ID } }, error: null };
      if (call.table === 'volunteer_signups') return { count: 5, data: null, error: null };
      return { data: null, error: null };
    });
    const { client } = await connect({ authInfo: authInfoFor('organizer'), adminClient });
    const result = await client.callTool({ name: 'update_volunteer_task', arguments: { task_id: TASK_ID, volunteers_needed: 3 } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /already has 5 volunteers/);
    assert.equal(adminClient.mutations().length, 0);
  });

  test('participant data for a non-owned event is refused', async () => {
    const adminClient = createMockSupabase(() => ({ data: null, error: null }));
    const { client } = await connect({ authInfo: authInfoFor('organizer'), adminClient });
    const result = await client.callTool({ name: 'get_event_participants', arguments: { event_id: EVENT_ID } });
    assert.equal(result.isError, true);
    assert.equal(adminClient.calls.filter((c) => c.table === 'event_rsvps').length, 0, 'no participant query before ownership passes');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Token verification', () => {
  const profileClient = (role, isSuspended = false) => createMockSupabase((call) => (call.table === 'profiles'
    ? { data: { role, is_suspended: isSuspended }, error: null }
    : { data: null, error: null }));

  test('missing tokens are rejected', async () => {
    assert.equal(await verifyMcpToken(null, undefined), undefined);
  });

  test('session tokens without an OAuth client_id are rejected before calling Supabase', async () => {
    const anonClient = createMockSupabase(() => null, { user: { id: USER_ID } });
    let called = false;
    anonClient.auth.getUser = async () => { called = true; return { data: { user: { id: USER_ID } }, error: null }; };
    const token = fakeJwt({ sub: USER_ID, role: 'authenticated' });
    assert.equal(await verifyMcpToken(null, token, { anonClient, adminClient: profileClient('student') }), undefined);
    assert.equal(called, false);
  });

  test('tokens Supabase rejects are refused', async () => {
    const anonClient = createMockSupabase();
    const token = fakeJwt({ sub: USER_ID, client_id: 'c1' });
    // Mock getUser returns an error when no user is configured.
    assert.equal(await verifyMcpToken(null, token, { anonClient, adminClient: profileClient('student') }), undefined);
  });

  test('role comes from the profiles table, not token claims', async () => {
    const anonClient = createMockSupabase(() => null, { user: { id: USER_ID, email: 'me@campus.edu' } });
    const token = fakeJwt({ sub: USER_ID, client_id: 'c1', exp: 9999999999, user_metadata: { role: 'admin' }, app_role: 'admin' });
    const info = await verifyMcpToken(null, token, { anonClient, adminClient: profileClient('student') });
    assert.equal(info.extra.userId, USER_ID);
    assert.equal(info.extra.role, 'student');
    assert.equal(info.clientId, 'c1');
    assert.equal(info.expiresAt, 9999999999);
  });

  test('a token whose subject does not match the verified user is refused', async () => {
    const anonClient = createMockSupabase(() => null, { user: { id: OTHER_USER_ID } });
    const token = fakeJwt({ sub: USER_ID, client_id: 'c1' });
    assert.equal(await verifyMcpToken(null, token, { anonClient, adminClient: profileClient('student') }), undefined);
  });

  test('suspension is carried into the auth context', async () => {
    const anonClient = createMockSupabase(() => null, { user: { id: USER_ID } });
    const token = fakeJwt({ sub: USER_ID, client_id: 'c1' });
    const info = await verifyMcpToken(null, token, { anonClient, adminClient: profileClient('organizer', true) });
    assert.equal(info.extra.isSuspended, true);
  });
});
