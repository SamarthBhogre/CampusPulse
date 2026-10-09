import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOwnProfile, updateOwnProfile } from '@/lib/services/profile';

/** GET /api/settings/profile — fetch current user's own profile */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const result = await getOwnProfile(supabase, user);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ profile: result.profile });
}

/** PATCH /api/settings/profile — update display name and/or username via the update_own_profile RPC */
export async function PATCH(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = await updateOwnProfile(supabase, { full_name: body.full_name, username: body.username });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ profile: result.profile });
}
