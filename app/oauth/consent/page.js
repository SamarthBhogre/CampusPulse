'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ShieldCheck } from 'lucide-react';

/**
 * OAuth 2.1 consent screen for Supabase Auth's OAuth server. Supabase sends
 * MCP clients here (configure the authorization path as /oauth/consent); the
 * signed-in user approves or denies access, and Supabase redirects back to the
 * client with an authorization code.
 */

const AUTH_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;

async function authRequest(path, accessToken, init = {}) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.msg || body.error_description || body.message || 'The authorization request could not be processed.');
  return body;
}

function ConsentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();
  const authorizationId = searchParams.get('authorization_id');
  const [details, setDetails] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!authorizationId) { setError('This authorization link is missing its request id.'); return; }
    const { data: { session: current } } = await supabase.auth.getSession();
    if (!current) {
      const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
      router.replace(`/auth/sign-in?next=${encodeURIComponent(next)}`);
      return;
    }
    setSession(current);
    try {
      const data = await authRequest(`/oauth/authorizations/${encodeURIComponent(authorizationId)}`, current.access_token);
      // Already approved earlier: Supabase returns the redirect directly.
      if (data.redirect_url) { window.location.assign(data.redirect_url); return; }
      setDetails(data);
    } catch (err) {
      setError(err.message);
    }
  }, [authorizationId, router, supabase]);

  useEffect(() => { load(); }, [load]);

  async function decide(action) {
    setBusy(true);
    try {
      const data = await authRequest(`/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, session.access_token, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (!data.redirect_url) throw new Error('No redirect was returned for this request.');
      window.location.assign(data.redirect_url);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const clientName = details?.client?.name || 'An application';
  const scopes = (details?.scope || '').split(' ').filter(Boolean);

  return (
    <div className="container max-w-md py-10 sm:py-20 animate-in-up">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {details ? `Allow ${clientName} to use Campus Pulse?` : 'Authorize application'}
          </CardTitle>
          {details && (
            <CardDescription>
              Signed in as {details.user?.email}. {details.client?.uri && <>Requested by <span className="font-medium">{details.client.uri}</span>.</>}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          ) : !details ? (
            <p className="text-sm text-muted-foreground">Loading authorization request…</p>
          ) : (
            <>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>It will be able to act as you in Campus Pulse, within your account&apos;s permissions:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Find events and volunteer tasks, including club-only events you can see</li>
                  <li>Register you for events and volunteer tasks, and cancel them after asking you</li>
                  <li>Read and update your display name and username</li>
                  <li>If you are an organizer: manage your events, see their participants, and send announcements after asking you</li>
                </ul>
                {scopes.length > 0 && <p className="text-xs">Requested scopes: {scopes.join(', ')}</p>}
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide('approve')}>Allow</Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide('deny')}>Deny</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<div className="container py-16 text-center text-muted-foreground">Loading...</div>}>
      <ConsentInner />
    </Suspense>
  );
}
