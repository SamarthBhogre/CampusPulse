import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getSafeNext(searchParams) {
  const requestedNext = searchParams.get('next') ?? '/dashboard';
  return requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/dashboard';
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') || 'email';
  const next = getSafeNext(searchParams);

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/auth/sign-in?err=${encodeURIComponent('Confirmation link is missing a token. Please request a fresh email.')}`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(`${origin}/auth/sign-in?err=${encodeURIComponent(error.message || 'Confirmation link is invalid or expired.')}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
