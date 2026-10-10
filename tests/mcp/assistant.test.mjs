/**
 * In-app assistant tests: Gemini is mocked; tools run for real against mocked
 * Supabase clients. Run with: npm run test:mcp
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAssistantTurn, confirmAction, toFunctionDeclarations } from '@/lib/assistant/run';
import { toGeminiSchema, GeminiError } from '@/lib/assistant/gemini';
import { toClaudeMessages, ClaudeError } from '@/lib/assistant/claude';
import { createMockSupabase } from './mock-supabase.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

const authInfoFor = (role) => ({ token: '', clientId: 'web', scopes: [], extra: { userId: USER_ID, email: 'me@campus.edu', role, isSuspended: false } });

/** Fake Gemini endpoint: returns scripted model turns and records each request body. */
function fakeGemini(turns) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const next = turns.shift();
    if (next?.status) return { ok: false, status: next.status, json: async () => ({ error: { message: 'quota' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { role: 'model', parts: next } }] }) };
  };
  return { fetchImpl, requests };
}

const registrationRow = { data: { id: 'rsvp-1', created_at: 'now', events: { id: EVENT_ID, title: 'Hack Night' } }, error: null };

describe('Assistant tool declarations', () => {
  test('confirm is never exposed to the model and schemas use Gemini types', async () => {
    const [decl] = toFunctionDeclarations([{
      name: 'cancel_event_registration',
      description: 'Cancel',
      inputSchema: {
        type: 'object',
        properties: { event_id: { type: 'string', format: 'uuid' }, confirm: { type: 'boolean' }, note: { type: ['string', 'null'] } },
        required: ['event_id', 'confirm'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
    }]);
    assert.equal(decl.parameters.properties.confirm, undefined);
    assert.deepEqual(decl.parameters.required, ['event_id']);
    assert.equal(decl.parameters.type, 'OBJECT');
    assert.equal(decl.parameters.properties.note.nullable, true);
    assert.equal(decl.parameters.additionalProperties, undefined);
  });

  test('toGeminiSchema handles enums, arrays, and anyOf-null', () => {
    const out = toGeminiSchema({ anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }], description: 'x' });
    assert.deepEqual(out, { type: 'STRING', description: 'x', nullable: true, enum: ['a', 'b'] });
    assert.equal(toGeminiSchema({ type: 'array', items: { type: 'integer' } }).items.type, 'INTEGER');
  });
});

describe('Assistant turns', () => {
  test('runs a tool the model calls and returns the final answer', async () => {
    const userClient = createMockSupabase((call) => (call.table === 'event_rsvps'
      ? { data: [{ id: 'r1', created_at: 'now', events: { id: EVENT_ID, title: 'Hack Night', starts_at: '2099-01-01T10:00:00Z', ends_at: null, clubs: null } }], error: null }
      : { data: null, error: null }));
    const gemini = fakeGemini([
      [{ functionCall: { name: 'get_my_registrations', args: {} } }],
      [{ text: 'You are registered for Hack Night.' }],
    ]);

    const result = await runAssistantTurn({
      authInfo: authInfoFor('student'), deps: { userClient, adminClient: createMockSupabase() },
      message: 'what am I registered for?', apiKey: 'k', model: 'm', fetchImpl: gemini.fetchImpl,
    });

    assert.equal(result.reply, 'You are registered for Hack Night.');
    assert.deepEqual(result.toolsUsed, ['get_my_registrations']);
    assert.equal(gemini.requests[0].headers['x-goog-api-key'], 'k');
    const toolTurn = gemini.requests[1].body.contents.at(-1);
    assert.equal(toolTurn.parts[0].functionResponse.name, 'get_my_registrations');
    assert.equal(toolTurn.parts[0].functionResponse.response.registrations[0].event.title, 'Hack Night');
  });

  test('the model cannot confirm a cancellation itself; it becomes a pending action', async () => {
    const userClient = createMockSupabase((call) => (call.table === 'event_rsvps' ? registrationRow : { data: null, error: null }));
    const gemini = fakeGemini([
      [{ functionCall: { name: 'cancel_event_registration', args: { event_id: EVENT_ID, confirm: true } } }],
      [{ text: 'Press Confirm to cancel.' }],
    ]);

    const result = await runAssistantTurn({
      authInfo: authInfoFor('student'), deps: { userClient, adminClient: createMockSupabase() },
      message: 'cancel my hack night rsvp', apiKey: 'k', model: 'm', fetchImpl: gemini.fetchImpl,
    });

    assert.equal(userClient.mutations().length, 0, 'nothing deleted without the user clicking Confirm');
    assert.equal(result.pendingActions.length, 1);
    assert.equal(result.pendingActions[0].tool, 'cancel_event_registration');
    assert.deepEqual(result.pendingActions[0].arguments, { event_id: EVENT_ID });
  });

  test('students are not offered organizer tools', async () => {
    const gemini = fakeGemini([[{ text: 'hi' }]]);
    await runAssistantTurn({
      authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient: createMockSupabase() },
      message: 'hello', apiKey: 'k', model: 'm', fetchImpl: gemini.fetchImpl,
    });
    const names = gemini.requests[0].body.tools[0].functionDeclarations.map((d) => d.name);
    assert.ok(names.includes('register_for_event'));
    assert.ok(!names.includes('create_event'));
    assert.ok(!names.includes('moderate_event'));
  });

  test('Gemini rate limits surface as GeminiError 429', async () => {
    const gemini = fakeGemini([{ status: 429 }]);
    await assert.rejects(
      runAssistantTurn({
        authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient: createMockSupabase() },
        message: 'hello', apiKey: 'k', model: 'm', fetchImpl: gemini.fetchImpl,
      }),
      (error) => error instanceof GeminiError && error.status === 429,
    );
  });
});

/** Fake Anthropic endpoint (behind the official SDK): scripted content blocks, recorded requests. */
function fakeClaude(turns) {
  const requests = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) });
    const next = turns.shift();
    if (next?.status) return json(next.status, { type: 'error', error: { type: 'api_error', message: 'busy' } });
    return json(200, {
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
      content: next, stop_reason: next.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  return { fetchImpl, requests };
}

describe('Claude provider', () => {
  test('runs a tool the model calls and sends a matching tool_result', async () => {
    const userClient = createMockSupabase((call) => (call.table === 'event_rsvps'
      ? { data: [{ id: 'r1', created_at: 'now', events: { id: EVENT_ID, title: 'Hack Night', starts_at: '2099-01-01T10:00:00Z', ends_at: null, clubs: null } }], error: null }
      : { data: null, error: null }));
    const claude = fakeClaude([
      [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'toolu_abc', name: 'get_my_registrations', input: {} }],
      [{ type: 'text', text: 'You are registered for Hack Night.' }],
    ]);

    const result = await runAssistantTurn({
      authInfo: authInfoFor('student'), deps: { userClient, adminClient: createMockSupabase() },
      message: 'what am I registered for?', apiKey: 'k', provider: 'claude', fetchImpl: claude.fetchImpl,
    });

    assert.equal(result.reply, 'You are registered for Hack Night.');
    assert.deepEqual(result.toolsUsed, ['get_my_registrations']);
    assert.ok(claude.requests[0].url.startsWith('https://api.anthropic.com/v1/messages'));
    assert.equal(claude.requests[0].headers.get('x-api-key'), 'k');
    assert.equal(claude.requests[0].body.model, 'claude-opus-5-5');
    assert.deepEqual(claude.requests[0].body.fallbacks, 'default');
    assert.match(claude.requests[0].headers.get('anthropic-beta') || '', /server-side-fallback-2026-07-01/);
    const [assistantTurn, toolTurn] = claude.requests[1].body.messages.slice(-2);
    const toolUse = assistantTurn.content.find((b) => b.type === 'tool_use');
    assert.equal(toolUse.id, 'toolu_abc');
    assert.equal(assistantTurn.content[0].type, 'thinking', 'thinking blocks are replayed unchanged');
    assert.equal(toolTurn.content[0].type, 'tool_result');
    assert.equal(toolTurn.content[0].tool_use_id, toolUse.id);
    assert.equal(JSON.parse(toolTurn.content[0].content).registrations[0].event.title, 'Hack Night');
  });

  test('confirm is never exposed to Claude and still needs the user click', async () => {
    const userClient = createMockSupabase((call) => (call.table === 'event_rsvps' ? registrationRow : { data: null, error: null }));
    const claude = fakeClaude([
      [{ type: 'tool_use', id: 't1', name: 'cancel_event_registration', input: { event_id: EVENT_ID, confirm: true } }],
      [{ type: 'text', text: 'Press Confirm to cancel.' }],
    ]);

    const result = await runAssistantTurn({
      authInfo: authInfoFor('student'), deps: { userClient, adminClient: createMockSupabase() },
      message: 'cancel my hack night rsvp', apiKey: 'k', provider: 'claude', fetchImpl: claude.fetchImpl,
    });

    const declared = claude.requests[0].body.tools.find((t) => t.name === 'cancel_event_registration');
    assert.equal(declared.input_schema.properties.confirm, undefined);
    assert.equal(declared.input_schema.$schema, undefined);
    assert.equal(userClient.mutations().length, 0);
    assert.equal(result.pendingActions.length, 1);
    assert.deepEqual(result.pendingActions[0].arguments, { event_id: EVENT_ID });
  });

  test('students are not offered organizer tools', async () => {
    const claude = fakeClaude([[{ type: 'text', text: 'hi' }]]);
    await runAssistantTurn({
      authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient: createMockSupabase() },
      message: 'hello', apiKey: 'k', provider: 'claude', fetchImpl: claude.fetchImpl,
    });
    const names = claude.requests[0].body.tools.map((t) => t.name);
    assert.ok(names.includes('register_for_event'));
    assert.ok(!names.includes('create_event'));
  });

  test('overloaded (529) maps to 503 and rate limits stay 429', async () => {
    for (const [upstream, expected] of [[529, 503], [429, 429]]) {
      const claude = fakeClaude([{ status: upstream }]);
      await assert.rejects(
        runAssistantTurn({
          authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient: createMockSupabase() },
          message: 'hello', apiKey: 'k', provider: 'claude', fetchImpl: claude.fetchImpl,
        }),
        (error) => error instanceof ClaudeError && error instanceof GeminiError && error.status === expected,
      );
    }
  });

  test('history is trimmed to start with a user turn and blank text is dropped', () => {
    const messages = toClaudeMessages([
      { role: 'model', parts: [{ text: 'old reply' }] },
      { role: 'user', parts: [{ text: '   ' }] },
      { role: 'user', parts: [{ text: 'hello' }] },
    ]);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { role: 'user', content: [{ type: 'text', text: 'hello' }] });
  });
});

describe('Claude time limits', () => {
  test('a Claude call that never answers becomes a 504', async () => {
    const neverAnswers = (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    const started = Date.now();
    await assert.rejects(
      runAssistantTurn({
        authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient: createMockSupabase() },
        message: 'hello', apiKey: 'k', provider: 'claude', fetchImpl: neverAnswers, budgetMs: 4_000,
      }),
      (error) => error instanceof ClaudeError && error.status === 504,
    );
    assert.ok(Date.now() - started < 6_000);
  });
});

describe('Time limits', () => {
  test('a Gemini call that never answers becomes a 504 instead of hanging the function', async () => {
    const neverAnswers = (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    const started = Date.now();
    await assert.rejects(
      runAssistantTurn({
        authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient: createMockSupabase() },
        message: 'hello', apiKey: 'k', model: 'm', fetchImpl: neverAnswers, budgetMs: 4_000,
      }),
      (error) => error instanceof GeminiError && error.status === 504,
    );
    assert.ok(Date.now() - started < 6_000, 'gives up within the turn budget');
  });
});

describe('Confirming actions', () => {
  test('a confirmed cancellation deletes only the caller\'s registration', async () => {
    const userClient = createMockSupabase((call) => (call.table === 'event_rsvps'
      ? { data: [{ id: 'rsvp-1' }], error: null }
      : { data: null, error: null }));
    const result = await confirmAction({
      authInfo: authInfoFor('student'), deps: { userClient, adminClient: createMockSupabase() },
      tool: 'cancel_event_registration', args: { event_id: EVENT_ID },
    });
    assert.equal(result.ok, true);
    const [del] = userClient.mutations();
    assert.ok(del.ops.some(([op, col, val]) => op === 'eq' && col === 'profile_id' && val === USER_ID));
  });

  test('only tools with a confirmation step can be confirmed', async () => {
    const userClient = createMockSupabase();
    const result = await confirmAction({
      authInfo: authInfoFor('student'), deps: { userClient, adminClient: createMockSupabase() },
      tool: 'register_for_event', args: { event_id: EVENT_ID },
    });
    assert.equal(result.ok, false);
    assert.equal(userClient.calls.length, 0);
  });

  test('students cannot confirm organizer actions', async () => {
    const adminClient = createMockSupabase();
    const result = await confirmAction({
      authInfo: authInfoFor('student'), deps: { userClient: createMockSupabase(), adminClient },
      tool: 'cancel_event', args: { event_id: EVENT_ID },
    });
    assert.equal(result.ok, false);
    assert.equal(adminClient.mutations().length, 0);
  });
});
