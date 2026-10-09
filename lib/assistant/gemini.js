/**
 * Minimal Gemini API client (generateContent with function calling).
 * Server-only: the API key never reaches the browser.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const TYPE_MAP = { string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', object: 'OBJECT', array: 'ARRAY' };

/**
 * Converts a tool's JSON Schema into the OpenAPI subset Gemini's
 * `parameters` field accepts (drops $schema, additionalProperties, etc.).
 */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;

  // ["string","null"] or anyOf [X, {type:"null"}] → X with nullable
  let source = schema;
  let nullable = false;
  if (Array.isArray(source.type)) {
    const types = source.type.filter((t) => t !== 'null');
    nullable = types.length !== source.type.length;
    source = { ...source, type: types[0] };
  }
  const variants = source.anyOf || source.oneOf;
  if (variants) {
    const nonNull = variants.filter((v) => v.type !== 'null');
    nullable = nullable || nonNull.length !== variants.length;
    if (nonNull.length === 1) source = { ...nonNull[0], description: source.description || nonNull[0].description };
  }

  const out = {};
  if (source.type && TYPE_MAP[source.type]) out.type = TYPE_MAP[source.type];
  if (source.description) out.description = source.description;
  if (nullable) out.nullable = true;
  if (Array.isArray(source.enum)) out.enum = source.enum.map(String);
  if (typeof source.minimum === 'number') out.minimum = source.minimum;
  if (typeof source.maximum === 'number') out.maximum = source.maximum;
  if (typeof source.minLength === 'number') out.minLength = String(source.minLength);
  if (typeof source.maxLength === 'number') out.maxLength = String(source.maxLength);
  if (source.format === 'date-time') out.format = 'date-time';
  if (source.items) out.items = toGeminiSchema(source.items);
  if (source.properties) {
    out.type = 'OBJECT';
    out.properties = Object.fromEntries(
      Object.entries(source.properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
    if (Array.isArray(source.required) && source.required.length) out.required = source.required;
  }
  if (!out.type) out.type = 'STRING';
  return out;
}

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Calls generateContent and returns the first candidate's content ({ role, parts }). */
export async function generateContent({ apiKey, model, systemInstruction, contents, functionDeclarations, fetchImpl = fetch, timeoutMs = 25_000 }) {
  let res;
  try {
    res = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined,
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.3 },
      }),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new GeminiError('Gemini took too long to respond', 504);
    }
    throw new GeminiError(`Could not reach Gemini: ${error?.message || 'network error'}`, 502);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GeminiError(body?.error?.message || `Gemini request failed (${res.status})`, res.status);
  }
  const content = body?.candidates?.[0]?.content;
  if (!content?.parts) {
    const reason = body?.candidates?.[0]?.finishReason || body?.promptFeedback?.blockReason || 'no content';
    throw new GeminiError(`Gemini returned no answer (${reason})`, 502);
  }
  return { role: 'model', parts: content.parts };
}
