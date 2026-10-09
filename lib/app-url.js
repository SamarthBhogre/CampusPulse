export function getAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

export function getAuthRedirectUrl(nextPath) {
  const origin = getAppOrigin();
  const safeNextPath =
    nextPath?.startsWith('/') && !nextPath.startsWith('//')
      ? nextPath
      : '/dashboard';

  // Supabase's PKCE flow returns an authorization code, which must be
  // exchanged by the callback route before the user is redirected onward.
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath)}`;
}
