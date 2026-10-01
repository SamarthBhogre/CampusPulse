import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that suspended users can still access
const SUSPENSION_ALLOWED = [
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/auth/update-password',
  '/auth/callback',
  '/auth/confirm',
  '/api/health',
  '/suspended',
];

export async function middleware(request) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Suspension enforcement — skip for public/auth routes and API routes
  if (
    user &&
    !pathname.startsWith('/api/') &&
    !SUSPENSION_ALLOWED.some(p => pathname.startsWith(p)) &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/admin') // admins manage suspended users
  ) {
    // Only check suspension for pages that need auth — avoid extra DB call on public pages
    // We check the profiles table via a lightweight anon-key query
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_suspended')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.is_suspended === true) {
      const suspendedUrl = new URL('/suspended', request.url);
      return NextResponse.redirect(suspendedUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
