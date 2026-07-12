export async function ensureCurrentProfile() {
  const res = await fetch('/api/profile/ensure', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Could not load your profile');
  }

  const body = await res.json();
  return body.profile;
}
