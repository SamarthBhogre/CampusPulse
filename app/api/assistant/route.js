import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { runAssistantTurn, confirmAction, ASSISTANT_LIMITS } from '@/lib/assistant/run';
import { DEFAULT_GEMINI_MODEL, GeminiError } from '@/lib/assistant/gemini';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

const requestSchema = z.union([
  z.object({
    message: z.string().trim().min(1, 'Type a message').max(ASSISTANT_LIMITS.MAX_TEXT),
    history: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      text: z.string().max(ASSISTANT_LIMITS.MAX_TEXT * 4),
    })).max(100).default([]),
  }),
  z.object({
    confirm: z.object({
      tool: z.string().max(64),
      arguments: z.record(z.unknown()).default({}),
    }),
  }),
]);

/**
 * POST /api/assistant — chat with the CampusPulse assistant.
 *   { message, history }        → { reply, pendingActions }
 *   { confirm: { tool, arguments } } → runs a previewed action the user approved
 * Identity comes from the Supabase session cookie; tools run with the user's
 * RLS-scoped client and the same role gating as the MCP server.
 */
export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Please sign in to use the assistant.' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('full_name, role, is_suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    logger.error('Assistant profile lookup failed', profileError, { userId: user.id });
    return NextResponse.json({ error: 'Could not verify your account.' }, { status: 500 });
  }
  if (profile?.is_suspended) return NextResponse.json({ error: 'Your account is suspended.' }, { status: 403 });

  const authInfo = {
    token: '',
    clientId: 'campus-pulse-web',
    scopes: [],
    extra: { userId: user.id, email: user.email, role: profile?.role || 'student', isSuspended: false },
  };
  const deps = { userClient: supabase, adminClient: admin };

  try {
    if (parsed.data.confirm) {
      const result = await confirmAction({ authInfo, deps, tool: parsed.data.confirm.tool, args: parsed.data.confirm.arguments });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'The assistant is not configured yet.' }, { status: 503 });

    const result = await runAssistantTurn({
      authInfo,
      deps,
      history: parsed.data.history,
      message: parsed.data.message,
      user: { name: profile?.full_name },
      apiKey,
      model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GeminiError) {
      logger.warn('Assistant Gemini error', { userId: user.id, status: error.status, error: error.message });
      const message = error.status === 429 || error.status === 503
        ? 'The assistant is getting a lot of requests right now. Please try again in a minute.'
        : error.status === 504
        ? 'The assistant took too long to answer. Please try again or ask something simpler.'
        : 'The assistant could not answer right now. Please try again.';
      const status = [429, 503, 504].includes(error.status) ? error.status : 502;
      return NextResponse.json({ error: message }, { status });
    }
    logger.error('Assistant request failed', error, { userId: user.id });
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
