import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerCampusPulseTools } from '@/lib/mcp/tools';
import { generateContent, toGeminiSchema, DEFAULT_GEMINI_MODEL, GeminiError } from '@/lib/assistant/gemini';

/**
 * In-app assistant: Gemini + the CampusPulse MCP tools, run in-process for the
 * signed-in user. Tool permissions are exactly the MCP server's (same
 * registration, same role checks, same RLS-scoped client).
 *
 * Confirmation: the model can never set `confirm`. When a tool returns a
 * confirmation preview, it is surfaced to the browser as a pending action and
 * only runs when the user clicks Confirm (see confirmAction).
 */

const MAX_TOOL_ROUNDS = 6;
// Stay well inside Vercel's 60s function limit, leaving time to respond.
const TURN_BUDGET_MS = 45_000;
const MAX_HISTORY = 20;
const MAX_TEXT = 2000;

export const ASSISTANT_LIMITS = { MAX_HISTORY, MAX_TEXT };

/** Connects an MCP client to a fresh in-process CampusPulse server for this user. */
export async function connectTools({ authInfo, deps }) {
  const server = new McpServer({ name: 'campus-pulse-assistant', version: '1.0.0' });
  registerCampusPulseTools(server, { authInfo, deps });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'campus-pulse-web', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Gemini declarations for the user's tools, with `confirm` removed so the model cannot pass it. */
export function toFunctionDeclarations(tools) {
  return tools.map((tool) => {
    const schema = structuredClone(tool.inputSchema || { type: 'object', properties: {} });
    if (schema.properties?.confirm) {
      delete schema.properties.confirm;
      if (Array.isArray(schema.required)) schema.required = schema.required.filter((key) => key !== 'confirm');
    }
    const parameters = Object.keys(schema.properties || {}).length ? toGeminiSchema(schema) : undefined;
    // In the app, approval happens through the Confirm button, not a `confirm` argument.
    const description = (tool.description || tool.title || tool.name)
      .replace(/[^.]*\brequires? confirm: true[^.]*\./gi, ' The app will show the user a preview to approve.')
      .replace(/\s+/g, ' ')
      .trim();
    return { name: tool.name, description, ...(parameters && { parameters }) };
  });
}

export function confirmableToolNames(tools) {
  return new Set(tools.filter((t) => t.inputSchema?.properties?.confirm).map((t) => t.name));
}

function systemPrompt({ name, role, now }) {
  return [
    'You are the CampusPulse assistant, built into the CampusPulse website for campus events and volunteering.',
    `The signed-in user is ${name || 'a CampusPulse user'} (role: ${role}). Current date-time: ${now} (Asia/Kolkata).`,
    'Use the tools to answer; never invent events, tasks, ids, counts, or dates. Look up ids with search tools before acting.',
    'Some actions (cancelling, sending announcements, updating or cancelling events) need the user to approve them: when a tool returns requires_confirmation, briefly summarize the preview and tell the user to press Confirm on the card shown below your message. Never claim such an action is done.',
    'You can only act for the signed-in user. If asked to do something their role does not allow, say so.',
    'Be concise and friendly. Format dates in a readable way.',
    'Reply in plain text only — the chat window does not render Markdown, so never use asterisks, #, or backticks. For lists, start each line with "• ".',
  ].join('\n');
}

function toContents(history, message) {
  const contents = history.slice(-MAX_HISTORY).map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(item.text).slice(0, MAX_TEXT) }],
  }));
  contents.push({ role: 'user', parts: [{ text: message.slice(0, MAX_TEXT) }] });
  return contents;
}

function toolResultPayload(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = (result.content || []).map((c) => c.text).filter(Boolean).join('\n');
  return result.isError ? { error: text || 'Tool failed' } : { result: text };
}

/**
 * Runs one assistant turn.
 * @returns {{ reply: string, pendingActions: Array, toolsUsed: string[] }}
 */
export async function runAssistantTurn({ authInfo, deps, history = [], message, user, apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl, now = new Date(), budgetMs = TURN_BUDGET_MS }) {
  const deadline = Date.now() + budgetMs;
  const client = await connectTools({ authInfo, deps });
  try {
    const { tools } = await client.listTools();
    const functionDeclarations = toFunctionDeclarations(tools);
    const contents = toContents(history, message);
    const systemInstruction = systemPrompt({
      name: user?.name,
      role: authInfo.extra.role,
      now: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }),
    });
    const pendingActions = [];
    const toolsUsed = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 3_000) throw new GeminiError('The assistant ran out of time', 504);
      const modelContent = await generateContent({
        apiKey, model, systemInstruction, contents, functionDeclarations, fetchImpl,
        timeoutMs: Math.min(25_000, remaining),
      });
      // Keep the model turn exactly as returned (including any thought signatures).
      contents.push(modelContent);

      const calls = modelContent.parts.filter((part) => part.functionCall).map((part) => part.functionCall);
      if (calls.length === 0) {
        const reply = modelContent.parts.map((part) => part.text).filter(Boolean).join('').trim();
        return { reply: reply || 'Sorry, I could not come up with an answer.', pendingActions, toolsUsed };
      }

      const responses = [];
      for (const call of calls) {
        // Strip `confirm`: consequential actions only run from the user's Confirm click.
        const { confirm: _ignored, ...args } = call.args || {};
        toolsUsed.push(call.name);
        const result = await client.callTool({ name: call.name, arguments: args });
        const payload = toolResultPayload(result);
        if (payload?.requires_confirmation) {
          pendingActions.push({ tool: call.name, arguments: args, preview: payload.preview });
        }
        responses.push({ functionResponse: { name: call.name, response: payload } });
      }
      contents.push({ role: 'user', parts: responses });
    }

    return {
      reply: 'That took more steps than I can handle at once. Could you narrow the request down?',
      pendingActions,
      toolsUsed,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Runs a previewed action after the user pressed Confirm. Only tools that
 * have a confirmation step can be confirmed, and the tool still enforces the
 * caller's permissions and ownership.
 */
export async function confirmAction({ authInfo, deps, tool, args }) {
  const client = await connectTools({ authInfo, deps });
  try {
    const { tools } = await client.listTools();
    if (!confirmableToolNames(tools).has(tool)) {
      return { ok: false, message: 'That action cannot be confirmed.' };
    }
    const result = await client.callTool({ name: tool, arguments: { ...(args || {}), confirm: true } });
    const payload = toolResultPayload(result);
    if (result.isError) return { ok: false, message: payload.error || 'The action failed.' };
    return { ok: true, message: describeConfirmed(tool, payload), result: payload };
  } finally {
    await client.close().catch(() => {});
  }
}

function describeConfirmed(tool, payload) {
  switch (tool) {
    case 'cancel_event_registration': return 'Your registration has been cancelled.';
    case 'cancel_volunteer_signup': return 'You have been removed from that volunteer task.';
    case 'update_event': return `Event updated${payload.notified ? ` and ${payload.notified} participant(s) notified` : ''}.`;
    case 'cancel_event': return `Event cancelled${payload.notified ? ` and ${payload.notified} participant(s) notified` : ''}.`;
    case 'send_event_announcement': return payload.sent ? `Announcement sent to ${payload.sent} participant(s).` : (payload.message || 'There was nobody to notify.');
    case 'moderate_event': return `Event is now ${payload.event?.status || 'updated'}.`;
    default: return 'Done.';
  }
}
