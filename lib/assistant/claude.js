/**
 * Claude client for the in-app assistant, built on the official Anthropic SDK.
 * Server-only: the API key never reaches the browser.
 *
 * run.js keeps its conversation in Gemini's `contents` shape. This adapter
 * translates that to Anthropic messages and returns a Gemini-shaped model turn
 * ({ role: 'model', parts }) so the tool loop is identical for both providers.
 * The model's raw content blocks ride along as `claudeContent` and are replayed
 * verbatim, so thinking blocks stay intact across the tool loop.
 */
import Anthropic from '@anthropic-ai/sdk';
import { GeminiError } from '@/lib/assistant/gemini';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 8_000;

/** Same class hierarchy as Gemini errors so the route's error handling applies unchanged. */
export class ClaudeError extends GeminiError {}

/**
 * Converts Gemini-shaped `contents` into Anthropic messages. Model turns that
 * carry `claudeContent` are replayed exactly as Claude returned them.
 */
export function toClaudeMessages(contents) {
  const messages = [];
  let pendingIds = [];
  let counter = 0;

  for (const item of contents) {
    if (item.role === 'model') {
      let blocks;
      if (Array.isArray(item.claudeContent) && item.claudeContent.length) {
        blocks = item.claudeContent;
        pendingIds = blocks.filter((b) => b.type === 'tool_use').map((b) => b.id);
      } else {
        blocks = [];
        pendingIds = [];
        for (const part of item.parts || []) {
          if (part.functionCall) {
            counter += 1;
            const id = `toolu_${counter}`;
            pendingIds.push(id);
            blocks.push({ type: 'tool_use', id, name: part.functionCall.name, input: part.functionCall.args || {} });
          } else if (typeof part.text === 'string' && part.text.trim()) {
            blocks.push({ type: 'text', text: part.text });
          }
        }
      }
      if (blocks.length) messages.push({ role: 'assistant', content: blocks });
    } else {
      const blocks = [];
      let responseIndex = 0;
      for (const part of item.parts || []) {
        if (part.functionResponse) {
          const response = part.functionResponse.response ?? {};
          blocks.push({
            type: 'tool_result',
            tool_use_id: pendingIds[responseIndex] || `toolu_${counter}`,
            content: JSON.stringify(response),
            ...(response.error && { is_error: true }),
          });
          responseIndex += 1;
        } else if (typeof part.text === 'string' && part.text.trim()) {
          blocks.push({ type: 'text', text: part.text });
        }
      }
      if (blocks.length) messages.push({ role: 'user', content: blocks });
    }
  }

  // The conversation must open with a user turn (history is trimmed mid-chat).
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}

/** Maps SDK errors onto the statuses the assistant route already understands. */
function toClaudeError(error) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ClaudeError('Claude took too long to respond', 504);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ClaudeError(`Could not reach Claude: ${error.message || 'network error'}`, 502);
  }
  if (error instanceof Anthropic.APIError) {
    // 529 is Anthropic's "overloaded"; the route treats 503 as "busy, retry".
    const status = error.status === 529 ? 503 : (error.status || 502);
    return new ClaudeError(error.message || `Claude request failed (${error.status})`, status);
  }
  return new ClaudeError(`Claude request failed: ${error?.message || 'unknown error'}`, 502);
}

/** Calls the Messages API and returns the model turn as { role: 'model', parts, claudeContent }. */
export async function generateClaude({ apiKey, model, systemInstruction, contents, tools = [], fetchImpl, timeoutMs = 25_000 }) {
  const client = new Anthropic({ apiKey, maxRetries: 0, ...(fetchImpl && { fetch: fetchImpl }) });

  // Server-side refusal fallback is opt-in; Haiku has no server-side fallback.
  const withFallbacks = /^claude-(opus|sonnet|fable)/.test(model);

  let response;
  try {
    response = await client.beta.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: systemInstruction,
        messages: toClaudeMessages(contents),
        ...(tools.length && { tools, tool_choice: { type: 'auto' } }),
        ...(withFallbacks && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      },
      { timeout: Math.max(1_000, timeoutMs) },
    );
  } catch (error) {
    throw toClaudeError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new ClaudeError(`Claude declined this request (${response.stop_details?.category || 'refusal'})`, 502);
  }

  const parts = [];
  for (const block of response.content || []) {
    if (block.type === 'text' && block.text) parts.push({ text: block.text });
    else if (block.type === 'tool_use') parts.push({ functionCall: { name: block.name, args: block.input || {} } });
  }
  if (!parts.length) {
    throw new ClaudeError(`Claude returned no answer (${response.stop_reason || 'no content'})`, 502);
  }
  return { role: 'model', parts, claudeContent: response.content };
}
