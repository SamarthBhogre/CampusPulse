import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * MCP authentication.
 *
 * MCP clients obtain access tokens from Supabase Auth's OAuth 2.1 server
 * (see /oauth/consent). Every request's bearer token is verified with Supabase
 * Auth; identity and role come only from the verified token and the profiles
 * table, never from tool arguments.
 */

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function getSupabaseAuthIssuer() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')}/auth/v1`;
}

/** Client with no user: RLS applies as the `anon` role (public data only). */
export function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions);
}

/** Client acting as the token's user, so RLS policies and RPC auth.uid() checks apply. */
export function createUserClient(accessToken) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Reads JWT claims without trusting them; the token is verified separately by Supabase Auth. */
export function decodeJwtClaims(token) {
  try {
    const [, payload] = String(token).split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * verifyToken callback for mcp-handler's withMcpAuth. Returns AuthInfo for a
 * valid OAuth access token, or undefined (which produces a 401 challenge).
 *
 * Only tokens issued to an OAuth client (carrying a `client_id` claim) are
 * accepted, so ordinary browser session tokens cannot be replayed here.
 */
export async function verifyMcpToken(_req, bearerToken, deps = {}) {
  if (!bearerToken) return undefined;

  const claims = decodeJwtClaims(bearerToken);
  if (!claims?.client_id || !claims.sub) return undefined;

  const anon = deps.anonClient || createAnonClient();
  const { data, error } = await anon.auth.getUser(bearerToken);
  const user = data?.user;
  if (error || !user || user.id !== claims.sub) return undefined;

  const admin = deps.adminClient || getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    logger.error('MCP profile lookup failed', profileError, { userId: user.id });
    throw new Error('Could not verify account');
  }

  return {
    token: bearerToken,
    clientId: claims.client_id,
    scopes: typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [],
    expiresAt: typeof claims.exp === 'number' ? claims.exp : undefined,
    extra: {
      userId: user.id,
      email: user.email,
      role: profile?.role || 'student',
      isSuspended: profile?.is_suspended === true,
    },
  };
}

/** Builds the per-request service context from verified AuthInfo. */
export function buildAuthContext(authInfo, deps = {}) {
  const { userId, email, role, isSuspended } = authInfo.extra;
  return {
    user: { id: userId, email },
    profile: { role },
    isSuspended,
    db: deps.userClient || createUserClient(authInfo.token),
    admin: deps.adminClient || getSupabaseAdminClient(),
  };
}
