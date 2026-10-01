import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/** GET /api/settings/profile — fetch current user's own profile */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url, email, role, created_at, organizer_request_status')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    logger.error('Settings profile GET failed', error);
    return NextResponse.json({ error: 'Could not load profile' }, { status: 500 });
  }

  return NextResponse.json({ profile: { ...profile, auth_email: user.email } });
}

/** PATCH /api/settings/profile — update display name and/or username */
export async function PATCH(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { full_name, username } = body;

  // At least one field required
  if (full_name === undefined && username === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Call the security-definer RPC that validates username uniqueness
  const { data, error } = await supabase.rpc('update_own_profile', {
    p_full_name:  full_name  !== undefined ? String(full_name).trim()  : null,
    p_username:   username   !== undefined ? String(username).trim()   : null,
    p_avatar_url: null,
  });

  if (error) {
    logger.error('Settings profile PATCH failed', error);
    // Return the DB validation message if it's user-facing
    const msg = error.message?.includes('Username') || error.message?.includes('Display name')
      ? error.message
      : 'Could not update profile';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
