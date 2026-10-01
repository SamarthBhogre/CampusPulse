/**
 * Structured server-side logger for CampusPulse.
 * Outputs JSON-structured logs to stdout. Never logs passwords, tokens, or secrets.
 * In development, outputs human-readable format for readability.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const blocked = new Set(['password', 'token', 'secret', 'authorization', 'cookie', 'key', 'apikey', 'api_key']);
  const clean = {};
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = sanitizeMeta(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function formatError(err) {
  if (!err) return undefined;
  return {
    message: err.message,
    code: err.code,
    // Never include full stack in production logs to avoid leaking internals
    ...(IS_PROD ? {} : { stack: err.stack }),
  };
}

function log(level, message, error, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(error ? { error: formatError(error) } : {}),
    ...(meta ? { meta: sanitizeMeta(meta) } : {}),
  };

  if (IS_PROD) {
    // Structured JSON for log aggregators
    const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    output(JSON.stringify(entry));
  } else {
    // Human-readable for development
    const parts = [`[${level.toUpperCase()}]`, message];
    if (error) parts.push(`→ ${error.message || error}`);
    if (meta) parts.push(JSON.stringify(sanitizeMeta(meta)));
    const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    output(...parts);
  }
}

export const logger = {
  /** Log informational message with optional metadata */
  info(message, meta) {
    log('info', message, null, meta);
  },
  /** Log warning with optional metadata */
  warn(message, meta) {
    log('warn', message, null, meta);
  },
  /** Log error with the original Error object and optional metadata */
  error(message, error, meta) {
    log('error', message, error instanceof Error ? error : new Error(String(error?.message || error)), meta);
  },
};
